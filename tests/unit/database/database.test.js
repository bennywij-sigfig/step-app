/**
 * Unit Tests for Database Module
 * Tests database initialization, connection, and basic operations
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { createTestDatabase, cleanupTestDatabase } = require('../../environments/shared/test-helpers');

describe('Database Module', () => {
  let testDbPath;
  let db;

  beforeAll(() => {
    // Suppress console output during tests
    suppressConsole();
  });

  afterAll(() => {
    restoreConsole();
  });

  beforeEach(async () => {
    testDbPath = await createTestDatabase();
    process.env.DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
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
    
    try {
      cleanupTestDatabase(testDbPath);
    } catch (error) {
      console.error('Test database cleanup error:', error);
    }
    
    delete process.env.DB_PATH;
  });

  describe('Database Connection', () => {
    test('should create database file when it does not exist', (done) => {
      // Database file should not exist initially
      expect(fs.existsSync(testDbPath)).toBe(false);
      
      // Create database connection
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) return done(err);
        
        // Database file should now exist
        expect(fs.existsSync(testDbPath)).toBe(true);
        done();
      });
    });

    test('should connect to existing database file', () => {
      // Create initial database
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
      
      return new Promise((resolve, reject) => {
        db.close((err) => {
          if (err) return reject(err);
          
          // Reconnect to existing database
          db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE);
          expect(fs.existsSync(testDbPath)).toBe(true);
          resolve();
        });
      });
    });

    test('should configure SQLite settings correctly', () => {
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
      
      return new Promise((resolve, reject) => {
        // Set WAL mode first
        db.run('PRAGMA journal_mode=WAL', (err) => {
          if (err) return reject(err);
          
          // Test WAL mode
          db.get('PRAGMA journal_mode', (err, row) => {
            if (err) return reject(err);
            expect(row.journal_mode).toBe('wal');
            
            // Set synchronous mode
            db.run('PRAGMA synchronous=NORMAL', (err) => {
              if (err) return reject(err);
              
              // Test synchronous mode
              db.get('PRAGMA synchronous', (err, row) => {
                if (err) return reject(err);
                expect(row.synchronous).toBe(1); // NORMAL = 1
                resolve();
              });
            });
          });
        });
      });
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Table Creation', () => {
    beforeEach(() => {
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    });

    test('should create users table with correct structure', () => {
      return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          team TEXT,
          is_admin BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) return reject(err);
          
          // Verify table structure
          db.all("PRAGMA table_info(users)", (err, columns) => {
            if (err) return reject(err);
            
            expect(columns).toHaveLength(6);
            expect(columns[0].name).toBe('id');
            expect(columns[1].name).toBe('email');
            expect(columns[2].name).toBe('name');
            expect(columns[3].name).toBe('team');
            expect(columns[4].name).toBe('is_admin');
            expect(columns[5].name).toBe('created_at');
            resolve();
          });
        });
      });
    });

    test('should create teams table with correct structure', () => {
      return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) return reject(err);
          
          db.all("PRAGMA table_info(teams)", (err, columns) => {
            if (err) return reject(err);
            
            expect(columns).toHaveLength(3);
            expect(columns[0].name).toBe('id');
            expect(columns[1].name).toBe('name');
            expect(columns[2].name).toBe('created_at');
            resolve();
          });
        });
      });
    });

    test('should create steps table with correct structure', () => {
      return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          count INTEGER NOT NULL,
          challenge_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (challenge_id) REFERENCES challenges (id),
          UNIQUE(user_id, date, challenge_id)
        )`, (err) => {
          if (err) return reject(err);
          
          db.all("PRAGMA table_info(steps)", (err, columns) => {
            if (err) return reject(err);
            
            expect(columns).toHaveLength(6);
            expect(columns[0].name).toBe('id');
            expect(columns[1].name).toBe('user_id');
            expect(columns[2].name).toBe('date');
            expect(columns[3].name).toBe('count');
            expect(columns[4].name).toBe('challenge_id');
            expect(columns[5].name).toBe('created_at');
            resolve();
          });
        });
      });
    });

    test('should create challenges table with correct structure', () => {
      return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS challenges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          reporting_threshold REAL DEFAULT 0.7,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) return reject(err);
          
          db.all("PRAGMA table_info(challenges)", (err, columns) => {
            if (err) return reject(err);
            
            expect(columns).toHaveLength(6);
            expect(columns[0].name).toBe('id');
            expect(columns[1].name).toBe('name');
            expect(columns[2].name).toBe('start_date');
            expect(columns[3].name).toBe('end_date');
            expect(columns[4].name).toBe('reporting_threshold');
            expect(columns[5].name).toBe('created_at');
            resolve();
          });
        });
      });
    });

    test('should create MCP tokens table with correct structure', () => {
      return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS mcp_tokens (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          scopes TEXT NOT NULL DEFAULT 'steps:read,steps:write,profile:read',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          last_used_at DATETIME,
          last_ip TEXT,
          last_user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`, (err) => {
          if (err) return reject(err);
          
          db.all("PRAGMA table_info(mcp_tokens)", (err, columns) => {
            if (err) return reject(err);
            
            expect(columns).toHaveLength(8);
            expect(columns[0].name).toBe('token');
            expect(columns[1].name).toBe('user_id');
            expect(columns[2].name).toBe('scopes');
            expect(columns[3].name).toBe('created_at');
            expect(columns[4].name).toBe('expires_at');
            expect(columns[5].name).toBe('last_used_at');
            expect(columns[6].name).toBe('last_ip');
            expect(columns[7].name).toBe('last_user_agent');
            resolve();
          });
        });
      });
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
      
      // Create tables
      return new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            team TEXT,
            is_admin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
          
          db.run(`CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            count INTEGER NOT NULL,
            challenge_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, date, challenge_id)
          )`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });

    test('should insert and retrieve user data', () => {
      return new Promise((resolve, reject) => {
        const testUser = {
          email: 'test@example.com',
          name: 'Test User',
          team: 'Team Alpha',
          is_admin: 0
        };

        db.run(
          'INSERT INTO users (email, name, team, is_admin) VALUES (?, ?, ?, ?)',
          [testUser.email, testUser.name, testUser.team, testUser.is_admin],
          function(err) {
            if (err) return reject(err);
            
            const userId = this.lastID;
            expect(userId).toBeGreaterThan(0);
            
            // Retrieve the user
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
              if (err) return reject(err);
              
              expect(row.email).toBe(testUser.email);
              expect(row.name).toBe(testUser.name);
              expect(row.team).toBe(testUser.team);
              expect(row.is_admin).toBe(testUser.is_admin);
              expect(row.created_at).toBeDefined();
              resolve();
            });
          }
        );
      });
    });

    test('should enforce unique email constraint', () => {
      return new Promise((resolve, reject) => {
        const testUser = {
          email: 'test@example.com',
          name: 'Test User',
          team: 'Team Alpha'
        };

        // Insert first user
        db.run(
          'INSERT INTO users (email, name, team) VALUES (?, ?, ?)',
          [testUser.email, testUser.name, testUser.team],
          (err) => {
            if (err) return reject(err);
            
            // Try to insert duplicate email
            db.run(
              'INSERT INTO users (email, name, team) VALUES (?, ?, ?)',
              [testUser.email, 'Another User', 'Team Beta'],
              (err) => {
                expect(err).toBeDefined();
                expect(err.message).toContain('UNIQUE constraint failed');
                resolve();
              }
            );
          }
        );
      });
    });

    test('should insert and retrieve step data with foreign key', () => {
      return new Promise((resolve, reject) => {
        // First create a user
        db.run(
          'INSERT INTO users (email, name) VALUES (?, ?)',
          ['test@example.com', 'Test User'],
          function(err) {
            if (err) return reject(err);
            
            const userId = this.lastID;
            const stepData = {
              user_id: userId,
              date: '2025-08-02',
              count: 10000,
              challenge_id: null
            };
            
            // Insert steps
            db.run(
              'INSERT INTO steps (user_id, date, count, challenge_id) VALUES (?, ?, ?, ?)',
              [stepData.user_id, stepData.date, stepData.count, stepData.challenge_id],
              function(err) {
                if (err) return reject(err);
                
                const stepId = this.lastID;
                expect(stepId).toBeGreaterThan(0);
                
                // Retrieve steps with user data
                db.get(`
                  SELECT s.*, u.name, u.email 
                  FROM steps s 
                  JOIN users u ON s.user_id = u.id 
                  WHERE s.id = ?
                `, [stepId], (err, row) => {
                  if (err) return reject(err);
                  
                  expect(row.user_id).toBe(userId);
                  expect(row.date).toBe(stepData.date);
                  expect(row.count).toBe(stepData.count);
                  expect(row.name).toBe('Test User');
                  expect(row.email).toBe('test@example.com');
                  resolve();
                });
              }
            );
          }
        );
      });
    });

    test('should enforce unique constraint on user/date/challenge combination', () => {
      return new Promise((resolve, reject) => {
        // Create user first
        db.run(
          'INSERT INTO users (email, name) VALUES (?, ?)',
          ['test@example.com', 'Test User'],
          function(err) {
            if (err) return reject(err);
            
            const userId = this.lastID;
            const stepData = {
              user_id: userId,
              date: '2025-08-02',
              count: 10000,
              challenge_id: 1
            };
            
            // Insert first step record
            db.run(
              'INSERT INTO steps (user_id, date, count, challenge_id) VALUES (?, ?, ?, ?)',
              [stepData.user_id, stepData.date, stepData.count, stepData.challenge_id],
              (err) => {
                if (err) return reject(err);
                
                // Try to insert duplicate
                db.run(
                  'INSERT INTO steps (user_id, date, count, challenge_id) VALUES (?, ?, ?, ?)',
                  [stepData.user_id, stepData.date, 15000, stepData.challenge_id],
                  (err) => {
                    expect(err).toBeDefined();
                    expect(err.message).toContain('UNIQUE constraint failed');
                    resolve();
                  }
                );
              }
            );
          }
        );
      });
    });
  });

  describe('Database Health Check', () => {
    beforeEach(() => {
      db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    });

    test('should perform integrity check', () => {
      return new Promise((resolve, reject) => {
        db.get('PRAGMA integrity_check', (err, result) => {
          if (err) return reject(err);
          expect(result.integrity_check).toBe('ok');
          resolve();
        });
      });
    });

    test('should check database is accessible', () => {
      return new Promise((resolve, reject) => {
        db.get('SELECT 1 as test', (err, result) => {
          if (err) return reject(err);
          expect(result.test).toBe(1);
          resolve();
        });
      });
    });
  });
});