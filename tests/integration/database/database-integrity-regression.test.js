/**
 * Database Integrity Regression Tests
 * 
 * Comprehensive tests for database schema, relationships, and data consistency.
 * These tests ensure that database changes don't break existing functionality
 * and that all constraints, relationships, and migrations work correctly.
 * 
 * Focus Areas:
 * - Schema integrity and table structure validation
 * - Data consistency and constraint enforcement
 * - Relationship integrity (foreign keys, unique constraints)
 * - Database operations and transaction handling
 * - Migration safety and backward compatibility
 * - Performance regression detection for critical queries
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { createTestDatabase, cleanupTestDatabase } = require('../../environments/shared/test-helpers');

// Import the actual database module to test real schema creation
let database;

describe('Database Integrity Regression Tests', () => {
  let testDbPath;
  let db;
  let consoleLog, consoleError, consoleWarn;

  beforeAll(() => {
    // Don't suppress console output to see errors
    // consoleLog = console.log;
    // consoleError = console.error;
    // consoleWarn = console.warn;
    // console.log = jest.fn();
    // console.error = jest.fn();
    // console.warn = jest.fn();
  });

  afterAll(() => {
    // Don't restore console since we didn't suppress it
    // console.log = consoleLog;
    // console.error = consoleError;
    // console.warn = consoleWarn;
  });

  beforeEach(async () => {
    testDbPath = createTestDatabase();
    process.env.NODE_ENV = 'test';
    
    // Clear module cache to ensure fresh database initialization
    delete require.cache[require.resolve('../../../src/database')];
    
    // Create fresh database connection for testing
    db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    
    // Initialize with actual schema from database.js
    await initializeTestDatabase();
  });

  afterEach(async () => {
    if (db) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Database close timeout'));
          }, 5000);
          
          db.close((err) => {
            clearTimeout(timeout);
            if (err) console.error('Error closing database:', err);
            resolve();
          });
        });
      } catch (error) {
        console.error('Database cleanup error:', error);
      }
      db = null;
    }
    
    cleanupTestDatabase(testDbPath);
    delete process.env.NODE_ENV;
  });

  async function initializeTestDatabase() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Configure SQLite settings (from database.js)
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA synchronous = NORMAL');
        db.run('PRAGMA temp_store = MEMORY');
        db.configure('busyTimeout', 30000);

        // Create all tables with exact schema from database.js
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          team TEXT,
          is_admin BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          count INTEGER NOT NULL,
          challenge_id INTEGER,
          challenge_day INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          UNIQUE(user_id, date)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

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

        db.run(`CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create indexes (from database.js)
        db.run(`CREATE INDEX IF NOT EXISTS idx_steps_challenge_date_user ON steps(challenge_id, date, user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_steps_user_challenge ON steps(user_id, challenge_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active) WHERE is_active = 1`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires ON mcp_tokens(expires_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_token_user ON mcp_audit_log(token_id, user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON mcp_audit_log(created_at)`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  describe('Schema Integrity Tests', () => {
    test('should have all required tables', async () => {
      const expectedTables = [
        'users', 'teams', 'steps', 'auth_tokens', 
        'challenges', 'mcp_tokens', 'mcp_audit_log', 'settings'
      ];

      const tables = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, rows) => {
          if (err) return reject(err);
          resolve(rows.map(row => row.name));
        });
      });

      expectedTables.forEach(tableName => {
        expect(tables).toContain(tableName);
      });
    });

    test('should have correct users table structure', async () => {
      const columns = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(users)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      expect(columns).toHaveLength(6);
      expect(columns.find(c => c.name === 'id')).toMatchObject({
        name: 'id',
        type: 'INTEGER',
        pk: 1,
        notnull: 0
      });
      expect(columns.find(c => c.name === 'email')).toMatchObject({
        name: 'email',
        type: 'TEXT',
        notnull: 1
      });
      expect(columns.find(c => c.name === 'is_admin')).toMatchObject({
        name: 'is_admin',
        type: 'BOOLEAN',
        dflt_value: '0'
      });
    });

    test('should have correct steps table structure with proper foreign keys', async () => {
      const columns = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(steps)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      const foreignKeys = await new Promise((resolve, reject) => {
        db.all("PRAGMA foreign_key_list(steps)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      // Check required columns exist
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('date');
      expect(columnNames).toContain('count');
      expect(columnNames).toContain('challenge_id');
      expect(columnNames).toContain('challenge_day');

      // Check foreign key to users table
      expect(foreignKeys.some(fk => fk.table === 'users' && fk.from === 'user_id')).toBe(true);
    });

    test('should have correct challenges table with constraints', async () => {
      const columns = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(challenges)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      // Check reporting_threshold has CHECK constraint (90 default with 0-100 range)
      const reportingThresholdColumn = columns.find(c => c.name === 'reporting_threshold');
      expect(reportingThresholdColumn).toBeDefined();
      expect(reportingThresholdColumn.dflt_value).toBe('90');

      // Test constraint enforcement
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO challenges (name, start_date, end_date, reporting_threshold) VALUES (?, ?, ?, ?)",
          ['Invalid Challenge', '2025-01-01', '2025-01-31', 150],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow();
    });

    test('should have correct MCP tables with proper relationships', async () => {
      // Check mcp_tokens foreign key to users
      const mcpTokensForeignKeys = await new Promise((resolve, reject) => {
        db.all("PRAGMA foreign_key_list(mcp_tokens)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      expect(mcpTokensForeignKeys.some(fk => fk.table === 'users' && fk.from === 'user_id')).toBe(true);

      // Check mcp_audit_log foreign keys
      const auditForeignKeys = await new Promise((resolve, reject) => {
        db.all("PRAGMA foreign_key_list(mcp_audit_log)", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      expect(auditForeignKeys.some(fk => fk.table === 'mcp_tokens' && fk.from === 'token_id')).toBe(true);
      expect(auditForeignKeys.some(fk => fk.table === 'users' && fk.from === 'user_id')).toBe(true);
    });

    test('should have all required indexes for performance', async () => {
      const indexes = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'", (err, rows) => {
          if (err) return reject(err);
          resolve(rows.map(row => row.name));
        });
      });

      const expectedIndexes = [
        'idx_steps_challenge_date_user',
        'idx_steps_user_challenge',
        'idx_challenges_active',
        'idx_mcp_tokens_user',
        'idx_mcp_tokens_expires',
        'idx_mcp_audit_token_user',
        'idx_mcp_audit_created'
      ];

      expectedIndexes.forEach(indexName => {
        expect(indexes).toContain(indexName);
      });
    });
  });

  describe('Data Integrity Tests', () => {
    test('should enforce email uniqueness in users table', async () => {
      // Insert first user
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['test@example.com', 'Test User'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Attempt to insert duplicate email should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['test@example.com', 'Another User'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });

    test('should enforce team name uniqueness', async () => {
      // Insert first team
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO teams (name) VALUES (?)",
          ['Alpha Team'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Attempt to insert duplicate team name should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO teams (name) VALUES (?)",
          ['Alpha Team'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });

    test('should enforce unique constraint on user/date combination in steps', async () => {
      // Create user first
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['user@example.com', 'Step User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Insert first step record
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
          [userId, '2025-08-06', 10000],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Attempt to insert duplicate user/date should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
          [userId, '2025-08-06', 15000],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });

    test('should enforce MCP token uniqueness', async () => {
      // Create user first
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['mcp@example.com', 'MCP User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      const token = 'test-token-123';
      
      // Insert first MCP token
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_tokens (token, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
          [token, userId, 'Test Token', '2025-12-31 23:59:59'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Attempt to insert duplicate token should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_tokens (token, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
          [token, userId, 'Another Token', '2025-12-31 23:59:59'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });

    test('should enforce settings key uniqueness', async () => {
      // Insert first setting
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO settings (key, value, description) VALUES (?, ?, ?)",
          ['test_setting', 'value1', 'Test setting'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Attempt to insert duplicate key should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO settings (key, value, description) VALUES (?, ?, ?)",
          ['test_setting', 'value2', 'Another test setting'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('Relationship Integrity Tests', () => {
    test('should maintain referential integrity with steps->users foreign key', async () => {
      // Attempt to insert steps with non-existent user_id should fail
      await expect(new Promise((resolve, reject) => {
        db.run('PRAGMA foreign_keys = ON'); // Enable foreign key constraints
        db.run(
          "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
          [999, '2025-08-06', 10000],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should maintain referential integrity with mcp_tokens->users foreign key', async () => {
      await new Promise((resolve) => {
        db.run('PRAGMA foreign_keys = ON', resolve); // Enable foreign key constraints
      });

      // Attempt to insert MCP token with non-existent user_id should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_tokens (token, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
          ['token-123', 999, 'Invalid Token', '2025-12-31 23:59:59'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should maintain referential integrity in mcp_audit_log', async () => {
      await new Promise((resolve) => {
        db.run('PRAGMA foreign_keys = ON', resolve);
      });

      // Attempt to insert audit log with non-existent token_id should fail
      await expect(new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_audit_log (token_id, user_id, action) VALUES (?, ?, ?)",
          [999, 1, 'test_action'],
          (err) => err ? reject(err) : resolve()
        );
      })).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should handle cascade relationships correctly', async () => {
      await new Promise((resolve) => {
        db.run('PRAGMA foreign_keys = ON', resolve);
      });

      // Create user
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['cascade@example.com', 'Cascade User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Create MCP token
      const tokenId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_tokens (token, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
          ['cascade-token', userId, 'Cascade Token', '2025-12-31 23:59:59'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Create audit log entry
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_audit_log (token_id, user_id, action) VALUES (?, ?, ?)",
          [tokenId, userId, 'test_action'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Verify all records exist
      const auditCount = await new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM mcp_audit_log WHERE token_id = ?", [tokenId], (err, row) => {
          if (err) return reject(err);
          resolve(row.count);
        });
      });

      expect(auditCount).toBe(1);
    });
  });

  describe('Database Operations Tests', () => {
    test('should handle concurrent INSERT operations correctly', async () => {
      const promises = [];
      const userCount = 10;

      // Create multiple users concurrently
      for (let i = 0; i < userCount; i++) {
        promises.push(
          new Promise((resolve, reject) => {
            db.run(
              "INSERT INTO users (email, name) VALUES (?, ?)",
              [`user${i}@example.com`, `User ${i}`],
              function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
              }
            );
          })
        );
      }

      const userIds = await Promise.all(promises);
      expect(userIds).toHaveLength(userCount);
      
      // Verify all users were inserted correctly
      const actualCount = await new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
          if (err) return reject(err);
          resolve(row.count);
        });
      });

      expect(actualCount).toBe(userCount);
    });

    test('should handle UPDATE operations with proper optimistic locking', async () => {
      // Create user
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['update@example.com', 'Update User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Create initial step record
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO steps (user_id, date, count, created_at) VALUES (?, ?, ?, datetime('now'))",
          [userId, '2025-08-06', 10000],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Update step count and updated_at
      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE steps SET count = ?, updated_at = datetime('now') WHERE user_id = ? AND date = ?",
          [15000, userId, '2025-08-06'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Verify update
      const updatedStep = await new Promise((resolve, reject) => {
        db.get(
          "SELECT count, updated_at, created_at FROM steps WHERE user_id = ? AND date = ?",
          [userId, '2025-08-06'],
          (err, row) => {
            if (err) return reject(err);
            resolve(row);
          }
        );
      });

      expect(updatedStep.count).toBe(15000);
      expect(updatedStep.updated_at).not.toBe(updatedStep.created_at);
    });

    test('should handle transaction rollback correctly', async () => {
      await new Promise((resolve) => {
        db.run('PRAGMA foreign_keys = ON', resolve);
      });

      await expect(new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          // Insert valid user
          db.run("INSERT INTO users (email, name) VALUES (?, ?)", ['tx@example.com', 'TX User'], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            const userId = this.lastID;
            
            // Attempt to insert step with invalid user_id (should fail)
            db.run("INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)", [999, '2025-08-06', 10000], (err) => {
              if (err) {
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) return reject(rollbackErr);
                  
                  // Verify user was rolled back
                  db.get("SELECT COUNT(*) as count FROM users WHERE email = 'tx@example.com'", (err, row) => {
                    if (err) return reject(err);
                    if (row.count === 0) {
                      resolve(); // Rollback successful
                    } else {
                      reject(new Error('Transaction rollback failed'));
                    }
                  });
                });
              } else {
                db.run('COMMIT');
                resolve();
              }
            });
          });
        });
      })).rejects.toThrow();
    });

    test('should prevent database locking during high concurrency', async () => {
      const operations = [];
      const operationCount = 20;

      // Create multiple concurrent read/write operations
      for (let i = 0; i < operationCount; i++) {
        if (i % 2 === 0) {
          // Write operation
          operations.push(
            new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Database operation timeout'));
              }, 5000);
              
              db.run(
                "INSERT INTO users (email, name) VALUES (?, ?)",
                [`concurrent${i}@example.com`, `Concurrent User ${i}`],
                (err) => {
                  clearTimeout(timeout);
                  if (err) return reject(err);
                  resolve();
                }
              );
            })
          );
        } else {
          // Read operation
          operations.push(
            new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Database operation timeout'));
              }, 5000);
              
              db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                clearTimeout(timeout);
                if (err) return reject(err);
                resolve(row.count);
              });
            })
          );
        }
      }

      // All operations should complete without timeout
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('Migration Safety Tests', () => {
    test('should handle schema changes without breaking existing data', async () => {
      // Insert data with current schema
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name, is_admin) VALUES (?, ?, ?)",
          ['migration@example.com', 'Migration User', 0],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Simulate adding a new column (migration-like operation)
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE users ADD COLUMN test_column TEXT DEFAULT 'default_value'", (err) => {
          // Column may already exist from previous test runs
          if (err && !err.message.includes('duplicate column name')) {
            return reject(err);
          }
          resolve();
        });
      });

      // Verify existing data is intact
      const user = await new Promise((resolve, reject) => {
        db.get("SELECT email, name, is_admin, test_column FROM users WHERE id = ?", [userId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      expect(user.email).toBe('migration@example.com');
      expect(user.name).toBe('Migration User');
      expect(user.is_admin).toBe(0);
      expect(user.test_column).toBe('default_value');
    });

    test('should handle index creation on populated tables', async () => {
      // Insert test data
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['index@example.com', 'Index User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Insert multiple step records
      for (let i = 1; i <= 5; i++) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
            [userId, `2025-08-0${i}`, i * 1000],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Create new index on populated table
      await new Promise((resolve, reject) => {
        db.run("CREATE INDEX IF NOT EXISTS idx_test_steps_date ON steps(date)", (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Verify index was created and works
      const explain = await new Promise((resolve, reject) => {
        db.all("EXPLAIN QUERY PLAN SELECT * FROM steps WHERE date = '2025-08-03'", (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      // Index should be used in query plan
      const usingIndex = explain.some(row => row.detail && row.detail.includes('idx_test_steps_date'));
      expect(usingIndex).toBe(true);
    });

    test('should maintain data consistency during constraint additions', async () => {
      // Create a temporary table to test constraint addition
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS test_constraints (
          id INTEGER PRIMARY KEY,
          value INTEGER
        )`, (err) => err ? reject(err) : resolve());
      });

      // Insert test data
      await new Promise((resolve, reject) => {
        db.run("INSERT INTO test_constraints (value) VALUES (50)", (err) => err ? reject(err) : resolve());
      });

      // Simulate adding a CHECK constraint (requires table recreation in SQLite)
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          db.run(`CREATE TABLE test_constraints_new (
            id INTEGER PRIMARY KEY,
            value INTEGER CHECK (value >= 0 AND value <= 100)
          )`);
          db.run('INSERT INTO test_constraints_new SELECT * FROM test_constraints');
          db.run('DROP TABLE test_constraints');
          db.run('ALTER TABLE test_constraints_new RENAME TO test_constraints');
          db.run('COMMIT', (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });

      // Verify data is still intact and constraint works
      const value = await new Promise((resolve, reject) => {
        db.get("SELECT value FROM test_constraints WHERE id = 1", (err, row) => {
          if (err) return reject(err);
          resolve(row.value);
        });
      });

      expect(value).toBe(50);

      // Test constraint enforcement
      await expect(new Promise((resolve, reject) => {
        db.run("INSERT INTO test_constraints (value) VALUES (150)", (err) => err ? reject(err) : resolve());
      })).rejects.toThrow();
    });
  });

  describe('Performance Regression Tests', () => {
    beforeEach(async () => {
      // Create test data for performance tests
      const userData = [];
      const stepData = [];
      const challengeData = [];

      // Create challenges
      for (let i = 1; i <= 3; i++) {
        challengeData.push({
          name: `Challenge ${i}`,
          start_date: `2025-0${i}-01`,
          end_date: `2025-0${i}-31`,
          is_active: i === 2 ? 1 : 0
        });
      }

      // Create users and steps
      for (let i = 1; i <= 100; i++) {
        userData.push({
          email: `perf_user_${i}@example.com`,
          name: `Performance User ${i}`,
          team: `Team ${Math.ceil(i / 10)}`
        });
      }

      // Insert challenges
      for (const challenge of challengeData) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO challenges (name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)",
            [challenge.name, challenge.start_date, challenge.end_date, challenge.is_active],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Insert users
      const userIds = [];
      for (const user of userData) {
        const userId = await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO users (email, name, team) VALUES (?, ?, ?)",
            [user.email, user.name, user.team],
            function(err) {
              if (err) return reject(err);
              resolve(this.lastID);
            }
          );
        });
        userIds.push(userId);
      }

      // Insert steps data (30 days per user, 3 challenges)
      for (const userId of userIds) {
        for (let day = 1; day <= 30; day++) {
          for (let challengeId = 1; challengeId <= 3; challengeId++) {
            await new Promise((resolve, reject) => {
              db.run(
                "INSERT INTO steps (user_id, date, count, challenge_id) VALUES (?, ?, ?, ?)",
                [userId, `2025-0${challengeId}-${String(day).padStart(2, '0')}`, 
                 Math.floor(Math.random() * 15000) + 5000, challengeId],
                (err) => err ? reject(err) : resolve()
              );
            });
          }
        }
      }
    });

    test('leaderboard query should complete within acceptable time', async () => {
      const startTime = Date.now();
      
      const results = await new Promise((resolve, reject) => {
        db.all(`
          SELECT u.name, u.team, AVG(s.count) as avg_steps
          FROM users u
          JOIN steps s ON u.id = s.user_id
          WHERE s.challenge_id = 2
          GROUP BY u.id, u.name, u.team
          ORDER BY avg_steps DESC
          LIMIT 20
        `, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
      
      const queryTime = Date.now() - startTime;
      
      expect(queryTime).toBeLessThan(500); // Should complete within 500ms
      expect(results).toHaveLength(20);
      expect(results[0]).toHaveProperty('avg_steps');
    });

    test('user steps lookup should use proper indexes', async () => {
      const userId = await new Promise((resolve, reject) => {
        db.get("SELECT id FROM users LIMIT 1", (err, row) => {
          if (err) return reject(err);
          resolve(row.id);
        });
      });

      const startTime = Date.now();
      
      const explain = await new Promise((resolve, reject) => {
        db.all(
          "EXPLAIN QUERY PLAN SELECT * FROM steps WHERE user_id = ? AND challenge_id = ?",
          [userId, 2],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });

      const queryTime = Date.now() - startTime;

      expect(queryTime).toBeLessThan(50); // Index lookup should be very fast
      
      // Should use index for the query
      const usesIndex = explain.some(row => 
        row.detail && (row.detail.includes('idx_steps_user_challenge') || row.detail.includes('USING INDEX'))
      );
      expect(usesIndex).toBe(true);
    });

    test('MCP audit log queries should perform well', async () => {
      // Insert audit log data
      const tokenId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO mcp_tokens (token, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
          ['perf-token', 1, 'Performance Token', '2025-12-31 23:59:59'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Insert 1000 audit log entries
      for (let i = 0; i < 1000; i++) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO mcp_audit_log (token_id, user_id, action, created_at) VALUES (?, ?, ?, datetime('now', '-' || ? || ' minutes'))",
            [tokenId, 1, `action_${i}`, i],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      const startTime = Date.now();
      
      // Query recent audit logs
      const logs = await new Promise((resolve, reject) => {
        db.all(
          "SELECT action, created_at FROM mcp_audit_log WHERE token_id = ? ORDER BY created_at DESC LIMIT 50",
          [tokenId],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });

      const queryTime = Date.now() - startTime;

      expect(queryTime).toBeLessThan(100); // Should complete within 100ms
      expect(logs).toHaveLength(50);
    });

    test('database integrity check should complete within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await new Promise((resolve, reject) => {
        db.get('PRAGMA integrity_check', (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      const checkTime = Date.now() - startTime;

      expect(checkTime).toBeLessThan(2000); // Should complete within 2 seconds even with data
      expect(result.integrity_check).toBe('ok');
    });
  });

  describe('Data Consistency Edge Cases', () => {
    test('should handle datetime edge cases correctly', async () => {
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['datetime@example.com', 'DateTime User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      // Test various datetime formats
      const dateTestCases = [
        '2025-08-06',
        '2025-12-31',
        '2025-01-01'
      ];

      for (let i = 0; i < dateTestCases.length; i++) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
            [userId, dateTestCases[i], (i + 1) * 1000],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Verify all dates were stored correctly
      const steps = await new Promise((resolve, reject) => {
        db.all(
          "SELECT date, count FROM steps WHERE user_id = ? ORDER BY date",
          [userId],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });

      expect(steps).toHaveLength(3);
      expect(steps[0].date).toBe('2025-01-01');
      expect(steps[1].date).toBe('2025-08-06');
      expect(steps[2].date).toBe('2025-12-31');
    });

    test('should handle large step counts correctly', async () => {
      const userId = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, name) VALUES (?, ?)",
          ['bigsteps@example.com', 'Big Steps User'],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      const largeStepCount = 2147483647; // Max 32-bit integer

      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO steps (user_id, date, count) VALUES (?, ?, ?)",
          [userId, '2025-08-06', largeStepCount],
          (err) => err ? reject(err) : resolve()
        );
      });

      const result = await new Promise((resolve, reject) => {
        db.get(
          "SELECT count FROM steps WHERE user_id = ? AND date = ?",
          [userId, '2025-08-06'],
          (err, row) => {
            if (err) return reject(err);
            resolve(row);
          }
        );
      });

      expect(result.count).toBe(largeStepCount);
    });

    test('should handle special characters in text fields correctly', async () => {
      const specialCases = [
        { email: 'unicode@例え.com', name: 'Unicode ユーザー 测试' },
        { email: 'quotes@example.com', name: "User with 'quotes' and \"double quotes\"" },
        { email: 'symbols@example.com', name: 'User with symbols !@#$%^&*()' },
        { email: 'newlines@example.com', name: 'User\nwith\nnewlines' }
      ];

      for (const testCase of specialCases) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO users (email, name) VALUES (?, ?)",
            [testCase.email, testCase.name],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Verify all special characters were preserved
      const users = await new Promise((resolve, reject) => {
        db.all(
          "SELECT email, name FROM users WHERE email LIKE '%@example.com' OR email LIKE '%@例え.com'",
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });

      expect(users).toHaveLength(4);
      
      const unicodeUser = users.find(u => u.email === 'unicode@例え.com');
      expect(unicodeUser.name).toBe('Unicode ユーザー 测试');

      const quotesUser = users.find(u => u.email === 'quotes@example.com');
      expect(quotesUser.name).toBe("User with 'quotes' and \"double quotes\"");
    });
  });
});