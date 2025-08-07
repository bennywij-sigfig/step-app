/**
 * Jest Test Sequencer for Integration Tests
 * 
 * Ensures tests run in optimal order for database stability
 */

const Sequencer = require('@jest/test-sequencer').default;

class DatabaseOptimizedSequencer extends Sequencer {
  sort(tests) {
    // Sort tests to run most stable ones first
    return tests.sort((testA, testB) => {
      // Run auth tests first (least database intensive)
      if (testA.path.includes('auth-flow') && !testB.path.includes('auth-flow')) {
        return -1;
      }
      if (!testA.path.includes('auth-flow') && testB.path.includes('auth-flow')) {
        return 1;
      }
      
      // Run database integrity tests last (most intensive)
      if (testA.path.includes('database-integrity') && !testB.path.includes('database-integrity')) {
        return 1;
      }
      if (!testA.path.includes('database-integrity') && testB.path.includes('database-integrity')) {
        return -1;
      }
      
      // Run leaderboard tests in middle (moderate intensity)
      if (testA.path.includes('leaderboard') && !testB.path.includes('leaderboard')) {
        return 0;
      }
      
      // Default alphabetical order
      return testA.path.localeCompare(testB.path);
    });
  }
}

module.exports = DatabaseOptimizedSequencer;