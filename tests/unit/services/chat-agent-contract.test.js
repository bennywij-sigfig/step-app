const { createChatToolRegistry } = require('../../../src/services/chat-tools');
const { runTrotterAgent, isExplicitOwnTeamRename } = require('../../../src/services/chat-agent');

function fakeService() {
  return {
    executeIntent: jest.fn(async (userId, intent) => ({ kind: intent.intent, userId, intent })),
    previewEntries: jest.fn(async (userId, entries) => ({
      challengeId: 7,
      entries: entries.map(entry => ({ ...entry, existing_count: null, status: 'new' })),
      summary: { new: entries.length, unchanged: 0, conflicts: 0 },
      userId
    })),
    previewTeamRename: jest.fn(async (userId, newName) => ({
      kind: 'team_rename_preview', team_id: 3,
      current_name: 'Team 3', proposed_name: newName, userId
    }))
  };
}

describe('Trotter tool registry contract', () => {
  test('exposes only read and preview tools, with no commit or user-id arguments', () => {
    const registry = createChatToolRegistry({ service: fakeService() });
    const names = registry.declarations.map(tool => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'get_challenge_info',
      'get_my_steps',
      'get_individual_leaderboard',
      'get_team_leaderboard',
      'calculate_target_average',
      'calculate_overtake',
      'get_challenge_outlook',
      'get_encouragement_context',
      'preview_my_team_rename',
      'preview_step_entries'
    ]));
    expect(names.some(name => /commit|overwrite|sql|admin/i.test(name))).toBe(false);
    for (const declaration of registry.declarations) {
      expect(declaration.parameters?.properties?.user_id).toBeUndefined();
    }
    const trackingTool = registry.declarations.find(tool => tool.name === 'preview_step_entries');
    expect(trackingTool.description).toContain('track steps');
    expect(trackingTool.description).not.toMatch(/upsert|step edits/i);
  });

  test('binds preview writes to the session user and rejects injected user IDs', async () => {
    const service = fakeService();
    const registry = createChatToolRegistry({ service });
    await expect(registry.execute(
      'preview_step_entries',
      { user_id: 999, entries: [{ date: '2026-09-01', count: 8000 }] },
      { userId: 42, currentDate: '2026-09-02' }
    )).rejects.toThrow('Unsupported tool argument');
    expect(service.previewEntries).not.toHaveBeenCalled();

    await registry.execute(
      'preview_step_entries',
      { entries: [{ date: '2026-09-01', count: 8000 }] },
      { userId: 42, currentDate: '2026-09-02' }
    );
    expect(service.previewEntries).toHaveBeenCalledWith(42, [{ date: '2026-09-01', count: 8000 }]);
  });

  test('binds team rename review to the session user and rejects targeting arguments', async () => {
    const service = fakeService();
    const registry = createChatToolRegistry({ service });
    await expect(registry.execute(
      'preview_my_team_rename',
      { new_name: 'Fast Feet', team_id: 999 },
      { userId: 42, currentDate: '2026-09-01' }
    )).rejects.toThrow('Unsupported tool argument');
    expect(service.previewTeamRename).not.toHaveBeenCalled();

    const result = await registry.execute(
      'preview_my_team_rename',
      { new_name: 'Fast Feet 🏃' },
      { userId: 42, currentDate: '2026-09-01' }
    );
    expect(service.previewTeamRename).toHaveBeenCalledWith(42, 'Fast Feet 🏃');
    expect(result).toMatchObject({ current_name: 'Team 3', proposed_name: 'Fast Feet 🏃' });
  });

  test('validates preview counts and required dates before calling the service', async () => {
    const service = fakeService();
    const registry = createChatToolRegistry({ service });
    await expect(registry.execute(
      'preview_step_entries',
      { entries: [{ date: '', count: 8000 }] },
      { userId: 42, currentDate: '2026-09-02' }
    )).rejects.toThrow();
    await expect(registry.execute(
      'preview_step_entries',
      { entries: [{ date: '2026-09-01', count: 82000 }] },
      { userId: 42, currentDate: '2026-09-02' }
    )).rejects.toThrow('0 and 70,000');
    expect(service.previewEntries).not.toHaveBeenCalled();
  });

  test('rejects invalid enum values even if model-side schema validation is bypassed', async () => {
    const registry = createChatToolRegistry({ service: fakeService() });
    await expect(registry.execute(
      'get_challenge_outlook',
      { leaderboard: 'admin' },
      { userId: 42, currentDate: '2026-08-26' }
    )).rejects.toThrow('individual or team');
  });

  test('supplies authoritative current date to date-aware tools', async () => {
    const service = fakeService();
    const registry = createChatToolRegistry({ service });
    await registry.execute('get_challenge_info', {}, { userId: 42, currentDate: '2026-08-26' });
    expect(service.executeIntent).toHaveBeenCalledWith(42, {
      intent: 'challenge_info', tone: 'neutral', as_of_date: '2026-08-26'
    });
  });
});

