/**
 * Test Stabilizer - Addresses Database Connection Issues
 * 
 * This module provides stable database connections and test isolation
 * to fix SQLITE_BUSY and SQLITE_MISUSE errors in integration tests.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getDatabasePool } = require('../environments/shared/database-pool');

class TestStabilizer {
  constructor() {
    this.activeConnections = new Map();
    this.serverInstances = new Map();
    this.dbPool = getDatabasePool();
  }

  /**
   * Get stable database connection with proper configuration
   */
  async getStableDatabase(testName) {
    const dbPath = await this.dbPool.acquireDatabase();
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          return reject(err);
        }
        
        // Configure for maximum stability
        db.configure('busyTimeout', 30000); // 30 second timeout
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA synchronous = NORMAL');
        db.run('PRAGMA temp_store = MEMORY');
        db.run('PRAGMA cache_size = -2000'); // 2MB cache
        
        this.activeConnections.set(testName, { db, dbPath });
        resolve(db);
      });
    });
  }

  /**
   * Properly close database connection
   */
  async closeDatabase(testName) {
    const connection = this.activeConnections.get(testName);
    if (!connection) return;

    const { db, dbPath } = connection;
    
    return new Promise((resolve) => {
      db.close((err) => {
        if (err) console.warn('Database close error:', err);
        this.dbPool.releaseDatabase(dbPath);
        this.activeConnections.delete(testName);
        resolve();
      });
    });
  }

  /**
   * Get stable server instance with proper initialization
   */
  async getStableServer(testName, dbPath) {
    // Set environment for this test
    process.env.DB_PATH = dbPath;
    process.env.NODE_ENV = 'test';
    process.env.TEST_DB_INIT = 'true';
    process.env.DISABLE_RATE_LIMITING = 'true';

    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('src/server.js') || key.includes('src/database.js')) {
        delete require.cache[key];
      }
    });

    // Import fresh server
    const app = require('../../src/server.js');
    
    // Wait for proper initialization
    await this.waitForStableConnection(3000);
    
    this.serverInstances.set(testName, app);
    return app;
  }

  /**
   * Close server instance properly
   */
  async closeServer(testName) {
    const app = this.serverInstances.get(testName);
    if (!app) return;

    return new Promise((resolve) => {
      if (app.server) {
        const timeout = setTimeout(resolve, 2000); // Force close after 2s
        app.server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        resolve();
      }
      this.serverInstances.delete(testName);
    });
  }

  /**
   * Wait for stable database connection
   */
  async waitForStableConnection(timeoutMs = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        await new Promise((resolve, reject) => {
          const testDb = new sqlite3.Database(process.env.DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err);
            testDb.close(() => resolve());
          });
        });
        return; // Success
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error(`Database connection not stable after ${timeoutMs}ms`);
  }

  /**
   * Clean up all connections for test suite
   */
  async cleanupAll() {
    // Close all active connections
    for (const [testName] of this.activeConnections) {
      await this.closeDatabase(testName);
    }
    
    // Close all server instances
    for (const [testName] of this.serverInstances) {
      await this.closeServer(testName);
    }
    
    this.activeConnections.clear();
    this.serverInstances.clear();
  }
}

module.exports = TestStabilizer;