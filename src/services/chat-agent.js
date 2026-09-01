const { teamNameKey } = require('../utils/team-name');

const MAX_TOOL_CALLS = 4;
const MAX_MODEL_ROUNDS = 3;
const MAX_TOOL_WAVES = 2;
const PREVIEW_TOOLS = new Set(['preview_step_entries', 'preview_my_team_rename']);

class ChatAgentProtocolError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ChatAgentProtocolError';
    this.code = 'CHAT_AGENT_PROTOCOL_ERROR';
    this.details = details;
  }
}

function parseDirectStepRequest(message, currentDate) {
  const match = String(message || '').match(
    /^\s*(?:log|record|add)\s+(\d+|\d{1,3}(?:,\d{3})+)\s+steps?\s+(?:for|on)\s+(today|yesterday|\d{4}-\d{2}-\d{2})[.!]?\s*$/i
  );
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(currentDate || '')) return null;

  const digits = match[1].replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const count = Number(digits);
  if (!Number.isSafeInteger(count) || count < 0 || count > 70000) return null;

  let date = match[2].toLowerCase();
  if (date === 'today') date = currentDate;
  if (date === 'yesterday') {
    const priorDate = new Date(`${currentDate}T00:00:00Z`);
    priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    date = priorDate.toISOString().slice(0, 10);
  }
  return { date, count };
}

function isExplicitOwnTeamRename(message, currentTeamName = null) {
  const text = String(message || '');
  if (!/\b(?:rename|change|call)\b/i.test(text)) return false;
  if (/\b(?:my|our)\s+team\b/i.test(text)
    || /\bteam\s+(?:i(?:'m| am)|we(?:'re| are))\s+(?:on|in)\b/i.test(text)) return true;

  const namedTarget = text.match(/^\s*(?:rename|change)\s+(.+?)\s+to\b/i)?.[1]?.trim();
  if (!namedTarget || !currentTeamName) return false;
  try {
    return teamNameKey(namedTarget) === teamNameKey(currentTeamName);
  } catch (_) {
    return false;
  }
}

function normalizeCalls(response) {
  if (!response || typeof response !== 'object') throw new ChatAgentProtocolError('Invalid model response');
  if (!Array.isArray(response.functionCalls)) return [];
  return response.functionCalls.map(call => {
    if (!call || typeof call.name !== 'string' || !call.name) {
      throw new ChatAgentProtocolError('Invalid tool call');
    }
    return {
      name: call.name,
      args: call.args && typeof call.args === 'object' ? call.args : {},
      id: typeof call.id === 'string' ? call.id : null,
      thoughtSignature: typeof call.thoughtSignature === 'string' ? call.thoughtSignature : null
    };
  });
}

async function runTrotterAgent({ model, registry, message, history, tone, context }) {
  // Keep the most common explicit write phrasing deterministic. This prevents
  // the language model from turning a valid count (for example 9,999) into an
  // unrelated range error; the service remains authoritative for date bounds.
  const directEntry = parseDirectStepRequest(message, context?.currentDate);
  if (directEntry) {
    const result = await registry.execute('preview_step_entries', { entries: [directEntry] }, context);
    return {
      text: null,
      tool_results: [{ name: 'preview_step_entries', args: { entries: [directEntry] }, result }],
      primary_result: result,
      requires_confirmation: true,
      rounds: 0
    };
  }

  const toolResults = [];
  let pendingObservations = [];
  let totalToolCalls = 0;
  let toolWaves = 0;

  for (let round = 1; round <= MAX_MODEL_ROUNDS; round += 1) {
    const allowTools = toolWaves < MAX_TOOL_WAVES && round < MAX_MODEL_ROUNDS;
    const response = await model.generate({
      message,
      history,
      tone,
      tools: allowTools ? registry.declarations : [],
      observations: pendingObservations,
      allowTools
    });
    const calls = normalizeCalls(response);

    if (calls.length === 0) {
      return {
        text: typeof response.text === 'string' ? response.text : null,
        tool_results: toolResults,
        primary_result: toolResults.at(-1)?.result || null,
        requires_confirmation: false,
        rounds: round
      };
    }
    if (!allowTools) {
      throw new ChatAgentProtocolError('Model attempted tool calls after the final tool wave', {
        round,
        requestedTools: calls.map(call => call.name)
      });
    }
    if (totalToolCalls + calls.length > MAX_TOOL_CALLS) {
      throw new ChatAgentProtocolError('Too many tool calls requested', {
        round,
        totalToolCalls,
        requestedTools: calls.map(call => call.name)
      });
    }

    const priorPreviewCount = toolResults.filter(item => PREVIEW_TOOLS.has(item.name)).length;
    const previewCalls = calls.filter(call => PREVIEW_TOOLS.has(call.name));
    if (priorPreviewCount + previewCalls.length > 1) {
      throw new ChatAgentProtocolError('Only one change review may be requested at a time', {
        round,
        requestedTools: calls.map(call => call.name)
      });
    }

    const waveResults = [];
    for (const call of calls) {
      if (call.name === 'preview_my_team_rename' && !isExplicitOwnTeamRename(message, context?.currentTeamName)) {
        throw new ChatAgentProtocolError('Team rename requires an explicit request about the user’s own team', {
          requestedTool: call.name
        });
      }
      const result = await registry.execute(call.name, call.args, context);
      const observation = {
        name: call.name,
        args: call.args,
        id: call.id,
        thoughtSignature: call.thoughtSignature,
        result
      };
      waveResults.push(observation);
      toolResults.push(observation);
    }
    totalToolCalls += calls.length;
    toolWaves += 1;

    const preview = waveResults.find(item => PREVIEW_TOOLS.has(item.name));
    if (preview) {
      return {
        text: null,
        tool_results: toolResults,
        primary_result: preview.result,
        requires_confirmation: true,
        rounds: round
      };
    }
    pendingObservations = waveResults;
  }

  throw new ChatAgentProtocolError('Model did not produce a final response within the round limit', {
    rounds: MAX_MODEL_ROUNDS,
    totalToolCalls
  });
}

module.exports = {
  ChatAgentProtocolError,
  MAX_MODEL_ROUNDS,
  MAX_TOOL_CALLS,
  MAX_TOOL_WAVES,
  parseDirectStepRequest,
  isExplicitOwnTeamRename,
  runTrotterAgent
};
