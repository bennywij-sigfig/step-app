// Shadow Pig Game API - Completely separate from main app
// Handles all shadow game data storage and leaderboard functionality

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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

module.exports = router;