describe('bounded Trotter tool-agent contract', () => {
  test('requires explicit own-team wording before a rename review', () => {
    expect(isExplicitOwnTeamRename('Rename my team to Fast Feet')).toBe(true);
    expect(isExplicitOwnTeamRename('Could our team be Fast Feet?')).toBe(true);
    expect(isExplicitOwnTeamRename("Rename the team I'm on to Fast Feet")).toBe(true);
    expect(isExplicitOwnTeamRename('Rename Team 7 to Fast Feet')).toBe(false);
    expect(isExplicitOwnTeamRename('Rename their team')).toBe(false);
  });
  test('answers harmless conversation in one model round without tools', async () => {
    const model = { generate: jest.fn(async () => ({ text: 'Oink and hello.', functionCalls: [] })) };
    const registry = createChatToolRegistry({ service: fakeService() });
    const result = await runTrotterAgent({
      model, registry, message: 'hi', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    });
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ text: 'Oink and hello.', rounds: 1, tool_results: [], primary_result: null });
  });

  test('executes an allowlisted read and returns a final answer in at most two rounds', async () => {
    const model = {
      generate: jest.fn()
        .mockResolvedValueOnce({
          text: null,
          functionCalls: [{
            name: 'get_challenge_info', args: {}, id: 'call-1', thoughtSignature: 'signed-thought'
          }]
        })
        .mockResolvedValueOnce({ text: 'Seven days until the challenge starts.', functionCalls: [] })
    };
    const registry = createChatToolRegistry({ service: fakeService() });
    const result = await runTrotterAgent({
      model, registry, message: 'When does it start?', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    });
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(result.rounds).toBe(2);
    expect(result.tool_results).toHaveLength(1);
    expect(model.generate.mock.calls[1][0].observations[0]).toMatchObject({
      id: 'call-1', thoughtSignature: 'signed-thought'
    });
    expect(result.primary_result.kind).toBe('challenge_info');
    expect(result.text).toContain('Seven days');
  });

  test('bypasses the model for an explicit valid entry and lets the service enforce challenge dates', async () => {
    const model = { generate: jest.fn() };
    const service = fakeService();
    const registry = createChatToolRegistry({ service });
    const result = await runTrotterAgent({
      model, registry, message: 'log 9999 steps for today', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    });

    expect(model.generate).not.toHaveBeenCalled();
    expect(service.previewEntries).toHaveBeenCalledWith(42, [{ date: '2026-08-26', count: 9999 }]);
    expect(result).toMatchObject({ requires_confirmation: true, rounds: 0, primary_result: { kind: 'step_preview' } });
  });

  test('team rename reviews stop before the model can claim a write', async () => {
    const model = { generate: jest.fn(async () => ({
      text: 'I renamed it.',
      functionCalls: [{ name: 'preview_my_team_rename', args: { new_name: 'Fast Feet' } }]
    })) };
    const registry = createChatToolRegistry({ service: fakeService() });
    const result = await runTrotterAgent({
      model, registry, message: 'Rename my team Fast Feet', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-09-01' }
    });
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      text: null, requires_confirmation: true,
      primary_result: { kind: 'team_rename_preview', proposed_name: 'Fast Feet' }
    });
  });

  test('returns deterministic previews immediately and never asks the model to claim a write', async () => {
    const model = {
      generate: jest.fn(async () => ({
        text: 'I saved it.',
        functionCalls: [{
          name: 'preview_step_entries',
          args: { entries: [{ date: '2026-09-01', count: 8000 }] }
        }]
      }))
    };
    const registry = createChatToolRegistry({ service: fakeService() });
    const result = await runTrotterAgent({
      model, registry, message: 'Log 8000 for Sep 1', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-09-02' }
    });
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(result.text).toBeNull();
    expect(result.requires_confirmation).toBe(true);
    expect(result.primary_result.kind).toBe('step_preview');
  });

  test('rejects multiple preview calls in one submission', async () => {
    const model = {
      generate: jest.fn(async () => ({
        text: null,
        functionCalls: [
          { name: 'preview_step_entries', args: { entries: [{ date: '2026-09-01', count: 1 }] } },
          { name: 'preview_step_entries', args: { entries: [{ date: '2026-09-02', count: 2 }] } }
        ]
      }))
    };
    const registry = createChatToolRegistry({ service: fakeService() });
    await expect(runTrotterAgent({
      model, registry, message: 'make two previews', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-09-01' }
    })).rejects.toThrow('Only one change review');
  });

  test('allows a second-round preview when a read observation was needed first', async () => {
    const model = {
      generate: jest.fn()
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_challenge_info', args: {} }] })
        .mockResolvedValueOnce({
          text: null,
          functionCalls: [{
            name: 'preview_step_entries',
            args: { entries: [{ date: '2026-09-01', count: 8000 }] }
          }]
        })
    };
    const registry = createChatToolRegistry({ service: fakeService() });
    const result = await runTrotterAgent({
      model, registry, message: 'today', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-09-01' }
    });
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(result.requires_confirmation).toBe(true);
    expect(result.primary_result.kind).toBe('step_preview');
    expect(result.tool_results.map(item => item.name)).toEqual([
      'get_challenge_info', 'preview_step_entries'
    ]);
  });

  test('allows two bounded read-tool waves and a third-round final response', async () => {
    const registry = createChatToolRegistry({ service: fakeService() });
    const model = {
      generate: jest.fn()
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_challenge_info', args: {} }] })
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_team_leaderboard', args: {} }] })
        .mockResolvedValueOnce({ text: 'Here is the combined answer.', functionCalls: [] })
    };
    const result = await runTrotterAgent({
      model, registry, message: 'and then?', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    });
    expect(model.generate).toHaveBeenCalledTimes(3);
    expect(result.rounds).toBe(3);
    expect(result.tool_results.map(item => item.name)).toEqual([
      'get_challenge_info', 'get_team_leaderboard'
    ]);
  });

  test('enforces four total calls, two tool waves, and no final-round tools', async () => {
    const registry = createChatToolRegistry({ service: fakeService() });
    const tooManyModel = {
      generate: jest.fn(async () => ({
        text: null,
        functionCalls: Array.from({ length: 5 }, () => ({ name: 'get_challenge_info', args: {} }))
      }))
    };
    await expect(runTrotterAgent({
      model: tooManyModel, registry, message: 'do everything', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    })).rejects.toThrow('Too many tool calls');

    const finalRoundToolModel = {
      generate: jest.fn()
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_challenge_info', args: {} }] })
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_team_leaderboard', args: {} }] })
        .mockResolvedValueOnce({ text: null, functionCalls: [{ name: 'get_my_steps', args: {} }] })
    };
    await expect(runTrotterAgent({
      model: finalRoundToolModel, registry, message: 'keep going', history: [], tone: 'neutral',
      context: { userId: 42, currentDate: '2026-08-26' }
    })).rejects.toThrow('after the final tool wave');
    expect(finalRoundToolModel.generate).toHaveBeenCalledTimes(3);
  });
});
