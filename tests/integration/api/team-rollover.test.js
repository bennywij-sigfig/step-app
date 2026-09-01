const request = require('supertest');
const SimpleTestStabilizer = require('../test-stabilizer-simple');

describe('challenge team rollover', () => {
  let stabilizer;
  let db;
  let app;
  let agent;
  const testName = 'team-rollover';

  beforeAll(() => {
    stabilizer = new SimpleTestStabilizer();
  });

  afterAll(async () => {
    await stabilizer.cleanupAll();
  });

  beforeEach(async () => {
    db = await stabilizer.getStableDatabase(testName);
    const dbPath = stabilizer.activeConnections.get(testName).dbPath;
    app = await stabilizer.getStableServer(testName, dbPath);
    agent = request.agent(app);
  });

  afterEach(async () => {
    await stabilizer.closeDatabase(testName);
    await stabilizer.closeServer(testName);
  });

  test('snapshots the outgoing roster and clears teams atomically', async () => {
    await new Promise((resolve, reject) => db.serialize(() => {
      db.run(`INSERT INTO teams (id, name) VALUES (1, 'Blue'), (2, 'Green')`);
      db.run(`INSERT INTO users (id, email, name, team_id, is_admin) VALUES
        (1, 'admin@example.com', 'Admin', 1, 1),
        (2, 'player@example.com', 'Player', 2, 0),
        (3, 'unassigned@example.com', 'Unassigned', NULL, 0)`);
      db.run(`INSERT INTO challenges (id, name, start_date, end_date, is_active, reporting_threshold) VALUES
        (1, 'Outgoing', '2026-01-01', '2026-01-15', 1, 70),
        (2, 'Incoming', '2026-02-01', '2026-02-15', 0, 70)`, err => err ? reject(err) : resolve());
    }));

    const magic = await agent.post('/dev/get-magic-link').send({ email: 'admin@example.com' }).expect(200);
    const token = new URL(magic.body.magicLink).searchParams.get('token');
    await agent.get(`/auth/login?token=${token}`).expect(302);
    const csrf = await agent.get('/api/csrf-token').expect(200);

    const response = await agent
      .post('/api/admin/challenges/2/prepare-teams')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({})
      .expect(200);

    expect(response.body).toMatchObject({
      target_challenge_id: 2,
      source_challenge_id: 1,
      players_unassigned: 2,
      team_names_cleared: 2
    });

    const [users, teams, memberships, savedTeams, active] = await Promise.all([
      all(db, 'SELECT id, team_id FROM users ORDER BY id'),
      all(db, 'SELECT * FROM teams'),
      all(db, 'SELECT user_email, team_name FROM challenge_team_memberships WHERE challenge_id = 1 ORDER BY user_id'),
      all(db, 'SELECT team_name FROM challenge_team_names WHERE challenge_id = 1 ORDER BY team_name'),
      get(db, 'SELECT id, previous_challenge_id, teams_prepared_at FROM challenges WHERE is_active = 1')
    ]);

    expect(users.every(user => user.team_id === null)).toBe(true);
    expect(teams).toHaveLength(0);
    expect(memberships).toEqual([
      { user_email: 'admin@example.com', team_name: 'Blue' },
      { user_email: 'player@example.com', team_name: 'Green' },
      { user_email: 'unassigned@example.com', team_name: null }
    ]);
    expect(savedTeams.map(team => team.team_name)).toEqual(['Blue', 'Green']);
    expect(active.id).toBe(2);
    expect(active.previous_challenge_id).toBe(1);
    expect(active.teams_prepared_at).toBeTruthy();
  });
});

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
