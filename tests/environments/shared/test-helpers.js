/**
 * Shared Test Helpers
 * Utilities used across all test suites
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

/**
 * Create test database with clean state
 */
function createTestDatabase() {
  const testDbPath = process.env.DB_PATH || path.join(__dirname, '../../test-databases', `test-${Date.now()}.db`);
  
  // Ensure directory exists
  const dbDir = path.dirname(testDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  return testDbPath;
}

/**
 * Clean up test database
 */
function cleanupTestDatabase(dbPath) {
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
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
 * Create CSRF token for tests
 */
async function getCsrfToken(agent) {
  const response = await agent
    .get('/api/csrf-token')
    .expect(200);
    
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
  cleanupTestDatabase,
  createTestUser,
  createTestAdmin,
  createTestSteps,
  createTestChallenge,
  createTestTeam,
  getAuthenticatedSession,
  getCsrfToken,
  wait,
  generateRandomEmail,
  generateRandomSteps,
  expectValidApiResponse,
  expectValidErrorResponse
};