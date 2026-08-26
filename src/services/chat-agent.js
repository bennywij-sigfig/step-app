const MAX_TOOL_CALLS = 4;
const MAX_MODEL_ROUNDS = 3;
const MAX_TOOL_WAVES = 2;

class ChatAgentProtocolError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ChatAgentProtocolError';
    this.code = 'CHAT_AGENT_PROTOCOL_ERROR';
    this.details = details;
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

    const priorPreviewCount = toolResults.filter(item => item.name === 'preview_step_entries').length;
    const previewCalls = calls.filter(call => call.name === 'preview_step_entries');
    if (priorPreviewCount + previewCalls.length > 1) {
      throw new ChatAgentProtocolError('Only one step preview may be requested at a time', {
        round,
        requestedTools: calls.map(call => call.name)
      });
    }

    const waveResults = [];
    for (const call of calls) {
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

    const preview = waveResults.find(item => item.name === 'preview_step_entries');
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
  runTrotterAgent
};
