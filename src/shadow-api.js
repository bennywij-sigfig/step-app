// Shadow Pig Game API - Completely separate from main app
// Handles all shadow game data storage and leaderboard functionality

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Import admin middleware for admin-only endpoints
const { requireApiAdmin } = require('./middleware/auth');
const { adminApiLimiter } = require('./middleware/rateLimiters');

// Simple CSRF validation for shadow API admin endpoints
function validateCSRFToken(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  const token = req.body.csrfToken || req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;
  
  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
}

// Create separate router for shadow game API
const router = express.Router();

// Use the same database as main app but only shadow tables
const dbPath = process.env.DB_PATH || 
  (process.env.NODE_ENV === 'production' 
    ? '/data/steps.db' 
    : path.join(__dirname, 'steps.db'));

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('❌ Shadow API database connection failed:', err.message);
  } else {
    console.log('✅ Shadow API connected to database');
  }
});

// Middleware to require authentication (reuse from main app logic)
function requireShadowAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Individual leaderboard - shows total steps per person
router.get('/leaderboard/individual', requireShadowAuth, (req, res) => {
  const query = `
    SELECT u.id, u.name, SUM(ss.trots) as total_trots, 
           SUM(ss.games_played) as total_games, MAX(ss.best_distance) as best_distance
    FROM users u 
    LEFT JOIN shadow_steps ss ON u.id = ss.user_id 
    GROUP BY u.id, u.name
    ORDER BY COALESCE(total_trots, 0) DESC, u.name ASC
    LIMIT 20
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Shadow individual leaderboard error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      user_id: row.id,
      name: row.name,
      total_trots: row.total_trots || 0,
      total_games: row.total_games || 0,
      best_distance: row.best_distance || 0
    }));
    
    res.json(leaderboard);
  });
});

// Team leaderboard - shows total steps per team
router.get('/leaderboard/team', requireShadowAuth, (req, res) => {
  const query = `
    SELECT u.team, COALESCE(SUM(ss.trots), 0) as total_trots, 
           COUNT(DISTINCT u.id) as member_count,
           COUNT(DISTINCT CASE WHEN ss.trots > 0 THEN u.id END) as active_members
    FROM users u 
    LEFT JOIN shadow_steps ss ON u.id = ss.user_id 
    WHERE u.team IS NOT NULL AND u.team != ''
    GROUP BY u.team 
    ORDER BY total_trots DESC 
    LIMIT 15
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Shadow team leaderboard error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      team: row.team,
      total_trots: row.total_trots || 0,
      member_count: row.member_count || 0,
      active_members: row.active_members || 0
    }));
    
    res.json(leaderboard);
  });
});

