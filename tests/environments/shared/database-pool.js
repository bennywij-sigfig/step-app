/**
 * Database Connection Pool for Integration Tests
 * 
 * Provides fast, reliable database connections by:
 * 1. Creating a template database once with full schema
 * 2. Cloning template for each test (10x faster than full creation)
 * 3. Pool of ready databases to avoid creation overhead
 * 4. Proper cleanup to prevent connection leaks
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class TestDatabasePool {
  constructor() {
    this.inUse = new Set();
    this.templateDbPath = null;
    this.initialized = false;
  }

  /**
   * Initialize the pool - creates template database only
   */
  async initializePool() {
    if (this.initialized) return;

    console.log('📋 Initializing database template...');
    
    // Create template database once
    this.templateDbPath = await this.createTemplateDatabase();
    console.log(`📋 Template database ready: ${this.templateDbPath}`);
    
    this.initialized = true;
  }

  /**
   * Create template database with full schema
   */
  async createTemplateDatabase() {
    const testDbDir = path.join(__dirname, '../../test-databases');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    const templatePath = path.join(testDbDir, 'template.db');
    
    // Always recreate template to ensure it's current
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    
    return this.buildTemplate(templatePath);
  }

  /**
   * Build template database with optimized performance
   */
  async buildTemplate(templatePath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(templatePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
      
      // Configure for maximum speed during template creation
      db.configure('busyTimeout', 5000);
      db.run('PRAGMA journal_mode = MEMORY'); // No WAL files
      db.run('PRAGMA synchronous = OFF');     // Skip fsync for speed
      db.run('PRAGMA temp_store = MEMORY');   // Memory temp storage
      db.run('PRAGMA locking_mode = NORMAL'); // Allow test and app connections
      
      // Create all tables and indexes in single transaction for speed
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const tables = this.getTableDefinitions();
        const indexes = this.getIndexDefinitions();
        
        let completedOps = 0;
        const totalOps = tables.length + indexes.length;
        
        const checkComplete = (err) => {
          if (err) {
            console.error('Template creation error:', err);
            db.run('ROLLBACK');
            db.close();
            return reject(err);
          }
          
          completedOps++;
          if (completedOps === totalOps) {
            // All operations complete, commit and close
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                db.close();
                return reject(commitErr);
              }
              
              db.close((closeErr) => {
                if (closeErr) {
                  return reject(closeErr);
                }
                resolve(templatePath);
              });
            });
          }
        };
        
        // Execute all table creations
        tables.forEach(sql => db.run(sql, checkComplete));
        
        // Execute all index creations
        indexes.forEach(sql => db.run(sql, checkComplete));
      });
    });
  }

  /**
   * Get database from pool - creates fresh clone each time to avoid locking
   */
  async acquireDatabase() {
    if (!this.initialized) {
      await this.initializePool();
    }

    // Always create a fresh clone to avoid database locking issues
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const clonePath = path.join(path.dirname(this.templateDbPath), `clone-${timestamp}-${randomId}.db`);
    
    fs.copyFileSync(this.templateDbPath, clonePath);
    this.inUse.add(clonePath);
    
    return clonePath;
  }

  /**
   * Return database to pool - just clean up the file since we create fresh clones
   */
  async releaseDatabase(dbPath) {
    if (this.inUse.has(dbPath)) {
      this.inUse.delete(dbPath);
      
      // Always clean up - no reuse to avoid locking issues
      this.cleanupDatabase(dbPath);
    }
  }



  /**
   * Clean up database file and associated WAL/SHM files
   */
  cleanupDatabase(dbPath) {
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      
      // Clean up WAL and SHM files
      const walPath = dbPath + '-wal';
      const shmPath = dbPath + '-shm';
      
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
      
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  }

  /**
   * Cleanup entire pool
   */
  async cleanup() {
    // Clean up any in-use databases
    for (const dbPath of this.inUse) {
      this.cleanupDatabase(dbPath);
    }
    
    // Clean up template
    if (this.templateDbPath) {
      this.cleanupDatabase(this.templateDbPath);
    }
    
    this.inUse.clear();
    this.initialized = false;
    
    console.log('🧹 Database template cleaned up');
  }

  /**
   * Get exact table definitions from the main application
   */
  getTableDefinitions() {
    return [
      // Teams table - exact match from src/database.js
      `CREATE TABLE teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Users table retains an empty legacy column only for rollback migration tests.
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        team TEXT,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT NULL
      )`,

      // Steps table - includes challenge_id column that gets added by ALTER TABLE in main app
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

      // Auth tokens table - exact match from src/database.js
      `CREATE TABLE auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Challenges table - exact match from src/database.js
      `CREATE TABLE challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 0,
        timezone TEXT DEFAULT 'America/Los_Angeles',
        reporting_threshold INTEGER DEFAULT 90 CHECK (reporting_threshold >= 0 AND reporting_threshold <= 100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT UNIQUE NOT NULL,
        token_prefix TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      `CREATE TABLE api_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE trotter_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Settings table - exact match from src/database.js
      `CREATE TABLE settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];
  }

  /**
   * Get complete index definitions including challenge_id indexes
   */
  getIndexDefinitions() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_steps_challenge_date_user ON steps(challenge_id, date, user_id)',
      'CREATE INDEX IF NOT EXISTS idx_steps_user_challenge ON steps(user_id, challenge_id)', 
      'CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active) WHERE is_active = 1',
      'CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_api_tokens_expires ON api_tokens(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_api_audit_token_created ON api_audit_log(token_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_api_audit_created ON api_audit_log(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_trotter_audit_created ON trotter_audit_log(created_at)'
    ];
  }
}

// Global pool instance
let globalPool = null;

/**
 * Get the global database pool instance
 */
function getDatabasePool() {
  if (!globalPool) {
    globalPool = new TestDatabasePool(); // Template-only approach for better reliability
  }
  return globalPool;
}

/**
 * Cleanup global pool (for test teardown)
 */
async function cleanupGlobalPool() {
  if (globalPool) {
    await globalPool.cleanup();
    globalPool = null;
  }
}

module.exports = {
  TestDatabasePool,
  getDatabasePool,
  cleanupGlobalPool
};