/**
 * Simple Integration Test 
 * 
 * Basic test to verify database and server stability fixes work
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const SimpleTestStabilizer = require('../test-stabilizer-simple');

describe('Simple Integration Tests', () => {
  let stabilizer;
  let app;
  let db;
  let agent;
  const testName = 'simple-test';

  beforeAll(() => {
    stabilizer = new SimpleTestStabilizer();
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

  test('should handle basic server health check', async () => {
    const response = await agent
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('database');
  });

  test('should require authentication for protected endpoints', async () => {
    const response = await agent
      .get('/api/leaderboard')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  test('should handle magic link generation', async () => {
    const response = await agent
      .post('/dev/get-magic-link')
      .send({ email: 'test@example.com' })
      .expect(200);

    expect(response.body).toHaveProperty('magicLink');
    expect(response.body.magicLink).toContain('token=');
  });
});