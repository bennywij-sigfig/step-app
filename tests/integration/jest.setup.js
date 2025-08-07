/**
 * Jest Setup for Integration Tests
 * 
 * Configures stable test environment and database handling
 */

const { cleanupGlobalPool } = require('../environments/shared/database-pool');

// Increase timeouts globally for integration tests
jest.setTimeout(30000);

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMITING = 'true';
process.env.SESSION_SECRET = 'test-session-secret-integration';
process.env.CSRF_SECRET = 'test-csrf-secret-integration';

// Add stable database configuration
process.env.SQLITE_BUSY_TIMEOUT = '30000';
process.env.DB_POOL_MAX = '1';

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in tests, just warn
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.warn('Uncaught Exception:', error);
  // Don't exit process in tests, just warn
});

// Global cleanup on exit
process.on('exit', async () => {
  await cleanupGlobalPool();
});

// Include console helper functions from main test setup
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

console.log('✅ Integration test setup complete');