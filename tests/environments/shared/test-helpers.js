/**
 * Shared Test Helpers
 * Utilities used across all test suites
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { getDatabasePool } = require('./database-pool');

/**
 * Create test database using connection pool (fast)
 */
async function createTestDatabase() {
  const pool = getDatabasePool();
  const dbPath = await pool.acquireDatabase();
  return dbPath;
}

/**
 * Initialize test database with all required tables
 * This ensures all schema is ready before tests run
 */
async function initializeTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        return reject(err);
      }
    });

    // Configure SQLite for better reliability
    db.configure('busyTimeout', 30000);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA temp_store = MEMORY');

    // Initialize all tables in order with proper error handling
    db.serialize(() => {
      const tables = [
        // Users table
        `CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          team TEXT,
          is_admin BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Teams table
        `CREATE TABLE teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Challenges table
        `CREATE TABLE challenges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 0,
          timezone TEXT DEFAULT 'America/Los_Angeles',
          reporting_threshold INTEGER DEFAULT 70 CHECK (reporting_threshold >= 0 AND reporting_threshold <= 100),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Steps table
        `CREATE TABLE steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          count INTEGER NOT NULL,
          challenge_id INTEGER REFERENCES challenges(id),
          challenge_day INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          UNIQUE(user_id, date)
        )`,

        // Auth tokens table
        `CREATE TABLE auth_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Sessions table
        `CREATE TABLE sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`,

        // MCP tokens table
        `CREATE TABLE mcp_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          permissions TEXT DEFAULT 'read_write' CHECK (permissions IN ('read_only', 'read_write')),
          scopes TEXT DEFAULT 'steps:read,steps:write,profile:read',
          expires_at DATETIME NOT NULL,
          last_used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`,

        // MCP audit log table
        `CREATE TABLE mcp_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          params TEXT,
          old_value TEXT,
          new_value TEXT,
          was_overwrite BOOLEAN DEFAULT 0,
          ip_address TEXT,
          user_agent TEXT,
          success BOOLEAN DEFAULT 1,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (token_id) REFERENCES mcp_tokens (id),
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`,

        // Settings table
        `CREATE TABLE settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      const indexes = [
        // Performance indexes
        `CREATE INDEX IF NOT EXISTS idx_steps_challenge_date_user ON steps(challenge_id, date, user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_steps_user_challenge ON steps(user_id, challenge_id)`,
        `CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active) WHERE is_active = 1`,
        `CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires ON mcp_tokens(expires_at)`,
        `CREATE INDEX IF NOT EXISTS idx_mcp_audit_token_user ON mcp_audit_log(token_id, user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON mcp_audit_log(created_at)`
      ];

      let completedOperations = 0;
      const totalOperations = tables.length + indexes.length;
      let hasError = false;

      const checkComplete = (err) => {
        if (err && !hasError) {
          hasError = true;
          db.close();
          return reject(err);
        }
        
        completedOperations++;
        if (completedOperations === totalOperations && !hasError) {
          // All tables and indexes created successfully
          db.close((closeErr) => {
            if (closeErr) {
              return reject(closeErr);
            }
            resolve(dbPath);
          });
        }
      };

      // Create all tables
      tables.forEach(tableSQL => {
        db.run(tableSQL, checkComplete);
      });

      // Create all indexes
      indexes.forEach(indexSQL => {
        db.run(indexSQL, checkComplete);
      });
    });
  });
}

/**
 * Close database connections properly
 */
async function closeDatabaseConnections() {
  // Give time for any pending operations to complete
  await wait(50);
  
  // Clear the database module from require cache to ensure fresh connections
  delete require.cache[require.resolve('../../../src/database.js')];
}

/**
 * Clean up test database using connection pool
 */
async function cleanupTestDatabase(dbPath) {
  // First close any open connections
  await closeDatabaseConnections();
  
  // Return database to pool instead of deleting
  if (dbPath) {
    const pool = getDatabasePool();
    await pool.releaseDatabase(dbPath);
  }
}

/**
 * Create test user data
 */
function createTestUser(overrides = {}) {
  return {
    email: 'test@example.com',
    name: 'Test User',
    team_id: 1,
    is_admin: false,
    ...overrides
  };
}

/**
 * Create test admin user data
 */
function createTestAdmin(overrides = {}) {
  return createTestUser({
    email: 'admin@example.com',
    name: 'Test Admin',
    is_admin: true,
    ...overrides
  });
}

/**
 * Create test step data
 */
function createTestSteps(overrides = {}) {
  return {
    user_id: 1,
    date: '2025-08-02',
    count: 10000,
    challenge_id: 1,
    ...overrides
  };
}

/**
 * Create test challenge data
 */
function createTestChallenge(overrides = {}) {
  return {
    name: 'Test Challenge',
    start_date: '2025-08-01',
    end_date: '2025-08-31',
    reporting_threshold: 0.7,
    ...overrides
  };
}

/**
 * Create test team data
 */
function createTestTeam(overrides = {}) {
  return {
    name: 'Test Team',
    ...overrides
  };
}

/**
 * Get authenticated session for tests
 */
async function getAuthenticatedSession(app, userEmail = 'test@example.com') {
  const agent = request.agent(app);
  
  // Create magic link session (simplified for tests)
  const response = await agent
    .post('/auth/send-link')
    .send({ email: userEmail })
    .expect(200);
    
  // In real implementation, we'd need to extract token and verify
  // For tests, we can mock the session creation
  return agent;
}

/**
 * Create authenticated session with CSRF token - Enhanced error handling
 * This replaces the common pattern in tests and provides better error reporting
 */
async function createAuthenticatedSessionWithCsrf(app, userEmail = null) {
  const testEmail = userEmail || generateRandomEmail();
  const agent = request.agent(app);
  
  try {
    // Step 1: Get magic link with detailed error handling
    const magicResponse = await agent
      .post('/dev/get-magic-link')
      .send({ email: testEmail });
    
    if (magicResponse.status === 500) {
      throw new Error(`Server error getting magic link (500): ${magicResponse.body?.error || 'Unknown server error'}. This likely indicates a server startup or import issue.`);
    }
    
    if (magicResponse.status !== 200) {
      throw new Error(`Failed to get magic link (${magicResponse.status}): ${magicResponse.body?.error || 'Unknown error'}`);
    }
    
    if (!magicResponse.body?.magicLink) {
      throw new Error(`Magic link missing from response. Response: ${JSON.stringify(magicResponse.body)}`);
    }
    
    // Step 2: Extract and use token
    const magicUrl = new URL(magicResponse.body.magicLink);
    const token = magicUrl.searchParams.get('token');
    
    if (!token) {
      throw new Error(`Token missing from magic link URL: ${magicResponse.body.magicLink}`);
    }
    
    // Step 3: Authenticate
    const authResponse = await agent
      .get('/auth/verify')
      .query({ token });
    
    if (authResponse.status !== 302) {
      throw new Error(`Authentication failed (${authResponse.status}): Expected redirect after token verification`);
    }
    
    // Step 4: Get CSRF token with enhanced error handling
    const csrfToken = await getCsrfToken(agent);
    
    return { 
      agent, 
      csrfToken, 
      email: testEmail,
      magicLink: magicResponse.body.magicLink,
      authToken: token
    };
    
  } catch (error) {
    // Enhance error message with context
    const contextMessage = `Failed to create authenticated session for ${testEmail}`;
    if (error.message.includes('500')) {
      throw new Error(`${contextMessage}: ${error.message}. This is likely a server startup issue - check for missing imports or syntax errors.`);
    }
    throw new Error(`${contextMessage}: ${error.message}`);
  }
}

/**
 * Create CSRF token for tests with better error handling
 */
async function getCsrfToken(agent) {
  const response = await agent
    .get('/api/csrf-token');
    
  // Better error handling to distinguish between different failure types
  if (response.status === 500) {
    throw new Error(`Server error getting CSRF token (500): ${response.body?.error || 'Unknown server error'}. This likely indicates a missing import or server startup issue.`);
  }
  
  if (response.status === 401) {
    throw new Error(`Authentication required for CSRF token (401): ${response.body?.error || 'Not authenticated'}`);
  }
  
  if (response.status !== 200) {
    throw new Error(`Unexpected status getting CSRF token (${response.status}): ${response.body?.error || 'Unknown error'}`);
  }
  
  if (!response.body?.csrfToken) {
    throw new Error(`CSRF token missing from response body. Response: ${JSON.stringify(response.body)}`);
  }
    
  return response.body.csrfToken;
}

/**
 * Wait for async operations
 */
function wait(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random test data
 */
function generateRandomEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
}

function generateRandomSteps() {
  return Math.floor(Math.random() * 20000) + 1000; // 1000-21000 steps
}

/**
 * Validate API response structure
 */
function expectValidApiResponse(response, expectedKeys = []) {
  expect(response).toBeDefined();
  expect(typeof response).toBe('object');
  
  expectedKeys.forEach(key => {
    expect(response).toHaveProperty(key);
  });
}

/**
 * Validate error response structure
 */
function expectValidErrorResponse(response, expectedMessage = null) {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('error');
  
  if (expectedMessage) {
    expect(response.error).toContain(expectedMessage);
  }
}

module.exports = {
  createTestDatabase,
  initializeTestDatabase,
  cleanupTestDatabase,
  closeDatabaseConnections,
  createTestUser,
  createTestAdmin,
  createTestSteps,
  createTestChallenge,
  createTestTeam,
  getAuthenticatedSession,
  createAuthenticatedSessionWithCsrf,
  getCsrfToken,
  wait,
  generateRandomEmail,
  generateRandomSteps,
  expectValidApiResponse,
  expectValidErrorResponse
};