const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use persistent volume in production, local file in development
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/data/steps.db' 
  : path.join(__dirname, 'steps.db');

// Ensure data directory exists and is writable in production
if (process.env.NODE_ENV === 'production') {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
  }
  
  // Check if we can write to the directory
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log(`✅ Data directory ${dataDir} is writable`);
  } catch (err) {
    console.error(`❌ Data directory ${dataDir} is not writable:`, err.message);
    process.exit(1);
  }

  // Test writing to the directory to ensure it actually works
  const testFile = path.join(dataDir, 'test-write.tmp');
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✅ Confirmed write access to ${dataDir}`);
  } catch (err) {
    console.error(`❌ Cannot write test file to ${dataDir}:`, err.message);
    process.exit(1);
  }

  // If database file exists but is readonly, move it and create fresh
  if (fs.existsSync(dbPath)) {
    try {
      fs.accessSync(dbPath, fs.constants.W_OK);
      console.log(`✅ Database file ${dbPath} is writable`);
    } catch (err) {
      console.log(`🔧 Database file is readonly, creating backup and fresh database`);
      const backupPath = `${dbPath}.readonly.backup`;
      try {
        // Create backup of readonly database
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(dbPath, backupPath);
          console.log(`📦 Backed up readonly database to ${backupPath}`);
        }
        // Remove readonly database
        fs.unlinkSync(dbPath);
        console.log(`🗑️  Removed readonly database file`);
      } catch (removeErr) {
        console.error(`❌ Cannot backup/remove readonly database:`, removeErr.message);
        process.exit(1);
      }
    }
  }
}

console.log(`📁 Using database path: ${dbPath}`);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Configure SQLite for better reliability
db.configure('busyTimeout', 30000); // 30 second timeout for busy database
db.run('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better concurrency
db.run('PRAGMA synchronous = NORMAL'); // Balance between safety and performance
db.run('PRAGMA temp_store = MEMORY'); // Use memory for temporary storage

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    team TEXT,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Failed to create users table:', err.message);
      process.exit(1);
    }
    console.log('✅ Users table ready');
  });

  // Teams table
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Steps table
  db.run(`CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(user_id, date)
  )`);

  // Auth tokens table
  db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Challenges table
  db.run(`CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    reporting_threshold INTEGER DEFAULT 90 CHECK (reporting_threshold >= 0 AND reporting_threshold <= 100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add challenge_id column to steps table if it doesn't exist
  db.run(`PRAGMA table_info(steps)`, (err, rows) => {
    if (err) {
      console.error('Error checking steps table:', err);
      return;
    }
  });
  
  // Try to add challenge_id column (will fail silently if column already exists)
  db.run(`ALTER TABLE steps ADD COLUMN challenge_id INTEGER REFERENCES challenges(id)`, (err) => {
    // This will fail if column already exists, which is expected
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding challenge_id column:', err);
    }
  });

  // Try to add challenge_day column for consistency tracking
  db.run(`ALTER TABLE steps ADD COLUMN challenge_day INTEGER`, (err) => {
    // This will fail if column already exists, which is expected
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding challenge_day column:', err);
    }
  });

  // Try to add reporting_threshold column to challenges table for production compatibility
  db.run(`ALTER TABLE challenges ADD COLUMN reporting_threshold INTEGER DEFAULT 70 CHECK (reporting_threshold >= 0 AND reporting_threshold <= 100)`, (err) => {
    // This will fail if column already exists, which is expected
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding reporting_threshold column:', err);
    } else {
      console.log('✅ Added reporting_threshold column to challenges table');
    }
  });

  // Try to add timezone column to challenges table for production compatibility  
  db.run(`ALTER TABLE challenges ADD COLUMN timezone TEXT DEFAULT 'America/Los_Angeles'`, (err) => {
    // This will fail if column already exists, which is expected
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding timezone column:', err);
    } else {
      console.log('✅ Added timezone column to challenges table');
    }
  });

  // Try to add created_at column to challenges table for production compatibility
  db.run(`ALTER TABLE challenges ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
    // This will fail if column already exists, which is expected
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding created_at column:', err);
    } else {
      console.log('✅ Added created_at column to challenges table');
    }
  });

  // Add critical performance indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_steps_challenge_date_user ON steps(challenge_id, date, user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_steps_user_challenge ON steps(user_id, challenge_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active) WHERE is_active = 1`);
  
  // Add constraint to prevent multiple active challenges (SQLite doesn't support partial unique indexes easily)
  // We'll handle this in application logic for now

  // Insert sample teams
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Alpha')`);
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Beta')`);
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Gamma')`);
  
  // Create admin users
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benny@sigfig.com', 'Benny', 1)`);
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benazir.qureshi@sigfig.com', 'Benazir', 1)`);
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('liz.ridge@sigfig.com', 'Liz', 1)`);
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('megan.crowley@sigfig.com', 'Megan', 1)`);
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('amit.srivastava@sigfig.com', 'Amit', 1)`);
});

// Database utility functions for reliability
const dbUtils = {
  // Execute database operation with retry logic for SQLITE_BUSY errors
  executeWithRetry: function(operation, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      function attempt() {
        attempts++;
        operation((err, result) => {
          if (err) {
            // Retry on SQLITE_BUSY or SQLITE_LOCKED errors
            if ((err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') && attempts < maxRetries) {
              const delay = Math.pow(2, attempts) * 100; // Exponential backoff: 200ms, 400ms, 800ms
              console.warn(`Database busy, retrying in ${delay}ms... (${attempts}/${maxRetries})`);
              setTimeout(attempt, delay);
              return;
            }
            reject(err);
          } else {
            resolve(result);
          }
        });
      }
      
      attempt();
    });
  },

  // Check database health and integrity
  checkHealth: function() {
    return new Promise((resolve) => {
      const health = {
        accessible: false,
        integrity: false,
        diskSpace: false,
        error: null
      };

      // Test basic database access with timeout
      const timeout = setTimeout(() => {
        resolve({ ...health, error: 'Database query timeout' });
      }, 5000);

      db.get('SELECT 1 as test', (err, result) => {
        if (err) {
          clearTimeout(timeout);
          resolve({ ...health, error: err.message });
          return;
        }

        health.accessible = true;

        // Check database integrity
        db.get('PRAGMA integrity_check', (err, integrityResult) => {
          if (!err && integrityResult && integrityResult.integrity_check === 'ok') {
            health.integrity = true;
          }

          // Check disk space
          try {
            const stats = fs.statSync(path.dirname(dbPath));
            health.diskSpace = true; // If we can stat, assume space is available
          } catch (diskErr) {
            // Can't check disk space, but don't fail health check
          }

          clearTimeout(timeout);
          resolve(health);
        });
      });
    });
  },

  // Get database statistics
  getStats: function() {
    return new Promise((resolve, reject) => {
      const stats = {};
      
      db.get('SELECT COUNT(*) as users FROM users', (err, result) => {
        if (err) return reject(err);
        stats.users = result.users;
        
        db.get('SELECT COUNT(*) as steps FROM steps', (err, result) => {
          if (err) return reject(err);
          stats.steps = result.steps;
          
          db.get('SELECT COUNT(*) as teams FROM teams', (err, result) => {
            if (err) return reject(err);
            stats.teams = result.teams;
            resolve(stats);
          });
        });
      });
    });
  },

  // Create database backup using SQLite .backup() API (WAL-compatible)
  createBackup: function(backupPath = null) {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = process.env.NODE_ENV === 'production' ? '/data/backups' : './backups';
      const defaultPath = `${backupDir}/steps-${timestamp}.db`;
      const targetPath = backupPath || defaultPath;
      
      // Ensure backup directory exists
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
          console.log(`📁 Created backup directory: ${targetDir}`);
        } catch (err) {
          return reject(new Error(`Cannot create backup directory: ${err.message}`));
        }
      }

      // Use SQLite backup API (compatible with WAL mode)
      const backup = db.backup(targetPath);
      
      backup.step(-1, (err) => {
        if (err) {
          backup.finish();
          console.error('❌ Backup step failed:', err);
          reject(err);
        } else {
          backup.finish((finishErr) => {
            if (finishErr) {
              console.error('❌ Backup finish failed:', finishErr);
              reject(finishErr);
            } else {
              const stats = fs.statSync(targetPath);
              console.log(`✅ Database backed up to: ${targetPath} (${stats.size} bytes)`);
              resolve({ 
                success: true, 
                path: targetPath,
                size: stats.size,
                timestamp: new Date().toISOString()
              });
            }
          });
        }
      });
    });
  },

  // Clean up old backup files
  cleanupOldBackups: function(maxBackups = 10) {
    return new Promise((resolve, reject) => {
      const backupDir = process.env.NODE_ENV === 'production' ? '/data/backups' : './backups';
      
      if (!fs.existsSync(backupDir)) {
        return resolve({ cleaned: 0, kept: 0 });
      }

      try {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('steps-') && f.endsWith('.db'))
          .map(f => ({
            name: f,
            path: path.join(backupDir, f),
            mtime: fs.statSync(path.join(backupDir, f)).mtime
          }))
          .sort((a, b) => b.mtime - a.mtime); // Newest first

        const toKeep = files.slice(0, maxBackups);
        const toDelete = files.slice(maxBackups);

        let deleted = 0;
        toDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log(`🗑️ Deleted old backup: ${file.name}`);
            deleted++;
          } catch (e) {
            console.warn(`Could not delete ${file.name}:`, e.message);
          }
        });

        resolve({ 
          cleaned: deleted, 
          kept: toKeep.length,
          backups: toKeep.map(f => ({ name: f.name, date: f.mtime }))
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  // Get backup status for health monitoring
  getBackupStatus: function() {
    return new Promise((resolve) => {
      const backupDir = process.env.NODE_ENV === 'production' ? '/data/backups' : './backups';
      
      if (!fs.existsSync(backupDir)) {
        return resolve({ 
          hasBackups: false, 
          count: 0,
          latest: null,
          error: 'Backup directory does not exist'
        });
      }

      try {
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('steps-') && f.endsWith('.db'))
          .map(f => {
            const stats = fs.statSync(path.join(backupDir, f));
            return {
              name: f,
              size: stats.size,
              created: stats.mtime
            };
          })
          .sort((a, b) => b.created - a.created);

        if (files.length === 0) {
          resolve({ hasBackups: false, count: 0, latest: null });
        } else {
          const latest = files[0];
          resolve({
            hasBackups: true,
            count: files.length,
            latest: {
              name: latest.name,
              size: latest.size,
              created: latest.created,
              age: Date.now() - latest.created.getTime()
            }
          });
        }
      } catch (err) {
        resolve({ 
          hasBackups: false, 
          count: 0, 
          latest: null, 
          error: err.message 
        });
      }
    });
  }
};

// Attach utilities to the database object
db.utils = dbUtils;

module.exports = db;