const MAX_TOOL_CALLS = 4;

class ChatAgentProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChatAgentProtocolError';
    this.code = 'CHAT_AGENT_PROTOCOL_ERROR';
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
  const first = await model.generate({
    message,
    history,
    tone,
    tools: registry.declarations,
    observations: [],
    allowTools: true
  });
  const calls = normalizeCalls(first);
  if (calls.length === 0) {
    return {
      text: typeof first.text === 'string' ? first.text : null,
      tool_results: [],
      primary_result: null,
      requires_confirmation: false,
      rounds: 1
    };
  }
  if (calls.length > MAX_TOOL_CALLS) throw new ChatAgentProtocolError('Too many tool calls requested');

  const previewCalls = calls.filter(call => call.name === 'preview_step_entries');
  if (previewCalls.length > 1) throw new ChatAgentProtocolError('Only one step preview may be requested at a time');

  const toolResults = [];
  for (const call of calls) {
    const result = await registry.execute(call.name, call.args, context);
    toolResults.push({
      name: call.name,
      args: call.args,
      id: call.id,
      thoughtSignature: call.thoughtSignature,
      result
    });
  }
  const preview = toolResults.find(item => item.name === 'preview_step_entries');
  if (preview) {
    return {
      text: null,
      tool_results: toolResults,
      primary_result: preview.result,
      requires_confirmation: true,
      rounds: 1
    };
  }

  const second = await model.generate({
    message,
    history,
    tone,
    tools: [],
    observations: toolResults,
    allowTools: false
  });
  const secondCalls = normalizeCalls(second);
  if (secondCalls.length) {
    if (secondCalls.length !== 1 || secondCalls[0].name !== 'preview_step_entries') {
      throw new ChatAgentProtocolError('Model attempted unsupported second-round tool calls');
    }
    const call = secondCalls[0];
    const result = await registry.execute(call.name, call.args, context);
    toolResults.push({
      name: call.name,
      args: call.args,
      id: call.id,
      thoughtSignature: call.thoughtSignature,
      result
    });
    return {
      text: null,
      tool_results: toolResults,
      primary_result: result,
      requires_confirmation: true,
      rounds: 2
    };
  }

  return {
    text: typeof second.text === 'string' ? second.text : null,
    tool_results: toolResults,
    primary_result: toolResults.at(-1)?.result || null,
    requires_confirmation: false,
    rounds: 2
  };
}

module.exports = {
  ChatAgentProtocolError,
  MAX_TOOL_CALLS,
  runTrotterAgent
};
