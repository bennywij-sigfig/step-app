/**
 * Jest Teardown for Integration Tests
 * 
 * Ensures proper cleanup of database pools and connections
 */

const { cleanupGlobalPool } = require('../environments/shared/database-pool');

module.exports = async () => {
  console.log('🧹 Starting integration test teardown...');
  
  // Clean up database pool
  await cleanupGlobalPool();
  
  // Force cleanup of any remaining handles
  if (global.gc) {
    global.gc();
  }
  
  console.log('✅ Integration test teardown complete');
};