const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class TestUserGenerator {
  constructor() {
    // Use the same database path as the main app
    const dbPath = process.env.NODE_ENV === 'production' ? '/data/steps.db' : './steps.db';
    this.db = new sqlite3.Database(dbPath);
    this.sessionDbPath = process.env.NODE_ENV === 'production' ? '/data/sessions.db' : './sessions.db';
  }

  // Create test users
  async createTestUsers(count = 20) {
    console.log(`🎯 Creating ${count} test users...`);
    
    const users = [];
    const teams = ['Engineering', 'Marketing', 'Sales', 'Support', 'Design'];
    
    for (let i = 1; i <= count; i++) {
      const email = `loadtest${i}@example.com`;
      const name = `Load Test User ${i}`;
      const team = teams[Math.floor(Math.random() * teams.length)];
      
      try {
        // Insert user into database
        const userId = await this.insertUser(email, name, team);
        
        // Create some sample step data for realistic testing
        await this.createSampleSteps(userId);
        
        users.push({
          id: userId,
          email,
          name,
          team
        });
        
        console.log(`✓ Created user ${i}/${count}: ${email} (ID: ${userId})`);
      } catch (error) {
        console.error(`❌ Failed to create user ${email}:`, error.message);
      }
    }
    
    console.log(`✅ Successfully created ${users.length} test users`);
    return users;
  }

  // Insert user into database
  insertUser(email, name, team) {
    return new Promise((resolve, reject) => {
      // First check if user already exists
      this.db.get(
        'SELECT id FROM users WHERE email = ?',
        [email],
        (err, existingUser) => {
          if (err) {
            return reject(err);
          }
          
          if (existingUser) {
            console.log(`⚠️  User ${email} already exists (ID: ${existingUser.id})`);
            return resolve(existingUser.id);
          }
          
          // Insert new user
          this.db.run(
            `INSERT INTO users (email, name, team, is_admin, created_at)
             VALUES (?, ?, ?, 0, datetime('now'))`,
            [email, name, team],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve(this.lastID);
              }
            }
          );
        }
      );
    });
  }

  // Create sample step data for realistic testing
  async createSampleSteps(userId) {
    const promises = [];
    const today = new Date();
    
    // Create 7 days of sample data
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Random step count between 2000 and 15000
      const steps = Math.floor(Math.random() * 13000) + 2000;
      
      const promise = new Promise((resolve, reject) => {
        this.db.run(
          `INSERT OR REPLACE INTO steps (user_id, date, count, created_at)
           VALUES (?, ?, ?, datetime('now'))`,
          [userId, dateStr, steps],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      promises.push(promise);
    }
    
    await Promise.all(promises);
  }

  // Create authenticated sessions for users
  async createAuthenticatedSessions(users) {
    console.log(`🔐 Creating authenticated sessions for ${users.length} users...`);
    
    const sessionDb = new sqlite3.Database(this.sessionDbPath);
    const sessions = [];
    
    for (const user of users) {
      try {
        const sessionId = this.generateSessionId();
        const sessionData = {
          userId: user.id,
          email: user.email,
          csrfToken: this.generateCSRFToken()
        };
        
        // Create session in database
        await this.insertSession(sessionDb, sessionId, sessionData);
        
        sessions.push({
          sessionId,
          userId: user.id,
          email: user.email,
          sessionCookie: `connect.sid=s%3A${sessionId}`,
          csrfToken: sessionData.csrfToken
        });
        
        console.log(`✓ Created session for ${user.email}`);
      } catch (error) {
        console.error(`❌ Failed to create session for ${user.email}:`, error.message);
      }
    }
    
    sessionDb.close();
    console.log(`✅ Created ${sessions.length} authenticated sessions`);
    return sessions;
  }

  // Generate session ID (mimics express-session format)
  generateSessionId() {
    return crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  // Generate CSRF token
  generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Insert session into session database
  insertSession(sessionDb, sessionId, sessionData) {
    return new Promise((resolve, reject) => {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const sessionJson = JSON.stringify(sessionData);
      
      sessionDb.run(
        `INSERT OR REPLACE INTO sessions (sid, sess, expire)
         VALUES (?, ?, ?)`,
        [sessionId, sessionJson, expires.getTime()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Save session data to file for load testing
  saveSessionsForLoadTest(sessions, filename = 'test-sessions.json') {
    const sessionsPath = path.join(__dirname, filename);
    
    const sessionData = {
      created: new Date().toISOString(),
      count: sessions.length,
      sessions: sessions.map(s => ({
        sessionCookie: s.sessionCookie,
        csrfToken: s.csrfToken,
        userId: s.userId,
        email: s.email
      }))
    };
    
    fs.writeFileSync(sessionsPath, JSON.stringify(sessionData, null, 2));
    console.log(`💾 Saved ${sessions.length} sessions to ${sessionsPath}`);
    return sessionsPath;
  }

  // Clean up test users
  async cleanupTestUsers() {
    console.log('🧹 Cleaning up test users...');
    
    return new Promise((resolve, reject) => {
      // Delete test users and their steps
      this.db.serialize(() => {
        this.db.run('DELETE FROM steps WHERE user_id IN (SELECT id FROM users WHERE email LIKE "loadtest%@example.com")');
        this.db.run('DELETE FROM users WHERE email LIKE "loadtest%@example.com"', function(err) {
          if (err) {
            reject(err);
          } else {
            console.log(`✅ Cleaned up ${this.changes} test users`);
            resolve(this.changes);
          }
        });
      });
    });
  }

  close() {
    this.db.close();
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const userCount = parseInt(args[1]) || 20;
  
  const generator = new TestUserGenerator();
  
  try {
    switch (command) {
      case 'create':
        const users = await generator.createTestUsers(userCount);
        const sessions = await generator.createAuthenticatedSessions(users);
        generator.saveSessionsForLoadTest(sessions);
        break;
        
      case 'cleanup':
        await generator.cleanupTestUsers();
        break;
        
      case 'sessions-only':
        // Recreate sessions for existing test users
        const existingUsers = await generator.getExistingTestUsers();
        if (existingUsers.length === 0) {
          console.log('❌ No existing test users found. Run "create" first.');
          break;
        }
        const newSessions = await generator.createAuthenticatedSessions(existingUsers);
        generator.saveSessionsForLoadTest(newSessions);
        break;
        
      default:
        console.log('Usage:');
        console.log('  node create-test-users.js create [count]     - Create test users and sessions');
        console.log('  node create-test-users.js sessions-only     - Recreate sessions for existing users');
        console.log('  node create-test-users.js cleanup           - Remove all test users');
        console.log('');
        console.log('Examples:');
        console.log('  node create-test-users.js create 25         - Create 25 test users');
        console.log('  node create-test-users.js cleanup           - Clean up test users');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    generator.close();
  }
}

// Add method to get existing test users
TestUserGenerator.prototype.getExistingTestUsers = function() {
  return new Promise((resolve, reject) => {
    this.db.all(
      'SELECT id, email, name, team FROM users WHERE email LIKE "loadtest%@example.com" ORDER BY id',
      [],
      (err, users) => {
        if (err) {
          reject(err);
        } else {
          resolve(users);
        }
      }
    );
  });
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = TestUserGenerator;