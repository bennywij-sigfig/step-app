/**
 * Stable Leaderboard Tests
 * 
 * Simplified version of leaderboard tests with improved database stability
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const TestStabilizer = require('../test-stabilizer');

describe('Leaderboard API Stability Tests', () => {
  let stabilizer;
  let app;
  let db;
  let agent;
  const testName = 'leaderboard-stability';

  beforeAll(() => {
    stabilizer = new TestStabilizer();
  });

  afterAll(async () => {
    await stabilizer.cleanupAll();
  });

  beforeEach(async () => {
    // Get stable database connection
    db = await stabilizer.getStableDatabase(testName);
    
    // Get stable server instance
    const dbPath = stabilizer.activeConnections.get(testName).dbPath;
    app = await stabilizer.getStableServer(testName, dbPath);
    
    // Create agent
    agent = request.agent(app);
  });

  afterEach(async () => {
    // Clean shutdown
    await stabilizer.closeDatabase(testName);
    await stabilizer.closeServer(testName);
  });

  test('should handle basic leaderboard request without database errors', async () => {
    // Create test data
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`INSERT INTO users (id, email, name, team, is_admin) VALUES (1, 'test@example.com', 'Test User', 'Team A', 1)`, (err) => {
          if (err) return reject(err);
        });
        
        db.run(`INSERT INTO challenges (id, name, start_date, end_date, is_active, reporting_threshold) 
                VALUES (1, 'Test Challenge', '2025-01-01', '2025-01-31', 1, 70)`, (err) => {
          if (err) return reject(err);
        });
        
        db.run(`INSERT INTO steps (user_id, date, count, challenge_id) VALUES (1, '2025-01-01', 5000, 1)`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // Authenticate user
    const sessionAgent = request.agent(app);
    const magicResponse = await sessionAgent
      .post('/dev/get-magic-link')
      .send({ email: 'test@example.com' })
      .expect(200);

    const magicLink = magicResponse.body.magicLink;
    const tokenMatch = magicLink.match(/token=([^&]+)/);
    expect(tokenMatch).toBeTruthy();

    await sessionAgent
      .get(`/auth/verify?token=${tokenMatch[1]}`)
      .expect(302);

    // Test leaderboard endpoint
    const response = await sessionAgent
      .get('/api/leaderboard')
      .expect(200);

    expect(response.body).toHaveProperty('type');
    expect(response.body).toHaveProperty('data');
  });

  test('should handle team leaderboard without connection issues', async () => {
    // Create test data
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`INSERT INTO users (id, email, name, team, is_admin) VALUES (1, 'test2@example.com', 'Test User 2', 'Team B', 1)`, (err) => {
          if (err) return reject(err);
        });
        
        db.run(`INSERT INTO challenges (id, name, start_date, end_date, is_active, reporting_threshold) 
                VALUES (2, 'Team Challenge', '2025-01-01', '2025-01-31', 1, 50)`, (err) => {
          if (err) return reject(err);
        });
        
        db.run(`INSERT INTO steps (user_id, date, count, challenge_id) VALUES (1, '2025-01-01', 3000, 2)`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // Authenticate user
    const sessionAgent = request.agent(app);
    const magicResponse = await sessionAgent
      .post('/dev/get-magic-link')
      .send({ email: 'test2@example.com' })
      .expect(200);

    const magicLink = magicResponse.body.magicLink;
    const tokenMatch = magicLink.match(/token=([^&]+)/);

    await sessionAgent
      .get(`/auth/verify?token=${tokenMatch[1]}`)
      .expect(302);

    // Test team leaderboard endpoint
    const response = await sessionAgent
      .get('/api/team-leaderboard')
      .expect(200);

    expect(response.body).toHaveProperty('type');
    expect(response.body).toHaveProperty('data');
  });

  test('should require authentication for leaderboard access', async () => {
    const response = await agent
      .get('/api/leaderboard')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});