/**
 * Quick Database Connection Fix
 * 
 * Addresses SQLITE_BUSY and SQLITE_MISUSE errors by ensuring:
 * 1. Proper database connection closing
 * 2. Adequate wait times between tests
 * 3. Exclusive database access per test
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

/**
 * Get a properly configured database connection
 */
function getStableDbConnection(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) return reject(err);
      
      // Configure for stability and performance
      db.configure('busyTimeout', 30000);
      db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) console.warn('WAL mode failed:', err.message);
      });
      db.run('PRAGMA synchronous = NORMAL');
      db.run('PRAGMA temp_store = MEMORY');
      db.run('PRAGMA cache_size = -2000');
      
      resolve(db);
    });
  });
}

/**
 * Safely close database connection
 */
function safeCloseDb(db) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    
    db.close((err) => {
      if (err) console.warn('Database close warning:', err.message);
      resolve();
    });
  });
}

/**
 * Wait with exponential backoff for database to be available
 */
async function waitForDbAvailable(dbPath, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const testDb = await getStableDbConnection(dbPath);
      await safeCloseDb(testDb);
      return true;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
    }
  }
  return false;
}

/**
 * Clean up database files including WAL and SHM
 */
function cleanupDbFiles(dbPath) {
  try {
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.warn('Cleanup warning:', err.message);
  }
}

module.exports = {
  getStableDbConnection,
  safeCloseDb,
  waitForDbAvailable,
  cleanupDbFiles
};