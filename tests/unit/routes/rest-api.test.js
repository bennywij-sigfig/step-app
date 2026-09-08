const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const { createRestApiRouter } = require('../../../src/routes/rest-api');
const { createApiTokenAdminRouter } = require('../../../src/routes/api-token-admin');
const { createApiTokenService, READ_ONLY_SCOPES, READ_WRITE_SCOPES } = require('../../../src/services/api-tokens');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); });
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
const open = file => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db));
});

describe('versioned bearer-token REST API', () => {
  let directory;
  let file;
  let db;
  let app;
  let tokenService;
  let writeToken;
  let readToken;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-'));
    file = path.join(directory, 'steps.db');
    db = await open(file);
    await run(db, 'PRAGMA journal_mode = WAL');
    await run(db, 'CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT)');
    await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT, name TEXT, team_id INTEGER, archived_at TEXT)');
    await run(db, 'CREATE TABLE challenges(id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT, reporting_threshold INTEGER, is_active INTEGER)');
    await run(db, `CREATE TABLE steps(id INTEGER PRIMARY KEY, user_id INTEGER, date TEXT, count INTEGER, challenge_id INTEGER, updated_at TEXT, UNIQUE(user_id,date))`);
    await run(db, `CREATE TABLE api_tokens(id INTEGER PRIMARY KEY, token_hash TEXT UNIQUE, token_prefix TEXT, user_id INTEGER, name TEXT, scopes TEXT, expires_at TEXT, revoked_at TEXT, last_used_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    await run(db, `CREATE TABLE api_audit_log(id INTEGER PRIMARY KEY, token_id INTEGER, user_id INTEGER, action TEXT, status_code INTEGER, details TEXT, ip_address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    await run(db, "INSERT INTO teams VALUES(1,'Blue')");
    await run(db, "INSERT INTO users VALUES(1,'one@example.com','One',1,NULL),(2,'two@example.com','Two',NULL,NULL)");
    await run(db, "INSERT INTO challenges VALUES(7,'Current','2025-01-01','2027-12-31',70,1)");
    await run(db, "INSERT INTO steps VALUES(1,1,'2025-08-20',5000,7,datetime('now')),(2,2,'2025-08-20',9999,7,datetime('now'))");

    tokenService = createApiTokenService({ db });
    writeToken = await tokenService.createToken({ userId: 1, name: 'Write token', scopes: READ_WRITE_SCOPES, expiresDays: 30 });
    readToken = await tokenService.createToken({ userId: 1, name: 'Read token', scopes: READ_ONLY_SCOPES, expiresDays: 30 });
    const createTransactionConnection = () => open(file);
    const pass = (req, res, next) => next();
    const getIndividualLeaderboard = jest.fn(async () => ({
      ranked: [{
        id: 2, name: 'Two', team: null, total_steps: 9999, days_logged: 1,
        steps_per_day_reported: 9999, personal_reporting_rate: 100,
        email: 'must-not-leak@example.com', meets_threshold: 1
      }],
      unranked: [{
        id: 1, name: 'One', team: 'Blue', total_steps: 5000, days_logged: 1,
        steps_per_day_reported: 5000, personal_reporting_rate: 50, meets_threshold: 0
      }]
    }));
    const getTeamLeaderboard = jest.fn(async () => ({
      ranked: [{
        team_id: 1, team: 'Blue', member_count: 1, total_steps: 5000,
        team_entries: 1, team_steps_per_day_reported: 5000,
        team_reporting_rate: 100, internal_note: 'must-not-leak'
      }],
      unranked: []
    }));

    app = express();
    app.use(express.json());
    app.use('/api/v1', createRestApiRouter({
      db, tokenService, preAuthLimiter: pass, tokenLimiter: pass, createTransactionConnection,
      getIndividualLeaderboard, getTeamLeaderboard
    }));
    app.use('/api/admin/api-tokens', createApiTokenAdminRouter({
      requireApiAdmin: pass,
      validateCSRFToken: (req, res, next) => req.get('X-CSRF-Token') === 'test' ? next() : res.status(403).json({ error: 'Invalid CSRF token' }),
      adminApiLimiter: pass,
      tokenService
    }));
  });

  afterEach(async () => {
    await new Promise(resolve => db.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const bearer = token => ({ Authorization: `Bearer ${token}` });

  test('requires a valid header-only bearer token', async () => {
    await request(app).get('/api/v1/me').expect(401);
    await request(app).get('/api/v1/me?token=' + writeToken.token).expect(401);
    await request(app).get('/api/v1/me').set('Authorization', 'Bearer invalid').expect(401);
    await request(app).get('/api/v1/me').set(bearer(writeToken.token)).expect(200);
  });

  test('rejects expired, revoked, and archived-user tokens', async () => {
    const expired = await tokenService.createToken({ userId: 1, name: 'Expired', scopes: READ_ONLY_SCOPES, expiresDays: 30 });
    await run(db, "UPDATE api_tokens SET expires_at = '2020-01-01T00:00:00Z' WHERE id = ?", [expired.id]);
    await request(app).get('/api/v1/me').set(bearer(expired.token)).expect(401);

    const archived = await tokenService.createToken({ userId: 2, name: 'Archived later', scopes: READ_ONLY_SCOPES, expiresDays: 30 });
    await run(db, "UPDATE users SET archived_at = datetime('now') WHERE id = 2");
    await request(app).get('/api/v1/me').set(bearer(archived.token)).expect(401);

    await tokenService.revokeToken(readToken.id);
    await request(app).get('/api/v1/me').set(bearer(readToken.token)).expect(401);
  });

  test('returns only the token user profile and steps', async () => {
    const profile = await request(app).get('/api/v1/me').set(bearer(writeToken.token)).expect(200);
    expect(profile.body.user).toMatchObject({ id: 1, email: 'one@example.com', team: 'Blue' });
    const steps = await request(app).get('/api/v1/steps').set(bearer(writeToken.token)).expect(200);
    expect(steps.body.entries).toEqual([expect.objectContaining({ date: '2025-08-20', count: 5000 })]);
    expect(JSON.stringify(steps.body)).not.toContain('9999');
  });

  test('returns scoped active-challenge leaderboards without private or internal fields', async () => {
    const individual = await request(app).get('/api/v1/leaderboards/individual')
      .set(bearer(readToken.token)).expect(200);
    expect(individual.headers['cache-control']).toBe('no-store');
    expect(individual.body.challenge).toMatchObject({
      id: 7, name: 'Current', status: 'active', reporting_threshold: 70,
      current_day: expect.any(Number), total_days: expect.any(Number), remaining_days: expect.any(Number)
    });
    expect(individual.body.ranked).toEqual([{
      position: 1, ranked: true, participant_id: 2, name: 'Two', team: null,
      total_steps: 9999, days_logged: 1, steps_per_day_reported: 9999, reporting_rate: 100
    }]);
    expect(individual.body.unranked[0]).toMatchObject({
      position: 1, ranked: false, participant_id: 1, name: 'One'
    });
    expect(JSON.stringify(individual.body)).not.toMatch(/must-not-leak|email|meets_threshold/);

    const team = await request(app).get('/api/v1/leaderboards/team')
      .set(bearer(readToken.token)).expect(200);
    expect(team.body.ranked).toEqual([{
      position: 1, ranked: true, team_id: 1, name: 'Blue', member_count: 1,
      total_steps: 5000, entries_logged: 1, steps_per_day_reported: 5000, reporting_rate: 100
    }]);
    expect(JSON.stringify(team.body)).not.toContain('internal_note');
  });

  test('returns empty standings when there is no active challenge', async () => {
    await run(db, 'UPDATE challenges SET is_active = 0');
    const response = await request(app).get('/api/v1/leaderboards/individual')
      .set(bearer(readToken.token)).expect(200);
    expect(response.body).toEqual({ challenge: null, ranked: [], unranked: [] });
  });

  test('reports bounded timing for upcoming and ended active-challenge records', async () => {
    await run(db, "UPDATE challenges SET start_date = '2099-01-01', end_date = '2099-01-10'");
    const upcoming = await request(app).get('/api/v1/leaderboards/individual')
      .set(bearer(readToken.token)).expect(200);
    expect(upcoming.body.challenge).toMatchObject({
      status: 'upcoming', current_day: 0, total_days: 10, remaining_days: 10
    });

    await run(db, "UPDATE challenges SET start_date = '2020-01-01', end_date = '2020-01-10'");
    const ended = await request(app).get('/api/v1/leaderboards/team')
      .set(bearer(readToken.token)).expect(200);
    expect(ended.body.challenge).toMatchObject({
      status: 'ended', current_day: 10, total_days: 10, remaining_days: 0
    });

    await run(db, "UPDATE challenges SET start_date = '2026-02-01', end_date = '2026-01-01'");
    await request(app).get('/api/v1/leaderboards/individual')
      .set(bearer(readToken.token)).expect(500, { error: 'Unable to load individual leaderboard' });
  });

  test('enforces read and write scopes', async () => {
    await request(app).get('/api/v1/steps').set(bearer(readToken.token)).expect(200);
    await request(app).post('/api/v1/steps').set(bearer(readToken.token))
      .send({ date: '2025-08-21', count: 6000 }).expect(403);
    const noProfile = await tokenService.createToken({ userId: 1, name: 'Steps only', scopes: ['steps:read'], expiresDays: 30 });
    await request(app).get('/api/v1/me').set(bearer(noProfile.token)).expect(403);
    await request(app).get('/api/v1/leaderboards/individual').set(bearer(noProfile.token)).expect(403);
    await request(app).get('/api/v1/leaderboards/team').set(bearer(noProfile.token)).expect(403);
  });

  test('separates create conflicts from explicit replacement', async () => {
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-21', count: 6000 }).expect(201);
    const conflict = await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-21', count: 7000 }).expect(409);
    expect(conflict.body.existing_count).toBe(6000);
    const replaced = await request(app).put('/api/v1/steps/2025-08-21').set(bearer(writeToken.token))
      .send({ count: 7000 }).expect(200);
    expect(replaced.body.entry).toMatchObject({ previous_count: 6000, count: 7000 });
    await request(app).put('/api/v1/steps/2025-08-22').set(bearer(writeToken.token))
      .send({ count: 7000 }).expect(404);
  });

  test('enforces active challenge date boundaries', async () => {
    await run(db, "UPDATE challenges SET start_date = '2025-08-20', end_date = '2025-08-31' WHERE id = 7");
    const response = await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-19', count: 1 }).expect(400);
    expect(response.body).toMatchObject({ challenge_start: '2025-08-20', challenge_end: '2025-08-31' });
  });

  test('rejects extra fields and invalid date/count input', async () => {
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-22', count: 1, user_id: 2 }).expect(400);
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: 'not-a-date', count: 1 }).expect(400);
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-22', count: 70001 }).expect(400);
  });

  test('stores only token hashes, lists metadata, and revokes immediately', async () => {
    const stored = await get(db, 'SELECT token_hash, token_prefix FROM api_tokens WHERE id = ?', [writeToken.id]);
    expect(stored.token_hash).not.toBe(writeToken.token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);

    const listed = await request(app).get('/api/admin/api-tokens').expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(writeToken.token);
    expect(listed.body[0]).toHaveProperty('token_prefix');
    expect(listed.body[0]).not.toHaveProperty('token_hash');

    await request(app).delete(`/api/admin/api-tokens/${writeToken.id}`).set('X-CSRF-Token', 'test').expect(200);
    await request(app).get('/api/v1/me').set(bearer(writeToken.token)).expect(401);
  });

  test('admin creation returns the raw token once and requires CSRF', async () => {
    await request(app).post('/api/admin/api-tokens').send({ user_id: 1, name: 'No CSRF', access: 'read_only', expires_days: 30 }).expect(403);
    const created = await request(app).post('/api/admin/api-tokens').set('X-CSRF-Token', 'test')
      .send({ user_id: 1, name: 'Automation', access: 'read_only', expires_days: 30 }).expect(201);
    expect(created.body.token.token).toMatch(/^step_/);
    expect(created.body.token.scopes).toEqual(expect.arrayContaining([
      'profile:read', 'steps:read', 'leaderboard:read'
    ]));
    const personal = await request(app).post('/api/admin/api-tokens').set('X-CSRF-Token', 'test')
      .send({ user_id: 1, name: 'Personal only', access: 'personal_read', expires_days: 30 }).expect(201);
    expect(personal.body.token.scopes).toEqual(['profile:read', 'steps:read']);
    await request(app).get('/api/v1/leaderboards/individual')
      .set(bearer(personal.body.token.token)).expect(403);
    const listed = await request(app).get('/api/admin/api-tokens').expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token.token);
  });

  test('records bounded activity without bearer-token leakage', async () => {
    await request(app).get('/api/v1/me').set(bearer(writeToken.token)).expect(200);
    await request(app).get('/api/v1/leaderboards/individual').set(bearer(writeToken.token)).expect(200);
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-23', count: 4321 }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 20));
    const audit = await request(app).get('/api/admin/api-tokens/audit/recent').expect(200);
    expect(audit.body.logs.map(row => row.action)).toEqual(expect.arrayContaining([
      'profile.read', 'leaderboard.individual.read', 'steps.create'
    ]));
    expect(JSON.stringify(audit.body)).not.toContain(writeToken.token);
  });
});
