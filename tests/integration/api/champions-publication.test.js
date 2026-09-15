const request = require('supertest');
const SimpleTestStabilizer = require('../test-stabilizer-simple');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(error) {
    if (error) reject(error);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

describe('manual champions publication', () => {
  let stabilizer;
  let db;
  let app;
  let agent;
  const testName = 'champions-publication';

  beforeAll(() => { stabilizer = new SimpleTestStabilizer(); });
  afterAll(async () => { await stabilizer.cleanupAll(); });

  beforeEach(async () => {
    db = await stabilizer.getStableDatabase(testName);
    const dbPath = stabilizer.activeConnections.get(testName).dbPath;
    app = await stabilizer.getStableServer(testName, dbPath);
    agent = request.agent(app);

    await run(db, `INSERT INTO teams (id, name) VALUES (1, 'Future Soles')`);
    await run(db, `INSERT INTO users (id, email, name, team_id, is_admin) VALUES
      (1, 'admin@example.com', 'Admin Walker', 1, 1),
      (2, 'winner@example.com', 'Winner Walker', 1, 0)`);
    await run(db, `INSERT INTO challenges (id, name, start_date, end_date, is_active, reporting_threshold)
      VALUES (1, 'SigFig Step Challenge 2026', '2026-01-01', '2026-01-02', 1, 100)`);
    await run(db, `INSERT INTO challenge_team_memberships
      (challenge_id, user_id, user_name, user_email, team_name) VALUES
      (1, 1, 'Admin Walker', 'admin@example.com', 'Challenge Soles'),
      (1, 2, 'Winner Walker', 'winner@example.com', 'Challenge Soles')`);
    await run(db, `INSERT INTO steps (user_id, date, count, challenge_id) VALUES
      (1, '2026-01-01', 10000, 1), (1, '2026-01-02', 11000, 1),
      (2, '2026-01-01', 20000, 1), (2, '2026-01-02', 22000, 1)`);

    const magic = await agent.post('/dev/get-magic-link').send({ email: 'admin@example.com' }).expect(200);
    const token = new URL(magic.body.magicLink).searchParams.get('token');
    await agent.get(`/auth/login?token=${token}`).expect(302);
  });

  afterEach(async () => {
    await stabilizer.closeDatabase(testName);
    await stabilizer.closeServer(testName);
  });

  test('waits for the end and then takes a snapshot only when an admin presses publish', async () => {
    const csrf = await agent.get('/api/csrf-token').expect(200);
    await run(db, "UPDATE challenges SET start_date = '2099-01-01', end_date = '2099-01-02' WHERE id = 1");
    const earlyResponse = await agent
      .post('/api/admin/challenges/1/publish-champions')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({})
      .expect(409);
    expect(earlyResponse.body.error).toContain('only be published after the challenge has ended');
    expect(await get(db, 'SELECT COUNT(*) AS count FROM champions_publications')).toEqual({ count: 0 });

    await run(db, "UPDATE challenges SET start_date = '2026-01-01', end_date = '2026-01-02' WHERE id = 1");
    await agent.get('/api/champions?season=2026').expect(404);
    const publication = await agent
      .post('/api/admin/challenges/1/publish-champions')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({})
      .expect(200);

    expect(publication.body).toMatchObject({
      season: 2026,
      stepsArchived: 4,
      totalParticipants: 2
    });

    const champions = await agent.get('/api/champions?season=2026').expect(200);
    expect(champions.body).toMatchObject({
      season: 2026,
      challenge: { name: 'SigFig Step Challenge 2026', days: 2 },
      totals: { participants: 2, reports: 4 }
    });
    expect(champions.body.podiums.individuals[0].name).toBe('Winner Walker');
    expect(champions.body.podiums.teams[0].name).toBe('Challenge Soles');

    const dashboardState = await agent.get('/api/user').expect(200);
    expect(dashboardState.body.latest_champions).toMatchObject({
      season: 2026,
      challenge_id: 1,
      challenge_name: 'SigFig Step Challenge 2026'
    });
    await agent.get('/champions').expect(302).expect('Location', '/champions?season=2026');
    await agent.get('/champions?season=2025').expect(200);

    const pointer = await get(db, 'SELECT season, challenge_id, archive_id FROM champions_publications WHERE season = 2026');
    expect(pointer).toMatchObject({ season: 2026, challenge_id: 1 });
  });
});
