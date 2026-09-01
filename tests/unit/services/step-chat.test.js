const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStepChatService } = require('../../../src/services/step-chat');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

describe('Step Chat deterministic write service', () => {
  let db;
  let service;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await run(db, `CREATE TABLE teams (
      id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL
    )`);
    await run(db, `CREATE TABLE users (
      id INTEGER PRIMARY KEY, name TEXT, team_id INTEGER REFERENCES teams(id), archived_at DATETIME
    )`);
    await run(db, `CREATE TABLE challenges (
      id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT,
      is_active BOOLEAN, reporting_threshold INTEGER, timezone TEXT
    )`);
    await run(db, `CREATE TABLE steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL,
      count INTEGER NOT NULL, challenge_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, date)
    )`);
    await run(db, `INSERT INTO teams (id, name) VALUES (1, 'Team A')`);
    await run(db, 'INSERT INTO users (id, name, team_id) VALUES (1, ?, 1), (2, ?, NULL)', ['Tester', 'Target']);
    await run(db, `INSERT INTO challenges
      (id, name, start_date, end_date, is_active, reporting_threshold, timezone)
      VALUES (9, 'Test Challenge', '2025-01-01', '2025-12-31', 1, 70, 'America/Los_Angeles')`);
    await run(db, `INSERT INTO steps (user_id, date, count, challenge_id)
      VALUES (1, '2025-08-20', 5000, 9), (1, '2025-08-21', 6000, 9)`);

    service = createStepChatService({
      db,
      getIndividualLeaderboard: async () => ({ ranked: [], unranked: [] }),
      getTeamLeaderboard: async () => ({ ranked: [], unranked: [] })
    });
  });

  afterEach(() => new Promise(resolve => db.close(resolve)));

  test('classifies new, unchanged, and conflicting entries', async () => {
    const preview = await service.previewEntries(1, [
      { date: '2025-08-19', count: 4000 },
      { date: '2025-08-20', count: 5000 },
      { date: '2025-08-21', count: 6500 }
    ]);

    expect(preview.summary).toEqual({ new: 1, unchanged: 1, conflicts: 1 });
    expect(preview.entries.map(entry => entry.status)).toEqual(['new', 'unchanged', 'conflict']);
  });

  test('new-only confirmation does not overwrite a conflict', async () => {
    const plan = await service.previewEntries(1, [
      { date: '2025-08-19', count: 4000 },
      { date: '2025-08-20', count: 9000 }
    ]);
    const result = await service.commitPlan(1, plan, 'new_only');

    expect(result.saved).toBe(1);
    expect((await get(db, `SELECT count FROM steps WHERE user_id = 1 AND date = '2025-08-19'`)).count).toBe(4000);
    expect((await get(db, `SELECT count FROM steps WHERE user_id = 1 AND date = '2025-08-20'`)).count).toBe(5000);
  });

  test('explicit overwrite updates conflicts', async () => {
    const plan = await service.previewEntries(1, [{ date: '2025-08-20', count: 9000 }]);
    const result = await service.commitPlan(1, plan, 'overwrite_conflicts');

    expect(result.saved).toBe(1);
    expect((await get(db, `SELECT count FROM steps WHERE user_id = 1 AND date = '2025-08-20'`)).count).toBe(9000);
  });

  test('rejects a plan when data changed after preview', async () => {
    const plan = await service.previewEntries(1, [{ date: '2025-08-20', count: 9000 }]);
    await run(db, `UPDATE steps SET count = 7000 WHERE user_id = 1 AND date = '2025-08-20'`);

    await expect(service.commitPlan(1, plan, 'overwrite_conflicts')).rejects.toThrow('changed after the preview');
    expect((await get(db, `SELECT count FROM steps WHERE user_id = 1 AND date = '2025-08-20'`)).count).toBe(7000);
  });

  test('defaults personal averages and history to the active challenge', async () => {
    await run(db, `INSERT INTO steps (user_id, date, count, challenge_id) VALUES (1, '2024-08-20', 50000, NULL)`);

    const result = await service.executeIntent(1, {
      intent: 'show_my_steps', tone: 'neutral', start_date: null, end_date: null
    });

    expect(result.scope).toBe('active_challenge');
    expect(result.challenge.id).toBe(9);
    expect(result.summary).toEqual({ total_steps: 11000, days_logged: 2, daily_average: 5500 });
    expect(result.entries.map(entry => entry.date)).not.toContain('2024-08-20');
  });

  test('answers challenge timing and encouragement without broadening permissions', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-08-25T12:00:00-07:00'));
    try {
      const timing = await service.executeIntent(1, { intent: 'challenge_info', tone: 'neutral' });
      expect(timing).toMatchObject({
        kind: 'challenge_info', has_challenge: true, status: 'active', current_day: 238,
        total_days: 365, remaining_days: 128
      });

      const beforeStart = await service.executeIntent(1, {
        intent: 'challenge_info', as_of_date: '2024-12-20', tone: 'neutral'
      });
      expect(beforeStart).toMatchObject({
        status: 'upcoming', as_of_date: '2024-12-20', current_day: 0, days_until_start: 12
      });

      const tomorrow = await service.executeIntent(1, {
        intent: 'challenge_info', as_of_date: '2025-08-26', tone: 'neutral'
      });
      expect(tomorrow).toMatchObject({
        status: 'active', as_of_date: '2025-08-26', current_day: 238,
        remaining_days: 128, days_until_start: 0, days_until_end: 127
      });

      const finalDay = await service.executeIntent(1, {
        intent: 'challenge_info', as_of_date: '2025-12-31', tone: 'neutral'
      });
      expect(finalDay).toMatchObject({
        status: 'active', current_day: 365, remaining_days: 1, days_until_end: 0
      });

      const afterEnd = await service.executeIntent(1, {
        intent: 'challenge_info', as_of_date: '2026-01-01', tone: 'neutral'
      });
      expect(afterEnd).toMatchObject({ status: 'ended', remaining_days: 0, days_until_end: 0 });

      const encouragement = await service.executeIntent(1, { intent: 'encouragement', tone: 'droll' });
      expect(encouragement).toMatchObject({
        kind: 'encouragement', scope: 'active_challenge',
        summary: { total_steps: 11000, days_logged: 2, daily_average: 5500 }
      });
      expect(await service.executeIntent(1, { intent: 'step_chitchat', tone: 'droll' }))
        .toEqual({ kind: 'chitchat' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('resolves the authenticated user team through the normalized relation', async () => {
    const teamService = createStepChatService({
      db,
      getIndividualLeaderboard: async () => ({ ranked: [], unranked: [] }),
      getTeamLeaderboard: async () => ({
        ranked: [{ team: 'Team A', team_steps_per_day_reported: 9000 }],
        unranked: []
      })
    });
    const result = await teamService.executeIntent(1, {
      intent: 'challenge_outlook', leaderboard: 'team', as_of_date: '2025-08-25', tone: 'neutral'
    });
    expect(result).toMatchObject({ has_entry: true, name: 'Team A', ranked: true, rank: 1 });
  });

  test('asks deterministic follow-ups for incomplete or invalid step requests', async () => {
    await expect(service.executeIntent(1, { intent: 'help', reason: 'missing_date', tone: 'neutral' }))
      .resolves.toEqual({
        kind: 'help',
        message: 'What date should I use? You can say today, yesterday, or give me a specific date.'
      });
    const invalid = await service.executeIntent(1, { intent: 'help', reason: 'invalid_count', tone: 'neutral' });
    expect(invalid.message).toContain('0 and 70,000');
  });

  test('calculates the pace needed to reach a target logged-day average', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-08-25T12:00:00-07:00'));
    try {
      const result = await service.executeIntent(1, {
        intent: 'calculate_target_average', target_average: 10000, days: 2, tone: 'neutral'
      });

      expect(result).toMatchObject({
        kind: 'target_average',
        target_average: 10000,
        days: 2,
        required_total: 29000,
        required_daily_average: 14500,
        feasible_under_daily_limit: true
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('a rolled-back chat transaction cannot roll back an unrelated write', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-chat-transaction-'));
    const dbPath = path.join(tempDir, 'steps.db');
    const mainDb = new sqlite3.Database(dbPath);
    const mainRun = (sql, params = []) => new Promise((resolve, reject) => mainDb.run(sql, params, error => error ? reject(error) : resolve()));
    const mainGet = (sql, params = []) => new Promise((resolve, reject) => mainDb.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    let unrelatedWrite;

    try {
      await mainRun('CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
      await mainRun('CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, team_id INTEGER, archived_at TEXT)');
      await mainRun('CREATE TABLE challenges(id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT, is_active INTEGER, reporting_threshold INTEGER, timezone TEXT)');
      await mainRun('CREATE TABLE steps(id INTEGER PRIMARY KEY, user_id INTEGER, date TEXT, count INTEGER, challenge_id INTEGER, updated_at TEXT, UNIQUE(user_id,date))');
      await mainRun("INSERT INTO users(id,name,team_id,archived_at) VALUES(1,'chat-user',NULL,NULL),(2,'other-user',NULL,NULL)");
      await mainRun("INSERT INTO challenges VALUES(1,'current','2025-01-01','2025-12-31',1,70,'America/Los_Angeles')");
      await mainRun("INSERT INTO steps(user_id,date,count,challenge_id) VALUES(1,'2025-08-20',5000,1)");

      const isolatedService = createStepChatService({
        db: mainDb,
        getIndividualLeaderboard: async () => ({ ranked: [], unranked: [] }),
        getTeamLeaderboard: async () => ({ ranked: [], unranked: [] }),
        createTransactionConnection: () => new Promise((resolve, reject) => {
          const connection = new sqlite3.Database(dbPath, error => {
            if (error) return reject(error);
            connection.configure('busyTimeout', 2000);
            const wrapped = {
              get: (...args) => connection.get(...args),
              all: (...args) => connection.all(...args),
              close: callback => connection.close(callback),
              run(sql, ...args) {
                const callback = args[args.length - 1];
                if (sql === 'BEGIN IMMEDIATE TRANSACTION') {
                  args[args.length - 1] = function(error) {
                    if (!error) {
                      unrelatedWrite = mainRun("INSERT INTO steps(user_id,date,count,challenge_id) VALUES(2,'2025-08-21',2222,1)");
                    }
                    callback.call(this, error);
                  };
                }
                return connection.run(sql, ...args);
              }
            };
            resolve(wrapped);
          });
        })
      });

      const plan = await isolatedService.previewEntries(1, [{ date: '2025-08-20', count: 9000 }]);
      await mainRun("UPDATE steps SET count=6000 WHERE user_id=1 AND date='2025-08-20'");
      await expect(isolatedService.commitPlan(1, plan, 'overwrite_conflicts')).rejects.toThrow('changed after the preview');
      await unrelatedWrite;
      expect(await mainGet("SELECT count FROM steps WHERE user_id=2 AND date='2025-08-21'")).toEqual({ count: 2222 });
    } finally {
      await new Promise(resolve => mainDb.close(() => resolve()));
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('projections use their authoritative as-of date and reject post-challenge calculations', async () => {
    await expect(service.executeIntent(1, {
      intent: 'calculate_target_average', target_average: 10000, days: null,
      as_of_date: '2026-01-01', tone: 'neutral'
    })).rejects.toThrow('challenge has ended');
  });

  test('default projections exclude remaining dates that are already logged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-08-25T12:00:00-07:00'));
    try {
      await run(db, `INSERT INTO steps (user_id, date, count, challenge_id) VALUES (1, '2025-08-25', 7000, 9)`);
      const result = await service.executeIntent(1, {
        intent: 'calculate_target_average', target_average: 10000, days: null, tone: 'neutral'
      });
      expect(result.days).toBe(128);
      expect(result.assumption).toContain('Each projected day is logged');
    } finally {
      jest.useRealTimers();
    }
  });

  test('reports the challenge start instead of a step-count error before the challenge begins', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-12-20T12:00:00-08:00'));
    try {
      await expect(service.previewEntries(1, [
        { date: '2024-12-20', count: 9999 }
      ])).rejects.toThrow("Test Challenge hasn’t started yet. Steps can be logged from 2025-01-01.");
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejects duplicate dates and out-of-range counts', async () => {
    await expect(service.previewEntries(1, [
      { date: '2025-08-20', count: 1 },
      { date: '2025-08-20', count: 2 }
    ])).rejects.toThrow('appears more than once');

    await expect(service.previewEntries(1, [
      { date: '2025-08-22', count: 70001 }
    ])).rejects.toThrow('0 to 70,000');
  });
});
