const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();

jest.setTimeout(30000);

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(error) {
    if (error) return reject(error);
    resolve({ changes: this.changes, lastID: this.lastID });
  });
});
const all = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});
const close = db => new Promise(resolve => db.close(() => resolve()));

async function createLegacyDatabase(dbPath) {
  const db = new sqlite3.Database(dbPath);
  await run(db, `CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    team TEXT,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME DEFAULT NULL
  )`);
  await run(db, `CREATE TABLE challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    reporting_threshold INTEGER DEFAULT 70,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    challenge_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  )`);
  await run(db, `CREATE TABLE challenge_archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    challenge_name TEXT NOT NULL,
    challenge_start_date TEXT NOT NULL,
    challenge_end_date TEXT NOT NULL,
    reporting_threshold INTEGER NOT NULL,
    archive_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER NOT NULL,
    total_participants INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE challenge_archive_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_team TEXT,
    user_email TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    original_updated_at DATETIME
  )`);
  await run(db, `CREATE TABLE challenge_team_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, team_name)
  )`);
  await run(db, `CREATE TABLE challenge_team_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    team_name TEXT,
    user_archived_at DATETIME,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, user_id)
  )`);

  await run(db, `INSERT INTO teams (id, name) VALUES (10, 'Current Blue'), (20, 'Current Green')`);
  await run(db, `INSERT INTO users (id, email, name, team, is_admin) VALUES
    (1, 'admin@example.com', 'Admin Walker', 'Current Blue', 1),
    (2, 'green@example.com', 'Green Walker', 'Current Green', 0),
    (3, 'idle@example.com', 'Idle Walker', 'Current Blue', 0),
    (4, 'unassigned@example.com', 'No Team Walker', NULL, 0)`);
  await run(db, `INSERT INTO challenges
    (id, name, start_date, end_date, is_active, reporting_threshold) VALUES
    (1, 'Historical Challenge', '2025-09-01', '2025-09-03', 0, 70),
    (2, 'Current Challenge', '2026-08-30', '2026-09-05', 1, 70)`);
  await run(db, `INSERT INTO steps (user_id, date, count, challenge_id) VALUES
    (1, '2026-08-30', 10000, 2),
    (1, '2026-08-31', 12000, 2),
    (1, '2026-09-01', 14000, 2),
    (2, '2026-08-30', 9000, 2),
    (2, '2026-08-31', 11000, 2),
    (2, '2026-09-01', 13000, 2),
    (1, '2025-09-01', 7000, 1)`);

  await run(db, `INSERT INTO challenge_archives
    (id, challenge_id, challenge_name, challenge_start_date, challenge_end_date,
     reporting_threshold, created_by_user_id, total_participants)
    VALUES (1, 1, 'Historical Challenge', '2025-09-01', '2025-09-03', 70, 1, 2)`);
  await run(db, `INSERT INTO challenge_archive_steps
    (archive_id, user_id, user_name, user_team, user_email, date, count, original_updated_at)
    VALUES (1, 1, 'Admin Walker', 'Historic Blue', 'admin@example.com', '2025-09-01', 7000, '2025-09-01T10:00:00Z')`);
  await run(db, `INSERT INTO challenge_team_names (challenge_id, team_name)
    VALUES (1, 'Historic Blue'), (1, 'Historic Green')`);
  await run(db, `INSERT INTO challenge_team_memberships
    (challenge_id, user_id, user_name, user_email, team_name) VALUES
    (1, 1, 'Admin Walker', 'admin@example.com', 'Historic Blue'),
    (1, 2, 'Green Walker', 'green@example.com', 'Historic Green')`);
  await close(db);
}

