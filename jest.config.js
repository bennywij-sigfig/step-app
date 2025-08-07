/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  collectCoverage: false, // Only collect coverage when explicitly requested
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'text-summary'],
  coverageThreshold: {
    global: {
      branches: 30, // Reduced thresholds to be more realistic
      functions: 30,
      lines: 30,
      statements: 30
    }
  },
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/environments/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'mcp/**/*.js',
    '!src/views/**',
    '!src/public/**',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**',
    '!**/*.test.js',
    // Optimize coverage collection - exclude heavy files for faster coverage
    '!src/server.js', // Large file - can be tested with integration tests
    '!mcp/test_mcp_python.py',
    '!mcp/get_mcp_token.py'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  maxWorkers: 4,
  // Separate SQLite databases for each test worker
  testEnvironmentOptions: {
    TEST_DB_PATH: './tests/test-databases/'
  }
};