// Save shadow game result
router.post('/save-result', requireShadowAuth, (req, res) => {
  const { stepsEarned, distance, heartsUsed } = req.body;
  const userId = req.session.userId;
  
  // Use Pacific Time to match main app
  const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
  const pacificDate = new Date(today).toISOString().split('T')[0];

  // Validate input
  if (!stepsEarned || !distance || heartsUsed === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Insert or update shadow_steps for today
  const query = `
    INSERT INTO shadow_steps (user_id, date, trots, games_played, best_distance, hearts_used)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      trots = trots + ?,
      games_played = games_played + 1,
      best_distance = MAX(best_distance, ?),
      hearts_used = hearts_used + ?,
      updated_at = CURRENT_TIMESTAMP
  `;

  db.run(query, [
    userId, pacificDate, stepsEarned, distance, heartsUsed,
    stepsEarned, distance, heartsUsed
  ], function(err) {
    if (err) {
      console.error('Error saving shadow game result:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    console.log(`Shadow game result saved: User ${userId}, Steps: ${stepsEarned}, Distance: ${distance}m`);
    res.json({ success: true });
  });
});

// Get user's current heart status
router.get('/hearts', requireShadowAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Use Pacific Time to match main app
  const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
  const pacificDate = new Date(today).toISOString().split('T')[0];

  // Get or create today's heart record
  const query = `
    INSERT INTO shadow_hearts (user_id, date, hearts_remaining, hearts_used)
    VALUES (?, ?, 5, 0)
    ON CONFLICT(user_id, date) DO NOTHING
  `;
  
  db.run(query, [userId, pacificDate], function(err) {
    if (err) {
      console.error('Error initializing hearts:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Now get the current heart status
    const selectQuery = `
      SELECT hearts_remaining, hearts_used, last_game_at
      FROM shadow_hearts 
      WHERE user_id = ? AND date = ?
    `;
    
    db.get(selectQuery, [userId, pacificDate], (selectErr, row) => {
      if (selectErr) {
        console.error('Error fetching hearts:', selectErr);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Calculate hours until Pacific midnight
      const now = new Date();
      const pacificNow = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
      const hoursLeft = 23 - pacificNow.getHours();
      const minutesLeft = 59 - pacificNow.getMinutes();
      const secondsLeft = 59 - pacificNow.getSeconds();
      const totalHoursLeft = hoursLeft + (minutesLeft / 60) + (secondsLeft / 3600);
      const hoursUntilReset = Math.ceil(totalHoursLeft);
      
      res.json({
        hearts: row.hearts_remaining,
        heartsUsed: row.hearts_used,
        hoursUntilReset: hoursUntilReset,
        lastGameAt: row.last_game_at,
        date: pacificDate
      });
    });
  });
});

// Start a new game (decrements heart) with atomic transaction
router.post('/start-game', requireShadowAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Use Pacific Time to match main app
  const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
  const pacificDate = new Date(today).toISOString().split('T')[0];

  // Atomic heart check and decrement using single UPDATE with WHERE clause
  const gameSessionToken = require('crypto').randomBytes(16).toString('hex');
  
  // Atomic operation: only update if hearts_remaining > 0
  const atomicUpdateQuery = `
    UPDATE shadow_hearts 
    SET hearts_remaining = hearts_remaining - 1,
        hearts_used = hearts_used + 1,
        last_game_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND date = ? AND hearts_remaining > 0
  `;
  
  db.run(atomicUpdateQuery, [userId, pacificDate], function(err) {
    if (err) {
      console.error('Error updating hearts:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Check if the update actually affected a row
    if (this.changes === 0) {
      // No rows affected means either no record exists or hearts_remaining <= 0
      return res.status(400).json({ error: 'No hearts remaining today' });
    }
    
    // Get the updated heart count
    const getHeartsQuery = `
      SELECT hearts_remaining 
      FROM shadow_hearts 
      WHERE user_id = ? AND date = ?
    `;
    
    db.get(getHeartsQuery, [userId, pacificDate], (selectErr, row) => {
      if (selectErr) {
        console.error('Error fetching updated hearts:', selectErr);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Store game session for validation
      req.session.currentGameToken = gameSessionToken;
      req.session.gameStartTime = Date.now();
      
      res.json({
        success: true,
        gameToken: gameSessionToken,
        heartsRemaining: row ? row.hearts_remaining : 0
      });
    });
  });
});

// Save game result (enhanced with heart validation)
router.post('/save-result-secure', requireShadowAuth, (req, res) => {
  const { stepsEarned, distance, gameToken } = req.body;
  const userId = req.session.userId;
  
  // Validate game session
  if (!gameToken || gameToken !== req.session.currentGameToken) {
    return res.status(400).json({ error: 'Invalid game session' });
  }
  
  // Validate reasonable game duration (min 5 seconds, max 10 minutes)
  const gameStartTime = req.session.gameStartTime;
  const gameDuration = Date.now() - gameStartTime;
  if (gameDuration < 5000 || gameDuration > 600000) {
    return res.status(400).json({ error: 'Invalid game duration' });
  }
  
  // Clear game session
  delete req.session.currentGameToken;
  delete req.session.gameStartTime;
  
  // Use Pacific Time to match main app
  const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
  const pacificDate = new Date(today).toISOString().split('T')[0];

  // Validate input
  if (!stepsEarned || !distance) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Insert or update shadow_steps for today
  const query = `
    INSERT INTO shadow_steps (user_id, date, trots, games_played, best_distance, hearts_used)
    VALUES (?, ?, ?, 1, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET
      trots = trots + ?,
      games_played = games_played + 1,
      best_distance = MAX(best_distance, ?),
      hearts_used = hearts_used + 1,
      updated_at = CURRENT_TIMESTAMP
  `;

  db.run(query, [
    userId, pacificDate, stepsEarned, distance,
    stepsEarned, distance
  ], function(err) {
    if (err) {
      console.error('Error saving shadow game result:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ success: true });
  });
});

// Admin endpoint: Reset user's shadow game data (requires admin auth from main app)
router.post('/admin/reset-user-data', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  
  const { email } = req.body;
  
  // Validate input
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // First, find the user by email
  db.get('SELECT id, email, name FROM users WHERE email = ?', [trimmedEmail], (err, user) => {
    if (err) {
      console.error('Shadow API - Error finding user:', err);
      return res.status(500).json({ error: 'Database error while finding user' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found with that email address' });
    }
    
    // Now delete shadow game data for this user
    db.serialize(() => {
      let totalRecordsDeleted = 0;
      
      // Delete from shadow_steps table
      db.run('DELETE FROM shadow_steps WHERE user_id = ?', [user.id], function(err) {
        if (err) {
          console.error('Shadow API - Error deleting shadow_steps:', err);
          return res.status(500).json({ error: 'Failed to reset shadow steps data' });
        }
        totalRecordsDeleted += this.changes;
        
        // Delete from shadow_hearts table
        db.run('DELETE FROM shadow_hearts WHERE user_id = ?', [user.id], function(err) {
          if (err) {
            console.error('Shadow API - Error deleting shadow_hearts:', err);
            return res.status(500).json({ error: 'Failed to reset shadow hearts data' });
          }
          totalRecordsDeleted += this.changes;
          
          console.log(`✅ Shadow API - Admin ${req.session.email || req.session.userId || 'unknown'} reset shadow game data for user: ${user.email} (${user.name || 'No name'}). Records deleted: ${totalRecordsDeleted}`);
          
          res.json({ 
            success: true, 
            message: `Successfully reset shadow game data for ${user.email}`,
            user: {
              email: user.email,
              name: user.name
            },
            recordsDeleted: totalRecordsDeleted
          });
        });
      });
    });
  });
});

// Award bonus heart to user
router.post('/bonus-heart', requireShadowAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Use Pacific Time to match main app
  const today = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}).split(',')[0];
  const pacificDate = new Date(today).toISOString().split('T')[0];

  // Atomic operation: only add bonus heart if hearts_remaining < 5
  const atomicUpdateQuery = `
    UPDATE shadow_hearts 
    SET hearts_remaining = hearts_remaining + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND date = ? AND hearts_remaining < 5
  `;
  
  db.run(atomicUpdateQuery, [userId, pacificDate], function(err) {
    if (err) {
      console.error('Error awarding bonus heart:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Check if the update actually affected a row
    if (this.changes === 0) {
      // No rows affected means either no record exists or hearts_remaining >= 5
      return res.status(400).json({ error: 'Cannot award bonus heart - already at maximum hearts' });
    }
    
    // Get the updated heart count
    const getHeartsQuery = `
      SELECT hearts_remaining 
      FROM shadow_hearts 
      WHERE user_id = ? AND date = ?
    `;
    
    db.get(getHeartsQuery, [userId, pacificDate], (selectErr, row) => {
      if (selectErr) {
        console.error('Error fetching updated hearts after bonus:', selectErr);
        return res.status(500).json({ error: 'Database error' });
      }
      
      console.log(`Bonus heart awarded to user ${userId}: ${row ? row.hearts_remaining : 'unknown'} hearts`);
      
      res.json({
        success: true,
        heartsRemaining: row ? row.hearts_remaining : 0,
        message: 'Bonus heart awarded!'
      });
    });
  });
});

module.exports = router;