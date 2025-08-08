#!/usr/bin/env node
// ONE-TIME SCRIPT: Reset all user hearts to 5 for today
// Run this once in production and then delete

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Production database path
const dbPath = '/data/steps.db';

console.log(`🔧 ONE-TIME HEART RESET SCRIPT`);
console.log(`📅 ${new Date().toISOString()}`);
console.log(`📁 Database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to production database');
  }
});

// Get today's date in Pacific Time
const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
const pacificDate = new Date(today).toISOString().split('T')[0];

console.log(`📅 Pacific date: ${pacificDate}`);

// Reset all users' hearts to 5 for today
const resetQuery = `
  INSERT OR REPLACE INTO shadow_hearts (user_id, date, hearts_remaining, hearts_used, created_at, updated_at)
  SELECT id, ?, 5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users
`;

console.log('🔄 Resetting hearts for all users...');

db.run(resetQuery, [pacificDate], function(err) {
  if (err) {
    console.error('❌ Error resetting hearts:', err.message);
    process.exit(1);
  } else {
    console.log(`✅ Hearts reset successfully for ${this.changes} users`);
    
    // Verify the reset worked
    const verifyQuery = `
      SELECT u.name, sh.hearts_remaining, sh.hearts_used 
      FROM shadow_hearts sh 
      JOIN users u ON u.id = sh.user_id 
      WHERE sh.date = ? 
      ORDER BY u.name
      LIMIT 10
    `;
    
    db.all(verifyQuery, [pacificDate], (err, rows) => {
      if (err) {
        console.error('❌ Error verifying reset:', err.message);
      } else {
        console.log('📊 Sample of reset hearts:');
        rows.forEach(row => {
          console.log(`  ${row.name}: ${row.hearts_remaining}/5 hearts (${row.hearts_used} used)`);
        });
      }
      
      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err.message);
        } else {
          console.log('✅ Database connection closed');
          console.log('🎯 Heart reset completed successfully!');
          console.log('⚠️  Please delete this script after use');
        }
        process.exit(0);
      });
    });
  }
});