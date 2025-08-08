/**
 * Simple Test Stabilizer - Direct Database Management
 * 
 * Bypasses the complex database pool system that's causing hangs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class SimpleTestStabilizer {
  constructor() {
    this.activeConnections = new Map();
    this.serverInstances = new Map();
    this.testDbDir = path.join(process.cwd(), 'tests', 'test-databases');
    
    // Ensure test database directory exists
    if (!fs.existsSync(this.testDbDir)) {
      fs.mkdirSync(this.testDbDir, { recursive: true });
    }
  }

  /**
   * Create a simple test database with basic schema
   */
  async createTestDatabase() {
    const randomId = crypto.randomBytes(16).toString('hex');
    const dbPath = path.join(this.testDbDir, `test-${randomId}.db`);
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);
        
        // Configure for stability
        db.configure('busyTimeout', 30000);
        
        // Create basic schema
        db.serialize(() => {
          // Users table
          db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            team TEXT DEFAULT 'No Team',
            is_admin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          // Challenges table
          db.run(`CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            reporting_threshold INTEGER DEFAULT 70,
            timezone TEXT DEFAULT 'America/Los_Angeles',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          // Steps table
          db.run(`CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            count INTEGER NOT NULL,
            challenge_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (challenge_id) REFERENCES challenges (id),
            UNIQUE(user_id, date, challenge_id)
          )`);
          
          // Sessions table
          db.run(`CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expire DATETIME NOT NULL
          )`);
          
          // Auth tokens table
          db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            used BOOLEAN DEFAULT 0
          )`);
          
          db.close((err) => {
            if (err) return reject(err);
            resolve(dbPath);
          });
        });
      });
    });
  }

  /**
   * Get stable database connection with proper configuration
   */
  async getStableDatabase(testName) {
    const dbPath = await this.createTestDatabase();
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) return reject(err);
        
        // Configure for maximum stability
        db.configure('busyTimeout', 30000);
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA synchronous = NORMAL');
        db.run('PRAGMA temp_store = MEMORY');
        db.run('PRAGMA cache_size = -2000');
        
        this.activeConnections.set(testName, { db, dbPath });
        resolve(db);
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
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.CSRF_SECRET = 'test-csrf-secret';

    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('src/server.js') || key.includes('src/database.js')) {
        delete require.cache[key];
      }
    });

    // Import fresh server
    const app = require('../../src/server.js');
    
    // Wait for proper initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.serverInstances.set(testName, app);
    return app;
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
        
        // Clean up database file
        try {
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const walPath = `${dbPath}-wal`;
          const shmPath = `${dbPath}-shm`;
          if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
          if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        } catch (error) {
          console.warn('File cleanup error:', error.message);
        }
        
        this.activeConnections.delete(testName);
        resolve();
      });
    });
  }

  /**
   * Close server instance properly
   */
  async closeServer(testName) {
    const app = this.serverInstances.get(testName);
    if (!app) return;

    return new Promise((resolve) => {
      if (app.server) {
        const timeout = setTimeout(resolve, 2000);
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

module.exports = SimpleTestStabilizer;