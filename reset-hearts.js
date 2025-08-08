#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use production database path
const dbPath = process.env.NODE_ENV === 'production' ? '/data/steps.db' : path.join(__dirname, 'src/steps.db');

console.log(`Connecting to database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// Get today's date in Pacific Time
const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
const pacificDate = new Date(today).toISOString().split('T')[0];

console.log(`Setting hearts for date: ${pacificDate}`);

// Reset all users' hearts to 5 for today
const query = `
  INSERT OR REPLACE INTO shadow_hearts (user_id, date, hearts_remaining, hearts_used, created_at, updated_at)
  SELECT id, ?, 5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users
`;

db.run(query, [pacificDate], function(err) {
  if (err) {
    console.error('❌ Error resetting hearts:', err.message);
    process.exit(1);
  } else {
    console.log(`✅ Hearts reset successfully for ${this.changes} users`);
    
    // Verify the reset worked
    db.all('SELECT u.name, sh.hearts_remaining, sh.hearts_used FROM shadow_hearts sh JOIN users u ON u.id = sh.user_id WHERE sh.date = ? LIMIT 5', [pacificDate], (err, rows) => {
      if (err) {
        console.error('❌ Error verifying reset:', err.message);
      } else {
        console.log('📊 Sample of reset hearts:');
        rows.forEach(row => {
          console.log(`  ${row.name}: ${row.hearts_remaining} hearts remaining, ${row.hearts_used} used`);
        });
      }
      
      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err.message);
        } else {
          console.log('✅ Database connection closed');
        }
        process.exit(0);
      });
    });
  }
});