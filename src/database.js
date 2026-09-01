const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { assertExistingDatabaseWritable } = require('./utils/database-safety');

// Use persistent volume in production, local file in development, or test database path if specified
const dbPath = process.env.DB_PATH || 
  (process.env.NODE_ENV === 'production' 
    ? '/data/steps.db' 
    : path.join(__dirname, 'steps.db'));

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

  // Never replace an existing production database automatically. A permissions
  // or mount problem must fail startup and preserve the original for recovery.
  try {
    assertExistingDatabaseWritable(dbPath);
    if (fs.existsSync(dbPath)) {
      console.log(`✅ Database file ${dbPath} is writable`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    console.error('Refusing to delete or replace the existing database. Repair the volume or restore it explicitly.');
    process.exit(1);
  }
}

console.log(`📁 Using database path: ${dbPath}`);

// In test environments, delay database creation to avoid conflicts
const shouldDelayInit = process.env.NODE_ENV === 'test' && !process.env.DB_PATH;

let db;
if (shouldDelayInit) {
  // Create a mock database object for test environments that don't specify DB_PATH
  db = {
    get: () => {},
    run: () => {},
    all: () => {},
    close: () => {},
    serialize: (callback) => { if (callback) callback(); }
  };
  console.log('📝 Test mode - database initialization delayed');
} else {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    } else {
      console.log('✅ Connected to SQLite database');
    }
  });
}

// Configure SQLite based on environment - only for real databases
if (!shouldDelayInit) {
  if (process.env.NODE_ENV === 'test') {
    // Match the multi-connection integration harness while keeping test I/O light.
    db.configure('busyTimeout', 5000);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA temp_store = MEMORY');
    db.run('PRAGMA locking_mode = NORMAL');
  } else {
    // Production/development configuration
    db.configure('busyTimeout', 30000); // 30 second timeout for busy database
    db.run('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    db.run('PRAGMA synchronous = NORMAL'); // Balance between safety and performance
    db.run('PRAGMA temp_store = MEMORY'); // Use memory for temporary storage
  }
}

// Database initialization promise for tracking when setup is complete
let initializationResolve;
let initializationReject;
const initializationPromise = new Promise((resolve, reject) => {
  initializationResolve = resolve;
  initializationReject = reject;
});

async function normalizeUserTeams(database) {
  const run = (sql, params = []) => new Promise((resolve, reject) => {
    database.run(sql, params, function(error) {
      if (error) return reject(error);
      resolve({ changes: this.changes });
    });
  });
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const all = sql => new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });

  const columns = await all('PRAGMA table_info(users)');
  const hasLegacyTeam = columns.some(column => column.name === 'team');
  const hasTeamId = columns.some(column => column.name === 'team_id');

  await run('BEGIN IMMEDIATE');
  try {
    if (!hasTeamId) {
      await run('ALTER TABLE users ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL');
    }
    if (hasLegacyTeam) {
      await run(`UPDATE users
                 SET team_id = (SELECT id FROM teams WHERE teams.name = users.team)
                 WHERE team IS NOT NULL AND trim(team) != ''`);
      const unmatched = await get(`SELECT COUNT(*) AS count
                                   FROM users u
                                   LEFT JOIN teams t ON t.name = u.team
                                   WHERE u.team IS NOT NULL AND trim(u.team) != '' AND t.id IS NULL`);
      if (unmatched.count > 0) {
        throw new Error(`${unmatched.count} legacy team assignments could not be normalized`);
      }
      await run('UPDATE users SET team = NULL WHERE team IS NOT NULL');
    }
    const orphaned = await get(`SELECT COUNT(*) AS count
                                FROM users u LEFT JOIN teams t ON t.id = u.team_id
                                WHERE u.team_id IS NOT NULL AND t.id IS NULL`);
    if (orphaned.count > 0) throw new Error(`${orphaned.count} users reference missing teams`);
    await run('CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id)');
    await run('COMMIT');
    console.log('✅ User team assignments normalized to team_id');
  } catch (error) {
    await run('ROLLBACK').catch(() => {});
    throw error;
  }
}