function parseZip(buffer) {
  const entries = new Map();
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('ZIP end-of-central-directory record not found');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    entries.set(name, content.toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

test('legacy migration aborts atomically when an assignment has no team', async () => {
  const dbPath = path.join(__dirname, '../../test-databases', `team-normalization-invalid-${crypto.randomBytes(8).toString('hex')}.db`);
  await createLegacyDatabase(dbPath);
  const invalidDb = new sqlite3.Database(dbPath);
  await run(invalidDb, `INSERT INTO users (email, name, team) VALUES ('ghost@example.com', 'Ghost', 'Missing Team')`);
  await close(invalidDb);

  const child = spawnSync(process.execPath, ['-e', `
    const db = require('./src/database');
    db.ready.then(() => process.exit(0)).catch(() => process.exit(2));
  `], {
    cwd: path.join(__dirname, '../../..'),
    env: { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test', TEST_DB_INIT: 'true' },
    encoding: 'utf8',
    timeout: 15000
  });
  expect(child.status).toBe(2);

  const checkDb = new sqlite3.Database(dbPath);
  const columns = await all(checkDb, 'PRAGMA table_info(users)');
  expect(columns.map(column => column.name)).not.toContain('team_id');
  expect((await all(checkDb, `SELECT team FROM users WHERE email = 'ghost@example.com'`))[0].team).toBe('Missing Team');
  await close(checkDb);
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
  }
});

describe('normalized live teams preserve current and historical behavior', () => {
  let app;
  let agent;
  let db;
  let dbPath;

  beforeAll(async () => {
    dbPath = path.join(__dirname, '../../test-databases', `team-normalization-${crypto.randomBytes(8).toString('hex')}.db`);
    await createLegacyDatabase(dbPath);
    process.env.DB_PATH = dbPath;
    process.env.NODE_ENV = 'test';
    process.env.TEST_DB_INIT = 'true';
    process.env.DISABLE_RATE_LIMITING = 'true';
    process.env.SESSION_SECRET = 'team-normalization-contract-secret';
    process.env.CSRF_SECRET = 'team-normalization-contract-csrf';
    for (const modulePath of ['../../../src/server.js', '../../../src/database.js', '../../../src/shadow-api.js']) {
      delete require.cache[require.resolve(modulePath)];
    }
    app = require('../../../src/server.js');
    await require('../../../src/database.js').ready;
    db = new sqlite3.Database(dbPath);
    agent = request.agent(app);
    const magic = await agent.post('/dev/get-magic-link').send({ email: 'admin@example.com' }).expect(200);
    const token = new URL(magic.body.magicLink).searchParams.get('token');
    await agent.get(`/auth/login?token=${token}`).expect(302);
  });

  afterAll(async () => {
    await close(db);
    await new Promise(resolve => app.close(() => resolve()));
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  });

  test('preserves the semantic contracts of all live team API surfaces', async () => {
    const me = await agent.get('/api/user').expect(200);
    expect(me.body).toMatchObject({
      id: 1, email: 'admin@example.com', name: 'Admin Walker', team: 'Current Blue', is_admin: 1
    });

    const teams = await agent.get('/api/teams').expect(200);
    expect(teams.body).toEqual([
      { id: 10, name: 'Current Blue' },
      { id: 20, name: 'Current Green' }
    ]);

    const users = await agent.get('/api/admin/users').expect(200);
    expect(users.body.map(user => ({ id: user.id, team: user.team }))).toEqual([
      { id: 1, team: 'Current Blue' },
      { id: 2, team: 'Current Green' },
      { id: 3, team: 'Current Blue' },
      { id: 4, team: null }
    ]);

    const blueMembers = await agent.get('/api/teams/Current%20Blue/members').expect(200);
    expect(blueMembers.body.map(member => ({ name: member.name, total_steps: member.total_steps }))).toEqual([
      { name: 'Admin Walker', total_steps: 36000 },
      { name: 'Idle Walker', total_steps: 0 }
    ]);

    const shadowTeams = await agent.get('/api/shadow/leaderboard/team').expect(200);
    expect(shadowTeams.body.map(team => ({ team: team.team, member_count: team.member_count }))
      .sort((a, b) => a.team.localeCompare(b.team))).toEqual([
      { team: 'Current Blue', member_count: 2 },
      { team: 'Current Green', member_count: 1 }
    ]);

    await run(db, `INSERT INTO mcp_tokens
      (token, user_id, name, permissions, scopes, expires_at)
      VALUES ('mcp_contract_profile_token', 1, 'Contract token', 'read_only', 'profile:read', '2030-01-01T00:00:00Z')`);
    const mcpProfile = await agent.post('/mcp')
      .set('Authorization', 'Bearer mcp_contract_profile_token')
      .send({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_user_profile', arguments: {} }, id: 1 })
      .expect(200);
    const profileText = mcpProfile.body.result.content[0].text;
    expect(JSON.parse(profileText).user).toMatchObject({
      email: 'admin@example.com', name: 'Admin Walker', team: 'Current Blue'
    });

    const snapshot = await agent.get('/api/admin/challenges/1/team-snapshot').expect(200);
    expect(snapshot.body.teams).toEqual([{ team_name: 'Historic Blue' }, { team_name: 'Historic Green' }]);
    expect(snapshot.body.players.map(player => ({ email: player.user_email, team: player.team_name }))).toEqual([
      { email: 'admin@example.com', team: 'Historic Blue' },
      { email: 'green@example.com', team: 'Historic Green' }
    ]);
  });

  test('preserves existing admin assignment and team lifecycle request semantics', async () => {
    const csrf = (await agent.get('/api/csrf-token').expect(200)).body.csrfToken;

    await agent.put('/api/admin/users/3/team')
      .set('X-CSRF-Token', csrf)
      .send({ team: 'Missing Team' })
      .expect(400, { error: 'Invalid team name' });
    expect((await agent.get('/api/admin/users').expect(200)).body.find(user => user.id === 3).team).toBe('Current Blue');

    await agent.put('/api/admin/users/3/team')
      .set('X-CSRF-Token', csrf)
      .send({ team: 'Current Green' })
      .expect(200, { message: 'Team updated successfully' });
    expect((await agent.get('/api/admin/users').expect(200)).body.find(user => user.id === 3).team).toBe('Current Green');

    await agent.post('/api/admin/users/batch-update')
      .set('X-CSRF-Token', csrf)
      .send({ action: 'update_teams', updates: [{ userId: 3, teamId: 'Current Blue' }] })
      .expect(200);
    expect((await agent.get('/api/admin/users').expect(200)).body.find(user => user.id === 3).team).toBe('Current Blue');

    const created = await agent.post('/api/admin/teams')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Temporary Team' })
      .expect(200);
    await agent.put(`/api/admin/teams/${created.body.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Temporary Renamed' })
      .expect(200, { message: 'Team updated successfully' });
    await agent.put('/api/admin/users/4/team')
      .set('X-CSRF-Token', csrf)
      .send({ team: 'Temporary Renamed' })
      .expect(200);
    await run(db, `CREATE TRIGGER block_test_team_delete BEFORE DELETE ON teams
      WHEN OLD.id = ${Number(created.body.id)} BEGIN SELECT RAISE(ABORT, 'blocked test delete'); END`);
    await agent.delete(`/api/admin/teams/${created.body.id}`)
      .set('X-CSRF-Token', csrf)
      .expect(500);
    expect((await all(db, 'SELECT team_id FROM users WHERE id = 4'))[0].team_id).toBe(created.body.id);
    expect(await all(db, 'SELECT id FROM teams WHERE id = ?', [created.body.id])).toHaveLength(1);

    await run(db, 'DROP TRIGGER block_test_team_delete');
    await agent.delete(`/api/admin/teams/${created.body.id}`)
      .set('X-CSRF-Token', csrf)
      .expect(200, { message: 'Team deleted successfully' });
    expect((await agent.get('/api/admin/users').expect(200)).body.find(user => user.id === 4).team).toBeNull();
  });

  test('migrates legacy names to stable team IDs without changing user IDs', async () => {
    const columns = await all(db, 'PRAGMA table_info(users)');
    expect(columns.map(column => column.name)).toContain('team_id');
    const foreignKeys = await all(db, 'PRAGMA foreign_key_list(users)');
    expect(foreignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'team_id', table: 'teams', to: 'id', on_delete: 'SET NULL' })
    ]));
    if (columns.some(column => column.name === 'team')) {
      expect((await all(db, 'SELECT id FROM users WHERE team IS NOT NULL'))).toHaveLength(0);
    }
    const rows = await all(db, `SELECT u.id, u.email, u.team_id, t.name AS team
      FROM users u LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.id`);
    expect(rows).toEqual([
      { id: 1, email: 'admin@example.com', team_id: 10, team: 'Current Blue' },
      { id: 2, email: 'green@example.com', team_id: 20, team: 'Current Green' },
      { id: 3, email: 'idle@example.com', team_id: 10, team: 'Current Blue' },
      { id: 4, email: 'unassigned@example.com', team_id: null, team: null }
    ]);
  });

  test('individual and team leaderboards source names through team_id', async () => {
    const columns = await all(db, 'PRAGMA table_info(users)');
    if (columns.some(column => column.name === 'team') && columns.some(column => column.name === 'team_id')) {
      await run(db, `UPDATE users SET team = 'STALE LEGACY VALUE' WHERE team_id IS NOT NULL`);
    }

    const individual = await agent.get('/api/leaderboard').expect(200);
    const participants = [...individual.body.data.ranked, ...individual.body.data.unranked];
    expect(participants.find(row => row.id === 1).team).toBe('Current Blue');
    expect(participants.find(row => row.id === 2).team).toBe('Current Green');

    const teams = await agent.get('/api/team-leaderboard').expect(200);
    const teamRows = [...teams.body.data.ranked, ...teams.body.data.unranked];
    expect(teamRows.map(row => row.team).sort()).toEqual(['Current Blue', 'Current Green']);
    expect(teamRows.find(row => row.team === 'Current Blue').member_count).toBe(2);
    expect(teamRows.find(row => row.team === 'Current Green').member_count).toBe(1);
  });

  test('live CSV export follows a renamed team through the normalized relation', async () => {
    const csrf = await agent.get('/api/csrf-token').expect(200);
    await agent.put('/api/admin/teams/10')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ name: 'Renamed Blue' })
      .expect(200);

    const rows = await all(db, `SELECT u.email, u.team_id, t.name AS team
      FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id IN (1, 3) ORDER BY u.id`);
    expect(rows).toEqual([
      { email: 'admin@example.com', team_id: 10, team: 'Renamed Blue' },
      { email: 'idle@example.com', team_id: 10, team: 'Renamed Blue' }
    ]);

    const csv = await agent.get('/api/admin/export-csv').expect(200);
    expect(csv.text).toContain('Admin Walker,admin@example.com,Renamed Blue');
    expect(csv.text).toContain('Idle Walker,idle@example.com,Renamed Blue');
    expect(csv.text).not.toContain('STALE LEGACY VALUE');

    const archived = await agent.post('/api/admin/challenges/2/archive')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({})
      .expect(200);
    const currentZip = await agent.get(`/api/admin/archives/${archived.body.archiveId}/download`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const currentFiles = parseZip(currentZip.body);
    expect(currentFiles.get('daily_steps.csv')).toContain('"Renamed Blue"');
    expect(currentFiles.get('daily_steps.csv')).toContain('"Current Green"');
    expect(currentFiles.get('participant_summary.csv')).toContain('"Renamed Blue"');
  });

  test('historical archive export remains isolated from live team renames', async () => {
    const response = await agent.get('/api/admin/archives/1/download')
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /application\/zip/);
    const files = parseZip(response.body);

    expect(files.get('daily_steps.csv')).toContain('"Historic Blue"');
    expect(files.get('participant_summary.csv')).toContain('"Historic Blue"');
    expect(files.get('team_names.csv')).toContain('"Historic Blue"');
    expect(files.get('team_names.csv')).toContain('"Historic Green"');
    expect(files.get('team_roster.csv')).toContain('"Admin Walker","admin@example.com","Historic Blue"');
    expect(files.get('team_roster.csv')).toContain('"Green Walker","green@example.com","Historic Green"');
    for (const content of files.values()) expect(content).not.toContain('Renamed Blue');
  });

  test('all-time leaderboard and member APIs preserve their response semantics', async () => {
    await run(db, 'UPDATE challenges SET is_active = 0');
    const individual = await agent.get('/api/leaderboard').expect(200);
    expect(individual.body.type).toBe('all_time');
    expect(individual.body.data.find(row => row.id === 1).team).toBe('Renamed Blue');

    const teams = await agent.get('/api/team-leaderboard').expect(200);
    expect(teams.body.type).toBe('all_time');
    expect(teams.body.data.map(row => row.team).sort()).toEqual(['Current Green', 'Renamed Blue']);

    const members = await agent.get('/api/teams/Renamed%20Blue/members').expect(200);
    expect(members.body.map(member => member.name)).toEqual(['Admin Walker', 'Idle Walker']);
  });
});
