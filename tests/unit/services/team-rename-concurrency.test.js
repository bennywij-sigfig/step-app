const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createStepChatService } = require('../../../src/services/step-chat');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, error => error ? reject(error) : resolve());
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});
const open = file => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, error => {
    if (error) return reject(error);
    db.configure('busyTimeout', 5000);
    resolve(db);
  });
});

function transactionFactory(file) {
  return () => open(file);
}

describe('team rename concurrency', () => {
  test('two members cannot overwrite each other from stale reviews', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-rename-'));
    const file = path.join(directory, 'steps.db');
    const db = await open(file);
    try {
      await run(db, 'PRAGMA journal_mode = WAL');
      await run(db, 'CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT UNIQUE, name_key TEXT UNIQUE)');
      await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY, team_id INTEGER, archived_at TEXT)');
      await run(db, `INSERT INTO teams VALUES(7, 'Original', 'original')`);
      await run(db, 'INSERT INTO users VALUES(1, 7, NULL), (2, 7, NULL)');

      const service = createStepChatService({
        db,
        getIndividualLeaderboard: async () => ({ ranked: [], unranked: [] }),
        getTeamLeaderboard: async () => ({ ranked: [], unranked: [] }),
        createTransactionConnection: transactionFactory(file)
      });
      const [first, second] = await Promise.all([
        service.previewTeamRename(1, 'First Choice'),
        service.previewTeamRename(2, 'Second Choice')
      ]);
      const results = await Promise.allSettled([
        service.commitTeamRename(1, {
          teamId: first.team_id, currentName: first.current_name, proposedName: first.proposed_name
        }),
        service.commitTeamRename(2, {
          teamId: second.team_id, currentName: second.current_name, proposedName: second.proposed_name
        })
      ]);

      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(results.find(result => result.status === 'rejected').reason.message).toMatch(/changed.*review|changed.*again/);
      const team = await get(db, 'SELECT name, name_key FROM teams WHERE id = 7');
      expect(['First Choice', 'Second Choice']).toContain(team.name);
      expect((await get(db, 'SELECT COUNT(*) AS count FROM users WHERE team_id = 7')).count).toBe(2);
    } finally {
      await new Promise(resolve => db.close(() => resolve()));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('two teams cannot concurrently claim the same normalized name', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-name-collision-'));
    const file = path.join(directory, 'steps.db');
    const db = await open(file);
    try {
      await run(db, 'PRAGMA journal_mode = WAL');
      await run(db, 'CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT UNIQUE, name_key TEXT UNIQUE)');
      await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY, team_id INTEGER, archived_at TEXT)');
      await run(db, `INSERT INTO teams VALUES(1, 'One', 'one'), (2, 'Two', 'two')`);
      await run(db, 'INSERT INTO users VALUES(1, 1, NULL), (2, 2, NULL)');
      const service = createStepChatService({
        db,
        getIndividualLeaderboard: async () => ({ ranked: [], unranked: [] }),
        getTeamLeaderboard: async () => ({ ranked: [], unranked: [] }),
        createTransactionConnection: transactionFactory(file)
      });
      const [one, two] = await Promise.all([
        service.previewTeamRename(1, 'Shared ７'),
        service.previewTeamRename(2, 'shared 7')
      ]);
      const results = await Promise.allSettled([
        service.commitTeamRename(1, { teamId: one.team_id, currentName: one.current_name, proposedName: one.proposed_name }),
        service.commitTeamRename(2, { teamId: two.team_id, currentName: two.current_name, proposedName: two.proposed_name })
      ]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect((await get(db, `SELECT COUNT(*) AS count FROM teams WHERE name_key = 'shared 7'`)).count).toBe(1);
    } finally {
      await new Promise(resolve => db.close(() => resolve()));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