// Initialize database tables - only for real databases
if (!shouldDelayInit) {
  db.serialize(() => {
  // Teams are first-class live entities. Historical challenge snapshots keep
  // copied names separately so later renames cannot rewrite history.
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Failed to create users table:', err.message);
      if (process.env.NODE_ENV !== 'test') process.exit(1);
    }
    console.log('✅ Users table ready');
  });

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
  )`, (err) => {
    if (err) {
      console.error('❌ Failed to create auth_tokens table:', err.message);
      process.exit(1);
    }
    console.log('✅ Auth tokens table ready');
  });

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
    } else if (!err) {
      console.log('✅ Added created_at column to challenges table');
    }
  });

  // Track the one-time team rollover used to prepare a new challenge.
  db.run(`ALTER TABLE challenges ADD COLUMN teams_prepared_at DATETIME DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding teams_prepared_at column:', err);
    }
  });
  db.run(`ALTER TABLE challenges ADD COLUMN previous_challenge_id INTEGER DEFAULT NULL REFERENCES challenges(id)`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding previous_challenge_id column:', err);
    }
  });

  // MCP tokens table for API access with enhanced security
  db.run(`CREATE TABLE IF NOT EXISTS mcp_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read_write' CHECK (permissions IN ('read_only', 'read_write')),
    scopes TEXT DEFAULT 'steps:read,steps:write,profile:read',
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // MCP audit log for security and debugging
  db.run(`CREATE TABLE IF NOT EXISTS mcp_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    params TEXT,
    old_value TEXT,
    new_value TEXT,
    was_overwrite BOOLEAN DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN DEFAULT 1,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (token_id) REFERENCES mcp_tokens (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Settings table for configurable app settings
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add critical performance indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_steps_challenge_date_user ON steps(challenge_id, date, user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_steps_user_challenge ON steps(user_id, challenge_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active) WHERE is_active = 1`);
  // Enforce the application invariant at the database layer as well. A
  // partial unique index allows any number of inactive rows but only one `1`.
  db.all(`SELECT id, name FROM challenges WHERE is_active = 1`, (err, activeChallenges) => {
    if (err) {
      console.error('Error checking active challenges before uniqueness migration:', err);
      return;
    }
    if (activeChallenges.length > 1) {
      console.error('❌ Cannot create single-active-challenge index; multiple active challenges exist:', activeChallenges);
      return;
    }
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_challenge
            ON challenges(is_active) WHERE is_active = 1`, (indexErr) => {
      if (indexErr) {
        console.error('❌ Failed to enforce single active challenge:', indexErr);
      } else {
        console.log('✅ Single active challenge constraint ready');
      }
    });
  });
  
  // MCP performance indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires ON mcp_tokens(expires_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_token_user ON mcp_audit_log(token_id, user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON mcp_audit_log(created_at)`);
  
  // Add scopes column to existing tokens if it doesn't exist
  db.run(`ALTER TABLE mcp_tokens ADD COLUMN scopes TEXT DEFAULT 'steps:read,steps:write,profile:read'`, (err) => {
    // Ignore error if column already exists
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding scopes column:', err);
    } else if (!err) {
      console.log('✅ Added scopes column to mcp_tokens table');
    }
  });

  // Add archived_at column to users table for user archiving functionality
  db.run(`ALTER TABLE users ADD COLUMN archived_at DATETIME DEFAULT NULL`, (err) => {
    // Ignore error if column already exists
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding archived_at column:', err);
    } else if (!err) {
      console.log('✅ Added archived_at column to users table');
    }
  });

  // Add index for archived_at column for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_archived_at ON users (archived_at)`, (err) => {
    if (err) {
      console.error('Error creating archived_at index:', err);
    } else {
      console.log('✅ Created index on users.archived_at column');
    }
  });
  
  // Update existing tokens to have default scopes if they don't already
  db.run(`UPDATE mcp_tokens SET scopes = 'steps:read,steps:write,profile:read' WHERE scopes IS NULL OR scopes = ''`, (err) => {
    if (err) {
      console.error('Error updating default scopes:', err);
    } else {
      console.log('✅ Updated existing tokens with default scopes');
    }
  });
  
  // Initialize default confetti threshold settings
  db.run(`INSERT OR IGNORE INTO settings (key, value, description) VALUES 
    ('confetti_regular_threshold', '15000', 'Step count threshold for regular confetti celebration'),
    ('confetti_epic_threshold', '20000', 'Step count threshold for epic/mega confetti celebration')`, (err) => {
    if (err) {
      console.error('Error initializing confetti threshold settings:', err);
    } else {
      console.log('✅ Initialized confetti threshold settings');
    }
  });
  
  // Shadow game tables for pig game leaderboard
  db.run(`CREATE TABLE IF NOT EXISTS shadow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    trots INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    best_distance INTEGER NOT NULL DEFAULT 0,
    hearts_used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(user_id, date)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shadow_hearts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hearts_remaining INTEGER NOT NULL DEFAULT 5,
    hearts_used INTEGER NOT NULL DEFAULT 0,
    last_game_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(user_id, date)
  )`);

  // Challenge archive tables for historical data preservation
  db.run(`CREATE TABLE IF NOT EXISTS challenge_archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    challenge_name TEXT NOT NULL,
    challenge_start_date TEXT NOT NULL,
    challenge_end_date TEXT NOT NULL,
    reporting_threshold INTEGER NOT NULL,
    archive_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER NOT NULL,
    total_participants INTEGER NOT NULL,
    FOREIGN KEY (challenge_id) REFERENCES challenges (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS challenge_archive_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_team TEXT,
    user_email TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    original_updated_at DATETIME,
    FOREIGN KEY (archive_id) REFERENCES challenge_archives (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Complete roster snapshots survive team resets between challenges. Unlike
  // step archives, these include players with no entries and empty teams.
  db.run(`CREATE TABLE IF NOT EXISTS challenge_team_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (challenge_id) REFERENCES challenges (id),
    UNIQUE(challenge_id, team_name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS challenge_team_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    team_name TEXT,
    user_archived_at DATETIME,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (challenge_id) REFERENCES challenges (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(challenge_id, user_id)
  )`);

  // Shadow game performance indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_shadow_steps_user_date ON shadow_steps(user_id, date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_shadow_steps_date ON shadow_steps(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_shadow_hearts_user_date ON shadow_hearts(user_id, date)`);
  
  // Archive indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_archive_steps_archive_id ON challenge_archive_steps(archive_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_archive_steps_user_date ON challenge_archive_steps(archive_id, user_id, date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_challenge_team_names_challenge ON challenge_team_names(challenge_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_challenge_team_memberships_challenge ON challenge_team_memberships(challenge_id)`);

  // Add constraint to prevent multiple active challenges (SQLite doesn't support partial unique indexes easily)
  // We'll handle this in application logic for now

  // Sample teams removed - teams should be created by admins as needed
  
  // Create admin users (skip in test environment)
  if (!process.env.TEST_DB_INIT) {
    db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benny@sigfig.com', 'Benny', 1)`);
    db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benazir.qureshi@sigfig.com', 'Benazir', 1)`);
    db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('liz.ridge@sigfig.com', 'Liz', 1)`);
    db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('megan.crowley@sigfig.com', 'Megan', 1)`);
    db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('amit.srivastava@sigfig.com', 'Amit', 1)`);
    
    // Ensure admin privileges for existing users (handles INSERT OR IGNORE cases)
    db.run(`UPDATE users SET is_admin = 1 WHERE email IN ('benny@sigfig.com', 'benazir.qureshi@sigfig.com', 'liz.ridge@sigfig.com', 'megan.crowley@sigfig.com', 'amit.srivastava@sigfig.com')`);
  }

  // Serialized barrier: normalize only after every base table and index exists.
  db.run('SELECT 1', async err => {
    if (err) return initializationReject(err);
    try {
      await normalizeUserTeams(db);
      initializationResolve();
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      initializationReject(error);
    }
  });
});
} else {
  // For delayed initialization (test mode), resolve immediately
  initializationResolve();
}

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

// Attach utilities and initialization promise to the database object
db.utils = dbUtils;
db.ready = initializationPromise;

module.exports = db;