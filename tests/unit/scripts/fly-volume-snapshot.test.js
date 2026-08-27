const {
  createAttachedVolumeSnapshot,
  selectAttachedVolume
} = require('../../../src/scripts/fly-volume-snapshot');

describe('Fly volume snapshot selection', () => {
  test('selects the single attached volume regardless of its name', () => {
    expect(selectAttachedVolume([
      { id: 'vol_old', name: 'data', attached_machine_id: null },
      { id: 'vol_live', name: 'data_revival', attached_machine_id: 'machine-1' }
    ])).toMatchObject({ id: 'vol_live', name: 'data_revival' });
  });

  test.each([
    [[], 0],
    [[
      { id: 'vol_1', attached_machine_id: 'machine-1' },
      { id: 'vol_2', attached_machine_id: 'machine-2' }
    ], 2]
  ])('fails closed when attached volume selection is ambiguous', (volumes, count) => {
    expect(() => selectAttachedVolume(volumes)).toThrow(
      `Expected exactly one attached Fly volume, found ${count}`
    );
  });

  test('creates and waits for a new snapshot of the attached volume', async () => {
    const calls = [];
    const responses = [
      JSON.stringify([
        { id: 'vol_old', name: 'data', attached_machine_id: null },
        { id: 'vol_live', name: 'data_revival', attached_machine_id: 'machine-1' }
      ]),
      JSON.stringify([{ id: 'snap_old', status: 'created' }]),
      '',
      JSON.stringify([
        { id: 'snap_old', status: 'created' },
        { id: 'snap_new', status: 'running' }
      ]),
      JSON.stringify([
        { id: 'snap_old', status: 'created' },
        { id: 'snap_new', status: 'created', retention_days: 30 }
      ])
    ];
    const exec = jest.fn((command, args, options) => {
      calls.push({ command, args, options });
      return responses.shift();
    });
    let currentTime = 0;

    const result = await createAttachedVolumeSnapshot({
      exec,
      now: () => currentTime,
      wait: async ms => { currentTime += ms; },
      timeoutMs: 10000,
      pollIntervalMs: 10
    });

    expect(result).toMatchObject({
      volume: { id: 'vol_live', name: 'data_revival' },
      snapshot: { id: 'snap_new', status: 'created', retention_days: 30 }
    });
    expect(calls[2]).toMatchObject({
      command: 'fly',
      args: ['volumes', 'snapshots', 'create', 'vol_live'],
      options: { stdio: 'inherit' }
    });
  });

  test('does not request a snapshot when there is no attached volume', async () => {
    const exec = jest.fn(() => JSON.stringify([{ id: 'vol_old', attached_machine_id: null }]));

    await expect(createAttachedVolumeSnapshot({ exec })).rejects.toThrow(
      'Expected exactly one attached Fly volume, found 0'
    );
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
