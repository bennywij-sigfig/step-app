const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/data/steps.db');

console.log('Looking for Benny in users table...');
db.get("SELECT id, email FROM users WHERE email LIKE '%benny%' OR email LIKE '%Benny%' OR name LIKE '%benny%' OR name LIKE '%Benny%' LIMIT 1", (err, user) => {
  if (err) {
    console.error('Error finding user:', err);
    db.close();
    return;
  }
  
  if (!user) {
    console.log('Benny not found in users table');
    db.close();
    return;
  }
  
  console.log('Found user:', user);
  
  // First check current shadow stats
  db.get("SELECT * FROM shadow_steps WHERE user_id = ?", [user.id], (err, current) => {
    if (err) {
      console.error('Error checking current stats:', err);
      db.close();
      return;
    }
    
    if (current) {
      console.log('Current shadow stats:', current);
    } else {
      console.log('No shadow stats found for this user');
    }
    
    // Reset trots to 0
    db.run('UPDATE shadow_steps SET trots = 0 WHERE user_id = ?', [user.id], function(err) {
      if (err) {
        console.error('Error resetting stats:', err);
      } else {
        console.log('Reset complete. Rows affected:', this.changes);
      }
      db.close();
    });
  });
});