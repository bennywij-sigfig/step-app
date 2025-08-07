/**
 * Jest Test Setup
 * Global setup for all Jest tests
 */

const fs = require('fs');
const path = require('path');
const { cleanupGlobalPool } = require('./environments/shared/database-pool');

// Ensure test database directory exists
const testDbDir = path.join(__dirname, 'test-databases');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.SESSION_SECRET = 'test-session-secret-key';
process.env.CSRF_SECRET = 'test-csrf-secret-key';

// Disable rate limiting in tests
process.env.DISABLE_RATE_LIMITING = 'true';

// Use test database path
process.env.DB_PATH = path.join(testDbDir, `test-${Date.now()}-${Math.random()}.db`);

// Suppress console output during tests (can be overridden per test)
const originalConsole = { ...console };
global.restoreConsole = () => {
  Object.assign(console, originalConsole);
};

global.suppressConsole = () => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
};

// Clean up function for afterEach hooks
global.cleanupTest = async () => {
  // Remove test database if it exists
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
  
  // Reset environment
  delete process.env.DB_PATH;
};

// Global test timeout
jest.setTimeout(30000);

// Global cleanup on test run completion
afterAll(async () => {
  await cleanupGlobalPool();
});