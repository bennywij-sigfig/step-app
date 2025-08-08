/**
 * Basic Integration Test - Minimal Approach
 * 
 * Tests critical functionality without complex server initialization
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

describe('Basic Integration Tests', () => {
  let app;
  let testDbPath;
  let db;

  beforeEach(async () => {
    // Create a unique test database
    const randomId = crypto.randomBytes(8).toString('hex');
    testDbPath = path.join(__dirname, '..', '..', 'test-databases', `basic-${randomId}.db`);
    
    // Ensure directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Set environment before requiring server
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_RATE_LIMITING = 'true';
    process.env.SESSION_SECRET = 'test-session-secret-basic';
    process.env.CSRF_SECRET = 'test-csrf-secret-basic';
    process.env.TEST_DB_INIT = 'true';

    // Clear cache and require server
    delete require.cache[require.resolve('../../../src/server.js')];
    delete require.cache[require.resolve('../../../src/database.js')];
    
    try {
      app = require('../../../src/server.js');
      // Give server a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Create direct database connection for test data
      db = new sqlite3.Database(testDbPath);
      db.configure('busyTimeout', 10000);
    } catch (error) {
      console.error('Server initialization error:', error);
      throw error;
    }
  });

  afterEach(async () => {
    // Clean up database connection
    if (db) {
      await new Promise(resolve => {
        db.close(() => resolve());
      });
    }

    // Clean up server
    if (app && app.server) {
      await new Promise(resolve => {
        app.server.close(() => resolve());
      });
    }

    // Clean up database files
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  test('should handle health endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
  });

  test('should require auth for leaderboard', async () => {
    const response = await request(app)
      .get('/api/leaderboard')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  test('should generate magic links', async () => {
    const response = await request(app)
      .post('/dev/get-magic-link')
      .send({ email: 'basictest@example.com' })
      .expect(200);

    expect(response.body).toHaveProperty('magicLink');
    expect(response.body.magicLink).toContain('token=');
  });
});