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

    app = express();
    app.use(express.json());
    app.use('/api/v1', createRestApiRouter({ db, tokenService, preAuthLimiter: pass, tokenLimiter: pass, createTransactionConnection }));
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

  test('enforces read and write scopes', async () => {
    await request(app).get('/api/v1/steps').set(bearer(readToken.token)).expect(200);
    await request(app).post('/api/v1/steps').set(bearer(readToken.token))
      .send({ date: '2025-08-21', count: 6000 }).expect(403);
    const noProfile = await tokenService.createToken({ userId: 1, name: 'Steps only', scopes: ['steps:read'], expiresDays: 30 });
    await request(app).get('/api/v1/me').set(bearer(noProfile.token)).expect(403);
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
    const listed = await request(app).get('/api/admin/api-tokens').expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token.token);
  });

  test('records bounded activity without bearer-token leakage', async () => {
    await request(app).get('/api/v1/me').set(bearer(writeToken.token)).expect(200);
    await request(app).post('/api/v1/steps').set(bearer(writeToken.token))
      .send({ date: '2025-08-23', count: 4321 }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 20));
    const audit = await request(app).get('/api/admin/api-tokens/audit/recent').expect(200);
    expect(audit.body.logs.map(row => row.action)).toEqual(expect.arrayContaining(['profile.read', 'steps.create']));
    expect(JSON.stringify(audit.body)).not.toContain(writeToken.token);
  });
});
