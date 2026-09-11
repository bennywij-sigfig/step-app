const { ChatAgentProtocolError } = require('./chat-agent');

const MAX_MODEL_TURNS = 6;
const MAX_TOOL_CALLS = 8;
const PREVIEW_TOOLS = new Set(['preview_step_entries', 'preview_my_team_rename']);

function normalizeCalls(response) {
  if (!response || typeof response !== 'object') {
    throw new ChatAgentProtocolError('Invalid model response');
  }
  if (!Array.isArray(response.functionCalls)) return [];
  return response.functionCalls.map(call => {
    if (!call || typeof call.name !== 'string' || !call.name) {
      throw new ChatAgentProtocolError('Invalid tool call');
    }
    return {
      name: call.name,
      args: call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {},
      id: typeof call.id === 'string' ? call.id : null,
      thoughtSignature: typeof call.thoughtSignature === 'string' ? call.thoughtSignature : null
    };
  });
}

function callFingerprint(call) {
  const sortedArgs = Object.keys(call.args).sort().reduce((result, key) => {
    result[key] = call.args[key];
    return result;
  }, {});
  return `${call.name}:${JSON.stringify(sortedArgs)}`;
}

async function runNativeTrotterAgent({
  model,
  registry,
  message,
  history,
  tone,
  context,
  requestReference = null,
  telemetry = () => {},
  now = () => Date.now()
}) {
  const toolResults = [];
  const seenCalls = new Set();
  const startedAt = now();
  let pendingObservations = [];
  let totalToolCalls = 0;
  let previewCount = 0;
  let currentTurn = 0;
  let totalTokens = 0;

  const emit = event => {
    try {
      telemetry({
        reference: requestReference,
        ...event
      });
    } catch (_) {
      // Telemetry must never affect the user request.
    }
  };
  const complete = (payload, outcome = 'success') => {
    emit({
      event: 'request_complete',
      outcome,
      duration_ms: Math.max(0, now() - startedAt),
      turns: currentTurn,
      tool_calls: totalToolCalls,
      total_tokens: totalTokens,
      result_kind: payload?.primary_result?.kind || (payload?.text ? 'text' : null)
    });
    return payload;
  };

  emit({ event: 'request_started' });
  try {
    for (let turn = 1; turn <= MAX_MODEL_TURNS; turn += 1) {
      currentTurn = turn;
      const allowTools = turn < MAX_MODEL_TURNS && totalToolCalls < MAX_TOOL_CALLS;
      const modelStartedAt = now();
      let response;
      try {
        response = await model.generate({
          message,
          history,
          tone,
          tools: allowTools ? registry.declarations : [],
          observations: pendingObservations,
          allowTools
        });
      } catch (error) {
        emit({
          event: 'model_call_complete', turn, outcome: 'failure',
          duration_ms: Math.max(0, now() - modelStartedAt),
          error_code: error.code || 'MODEL_ERROR'
        });
        throw error;
      }

      const calls = normalizeCalls(response);
      const metadata = response.metadata || {};
      totalTokens += Number(metadata.total_tokens) || 0;
      emit({
        event: 'model_call_complete',
        turn,
        outcome: 'success',
        duration_ms: Math.max(0, now() - modelStartedAt),
        tool_calls_requested: calls.length,
        has_text: typeof response.text === 'string' && response.text.trim().length > 0,
        finish_reason: metadata.finish_reason || null,
        prompt_tokens: Number(metadata.prompt_tokens) || 0,
        response_tokens: Number(metadata.response_tokens) || 0,
        thought_tokens: Number(metadata.thought_tokens) || 0,
        total_tokens: Number(metadata.total_tokens) || 0
      });

      if (calls.length === 0) {
        const text = typeof response.text === 'string' ? response.text.trim() : '';
        if (!text) {
          throw new ChatAgentProtocolError('Model returned neither text nor a tool call', {
            turn,
            finishReason: metadata.finish_reason || null
          });
        }
        const overtakeResults = toolResults
          .map(item => item.result)
          .filter(result => result?.kind === 'overtake');
        const primaryResult = overtakeResults.length > 1
          ? { kind: 'overtake_comparison', results: overtakeResults }
          : toolResults.at(-1)?.result || null;
        return complete({
          text,
          tool_results: toolResults,
          primary_result: primaryResult,
          requires_confirmation: false,
          rounds: turn
        });
      }

      if (!allowTools) {
        throw new ChatAgentProtocolError('Model attempted tool calls after the tool budget was exhausted', {
          turn,
          requestedTools: calls.map(call => call.name)
        });
      }
      if (totalToolCalls + calls.length > MAX_TOOL_CALLS) {
        throw new ChatAgentProtocolError('Too many tool calls requested', {
          turn,
          totalToolCalls,
          requestedTools: calls.map(call => call.name)
        });
      }

      const waveResults = [];
      for (const call of calls) {
        const fingerprint = callFingerprint(call);
        if (seenCalls.has(fingerprint)) {
          throw new ChatAgentProtocolError('Model repeated an identical tool call', {
            turn,
            requestedTool: call.name
          });
        }
        seenCalls.add(fingerprint);

        if (PREVIEW_TOOLS.has(call.name)) {
          previewCount += 1;
          if (previewCount > 1) {
            throw new ChatAgentProtocolError('Only one change review may be requested at a time', {
              turn,
              requestedTool: call.name
            });
          }
        }

        const toolStartedAt = now();
        let result;
        try {
          result = await registry.execute(call.name, call.args, context);
          emit({
            event: 'tool_call_complete', turn, tool: call.name, outcome: 'success',
            duration_ms: Math.max(0, now() - toolStartedAt), result_kind: result?.kind || null
          });
        } catch (error) {
          emit({
            event: 'tool_call_complete', turn, tool: call.name, outcome: 'failure',
            duration_ms: Math.max(0, now() - toolStartedAt), error_code: error.code || 'TOOL_ERROR'
          });
          throw error;
        }
        const observation = {
          name: call.name,
          args: call.args,
          id: call.id,
          thoughtSignature: call.thoughtSignature,
          result
        };
        waveResults.push(observation);
        toolResults.push(observation);
        totalToolCalls += 1;
      }

      const preview = waveResults.find(item => PREVIEW_TOOLS.has(item.name));
      if (preview) {
        return complete({
          text: null,
          tool_results: toolResults,
          primary_result: preview.result,
          requires_confirmation: true,
          rounds: turn
        });
      }
      pendingObservations = waveResults;
    }

    throw new ChatAgentProtocolError('Model did not produce a final response within the turn limit', {
      turns: MAX_MODEL_TURNS,
      totalToolCalls
    });
  } catch (error) {
    emit({
      event: 'request_complete',
      outcome: 'failure',
      duration_ms: Math.max(0, now() - startedAt),
      turns: currentTurn,
      tool_calls: totalToolCalls,
      total_tokens: totalTokens,
      error_code: error.code || 'AGENT_ERROR'
    });
    throw error;
  }
}

module.exports = {
  MAX_MODEL_TURNS,
  MAX_TOOL_CALLS,
  runNativeTrotterAgent
};
