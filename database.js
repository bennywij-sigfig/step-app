const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use persistent volume in production, local file in development
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/data/steps.db' 
  : path.join(__dirname, 'steps.db');

const db = new sqlite3.Database(dbPath);

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
  )`);

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

  // Insert sample teams
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Alpha')`);
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Beta')`);
  db.run(`INSERT OR IGNORE INTO teams (name) VALUES ('Team Gamma')`);
  
  // Create admin users
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benny@sigfig.com', 'Benny', 1)`);
  db.run(`INSERT OR IGNORE INTO users (email, name, is_admin) VALUES ('benazir.qureshi@sigfig.com', 'Benazir', 1)`);
});

module.exports = db;