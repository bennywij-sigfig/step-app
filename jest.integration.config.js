/**
 * Jest Configuration for Integration Tests
 * 
 * Optimized for stability with SQLite database connections
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/integration/**/*.test.js'
  ],
  testTimeout: 30000, // 30 second timeout per test
  setupFilesAfterEnv: ['<rootDir>/tests/integration/jest.setup.js'],
  globalTeardown: '<rootDir>/tests/integration/jest.teardown.js',
  
  // Force sequential execution to avoid database conflicts
  maxWorkers: 1,
  
  // Handle async cleanup properly
  forceExit: true,
  detectOpenHandles: true,
  
  // Collect coverage from integration tests
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/scripts/**',
    '!**/node_modules/**'
  ],
  
  // Verbose output for debugging
  verbose: true
};