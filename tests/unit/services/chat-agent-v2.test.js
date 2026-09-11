const {
  MAX_MODEL_TURNS,
  MAX_TOOL_CALLS,
  runNativeTrotterAgent
} = require('../../../src/services/chat-agent-v2');

function registry() {
  return {
    declarations: [
      { name: 'read_a', parameters: { type: 'object', properties: {} } },
      { name: 'read_b', parameters: { type: 'object', properties: {} } },
      { name: 'calculate_overtake', parameters: { type: 'object', properties: {} } },
      { name: 'preview_step_entries', parameters: { type: 'object', properties: {} } }
    ],
    execute: jest.fn(async (name, args) => {
      if (name === 'calculate_overtake') {
        return {
          kind: 'overtake',
          target: { name: args.target_name, average: 10000 },
          days: 3,
          required_total: 33000,
          required_daily_average: 11000,
          feasible_under_daily_limit: true
        };
      }
      if (name === 'preview_step_entries') return { kind: 'step_preview', entries: args.entries };
      return { kind: 'read', name, args };
    })
  };
}

const baseRequest = {
  message: 'Help me plan this',
  history: [],
  tone: 'neutral',
  context: { userId: 42, currentDate: '2026-09-11' }
};

describe('Trotter v2 model-native agent loop', () => {
  test('allows flexible planning until the model produces a final response', async () => {
    const tools = registry();
    const model = {
      generate: jest.fn()
        .mockResolvedValueOnce({
          text: null, functionCalls: [{ name: 'read_a', args: {} }],
          metadata: { finish_reason: 'STOP', prompt_tokens: 100, response_tokens: 10, thought_tokens: 20, total_tokens: 130 }
        })
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'read_b', args: { scope: 'current' } }] })
        .mockResolvedValueOnce({ text: 'Here is the answer.', functionCalls: [] })
    };
    const telemetry = jest.fn();

    const result = await runNativeTrotterAgent({
      ...baseRequest,
      context: baseRequest.context,
      requestReference: 'TROT-TEST01',
      model,
      registry: tools,
      telemetry
    });

    expect(result).toMatchObject({ text: 'Here is the answer.', rounds: 3, requires_confirmation: false });
    expect(result.tool_results.map(item => item.name)).toEqual(['read_a', 'read_b']);
    expect(model.generate.mock.calls[1][0].observations[0].result).toMatchObject({ name: 'read_a' });
    expect(telemetry.mock.calls.map(call => call[0].event)).toEqual([
      'request_started',
      'model_call_complete', 'tool_call_complete',
      'model_call_complete', 'tool_call_complete',
      'model_call_complete', 'request_complete'
    ]);
    expect(telemetry.mock.calls[1][0]).toMatchObject({
      reference: 'TROT-TEST01', turn: 1, outcome: 'success', finish_reason: 'STOP',
      prompt_tokens: 100, response_tokens: 10, thought_tokens: 20, total_tokens: 130
    });
    expect(telemetry.mock.calls.at(-1)[0]).toMatchObject({
      reference: 'TROT-TEST01', outcome: 'success', turns: 3, tool_calls: 2,
      total_tokens: 130, result_kind: 'read'
    });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain(baseRequest.message);
  });

  test('aggregates multiple authoritative overtake calculations for deterministic rendering', async () => {
    const tools = registry();
    const model = {
      generate: jest.fn()
        .mockResolvedValueOnce({
          text: null,
          functionCalls: [
            { name: 'calculate_overtake', args: { target_name: 'Shashi' } },
            { name: 'calculate_overtake', args: { target_name: 'Anurag' } }
          ]
        })
        .mockResolvedValueOnce({ text: 'Comparison complete.', functionCalls: [] })
    };

    const result = await runNativeTrotterAgent({ ...baseRequest, model, registry: tools });

    expect(result.primary_result.kind).toBe('overtake_comparison');
    expect(result.primary_result.results.map(item => item.target.name)).toEqual(['Shashi', 'Anurag']);
  });

  test('returns proposals immediately and never asks the model to commit them', async () => {
    const tools = registry();
    const model = {
      generate: jest.fn(async () => ({
        text: null,
        functionCalls: [{
          name: 'preview_step_entries',
          args: { entries: [{ date: '2026-09-10', count: 9000 }] }
        }]
      }))
    };

    const result = await runNativeTrotterAgent({ ...baseRequest, model, registry: tools });

    expect(result).toMatchObject({ requires_confirmation: true, rounds: 1 });
    expect(result.primary_result.kind).toBe('step_preview');
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  test('records finish metadata when an empty model response fails', async () => {
    const telemetry = jest.fn();
    const model = {
      generate: jest.fn(async () => ({
        text: null,
        functionCalls: [],
        metadata: { finish_reason: 'MAX_TOKENS', thought_tokens: 1200, total_tokens: 1200 }
      }))
    };

    await expect(runNativeTrotterAgent({
      ...baseRequest, model, registry: registry(), telemetry
    })).rejects.toMatchObject({
      code: 'CHAT_AGENT_PROTOCOL_ERROR',
      details: { turn: 1, finishReason: 'MAX_TOKENS' }
    });
    expect(telemetry.mock.calls.at(-1)[0]).toMatchObject({
      event: 'request_complete', outcome: 'failure', turns: 1,
      total_tokens: 1200, error_code: 'CHAT_AGENT_PROTOCOL_ERROR'
    });
  });

  test('rejects repeated calls and keeps hard turn and call budgets', async () => {
    expect(MAX_MODEL_TURNS).toBe(6);
    expect(MAX_TOOL_CALLS).toBe(8);
    const tools = registry();
    const model = {
      generate: jest.fn(async () => ({ text: null, functionCalls: [{ name: 'read_a', args: {} }] }))
    };

    await expect(runNativeTrotterAgent({ ...baseRequest, model, registry: tools }))
      .rejects.toMatchObject({ code: 'CHAT_AGENT_PROTOCOL_ERROR', message: 'Model repeated an identical tool call' });
    expect(tools.execute).toHaveBeenCalledTimes(1);
  });
});
