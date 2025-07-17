const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const session = require('express-session');
const db = require('./database');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'step-challenge-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
app.use(express.static('public'));

// Mailgun configuration
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'sigfig.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'data@sigfig.com';
const MAILGUN_API_URL = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;

// Email sending function using Mailgun
async function sendEmail(to, subject, htmlBody, textBody) {
  if (!MAILGUN_API_KEY) {
    console.log('MAILGUN_API_KEY not configured. Login URL would be sent to:', to);
    console.log('Subject:', subject);
    console.log('Body:', textBody);
    return { success: false, message: 'Email not configured' };
  }

  try {
    const response = await axios.post(
      MAILGUN_API_URL,
      new URLSearchParams({
        from: FROM_EMAIL,
        to: to,
        subject: subject,
        html: htmlBody,
        text: textBody,
        'o:tracking': 'no'
      }),
      {
        auth: {
          username: 'api',
          password: MAILGUN_API_KEY
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Mailgun error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Utility functions
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Authentication middleware
function requireAuth(req, res, next) {
  console.log('requireAuth check - session userId:', req.session.userId);
  if (!req.session.userId) {
    console.log('No session userId, redirecting to login');
    return res.redirect('/');
  }
  next();
}

// API authentication middleware
function requireApiAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Admin authentication middleware
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  // Check if user is admin
  db.get(`SELECT is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error checking admin status:', err);
      return res.status(500).send('Database error');
    }
    
    if (!user || !user.is_admin) {
      return res.status(403).send('Access denied. Admin privileges required.');
    }
    
    next();
  });
}

// Admin API authentication middleware
function requireApiAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check if user is admin
  db.get(`SELECT is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error checking admin status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    next();
  });
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Send magic link
app.post('/auth/send-link', async (req, res) => {
  const { email } = req.body;
  
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    // Store token in database
    db.run(
      `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
      [token, email, expiresAt.toISOString()],
      function(err) {
        if (err) {
          console.error('Error storing token:', err);
          return res.status(500).json({ error: 'Database error' });
        }
      }
    );

    // Send email
    const loginUrl = `${req.protocol}://${req.get('host')}/auth/login?token=${token}`;
    
    // Random Simpsons quotes (classic and memorable)
    const quotes = [
      "To alcohol! The cause of, and solution to, all of life's problems.",
      "I can't promise I'll try, but I'll try to try.",
      "Kids, just because I don't care doesn't mean I'm not listening.",
      "It takes two to lie; one to lie, and one to listen.",
      "I learned that beneath my goody two-shoes lies some very dark socks.",
      "Trying is the first step towards failure.",
      "I'm not a bad guy! I work hard, and I love my kids. So why should I spend half my Sunday hearing about how I'm going to hell?",
      "Facts are meaningless. You could use facts to prove anything that's even remotely true.",
      "I'm going to the back seat of my car, with the woman I love, and I won't be back for ten minutes!",
      "Stupid Flanders."
    ];
    
    const xkcdLinks = [
      "https://xkcd.com/1744/", // Exercise
      "https://xkcd.com/1682/", // Binge Watching
      "https://xkcd.com/1445/", // Efficiency
      "https://xkcd.com/1658/", // Estimating Time
      "https://xkcd.com/1319/", // Automation
      "https://xkcd.com/1205/", // Is It Worth the Time?
      "https://xkcd.com/1150/", // Instagram
      "https://xkcd.com/1481/", // API
      "https://xkcd.com/1739/", // Fixing Problems
      "https://xkcd.com/1053/"  // Ten Thousand
    ];
    
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    const randomXkcd = xkcdLinks[Math.floor(Math.random() * xkcdLinks.length)];
    
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 20px;">
        <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); padding: 30px; border-radius: 15px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
          <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 600; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
            Step Challenge Login
          </h1>
          
          <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
            Ready to track your steps? Click the button below to log in to your dashboard.
          </p>
          
          <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            Login to Step Challenge
          </a>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 30px;">
            This link expires in 30 minutes for security.
          </p>
          
          <div style="background: rgba(102, 126, 234, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Quote of the Day</h3>
            <p style="font-style: italic; color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
              "${randomQuote}"
            </p>
          </div>
          
          <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 20px;">
            <p style="font-size: 12px; color: #888; margin: 0;">
              <a href="${randomXkcd}" style="color: #667eea; text-decoration: none;">${randomXkcd}</a>
            </p>
            <p style="font-size: 12px; color: #888; margin: 10px 0 0 0;">
              Step Challenge • Powered by Sigfig
            </p>
          </div>
        </div>
      </div>
    `;
    
    const textBody = `
Step Challenge Login

Ready to track your steps? Click the link below to log in:
${loginUrl}

This link expires in 30 minutes for security.

Quote of the Day:
"${randomQuote}"

${randomXkcd}

Step Challenge • Powered by Sigfig

End of Message`;

    const emailResult = await sendEmail(email, 'Step Challenge Login Link', htmlBody, textBody);

    if (emailResult.success) {
      res.json({ message: 'Login link sent to your email' });
    } else {
      console.error('Failed to send email:', emailResult.error);
      res.json({ message: 'Login link sent to your email' }); // Still show success to user
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send login link' });
  }
});

// Login with token
app.get('/auth/login', (req, res) => {
  const { token } = req.query;
  
  console.log('Login attempt with token:', token ? 'present' : 'missing');
  
  if (!token) {
    console.log('No token provided');
    return res.status(400).send('Invalid login link');
  }

  // Verify token
  db.get(
    `SELECT * FROM auth_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')`,
    [token],
    (err, row) => {
      if (err) {
        console.error('Token verification error:', err);
        return res.status(500).send('Database error');
      }
      
      if (!row) {
        console.log('Token not found, used, or expired');
        return res.status(400).send('Invalid or expired login link');
      }

      console.log('Valid token found for email:', row.email);
      
      // Mark token as used
      db.run(`UPDATE auth_tokens SET used = 1 WHERE token = ?`, [token]);

      // Create or get user and set session
      db.get(`SELECT * FROM users WHERE email = ?`, [row.email], (err, user) => {
        if (err) {
          console.error('User lookup error:', err);
          return res.status(500).send('Database error');
        }

        if (!user) {
          console.log('Creating new user for:', row.email);
          // Create new user
          db.run(
            `INSERT INTO users (email, name) VALUES (?, ?)`,
            [row.email, row.email.split('@')[0]],
            function(err) {
              if (err) {
                console.error('User creation error:', err);
                return res.status(500).send('Database error');
              }
              
              console.log('New user created with ID:', this.lastID);
              
              // Set session and redirect to dashboard
              req.session.userId = this.lastID;
              req.session.email = row.email;
              
              req.session.save((err) => {
                if (err) {
                  console.error('Session save error:', err);
                  return res.status(500).send('Session error');
                }
                console.log('Session saved for new user, redirecting to dashboard');
                res.redirect(`/dashboard`);
              });
            }
          );
        } else {
          console.log('Existing user found:', user.id, user.email);
          // Set session and redirect to dashboard
          req.session.userId = user.id;
          req.session.email = user.email;
          
          req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              return res.status(500).send('Session error');
            }
            console.log('Session saved for existing user, redirecting to dashboard');
            res.redirect(`/dashboard`);
          });
        }
      });
    }
  );
});

// Dashboard (protected)
app.get('/dashboard', requireAuth, (req, res) => {
  console.log('Dashboard accessed by user:', req.session.userId);
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API to get current user info
app.get('/api/user', requireApiAuth, (req, res) => {
  db.get(`SELECT id, email, name, team, is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Get user steps (protected - only own steps)
app.get('/api/steps', requireApiAuth, (req, res) => {
  const userId = req.session.userId;
  
  db.all(
    `SELECT date, count FROM steps WHERE user_id = ? ORDER BY date DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching steps:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    }
  );
});

// Add/update steps (protected - only own steps)
app.post('/api/steps', requireApiAuth, (req, res) => {
  const { date, count } = req.body;
  const userId = req.session.userId;
  
  if (!date || count === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  
  if (count < 0 || count > 70000) {
    return res.status(400).json({ error: 'Step count must be between 0 and 70,000' });
  }

  db.run(
    `INSERT OR REPLACE INTO steps (user_id, date, count, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    [userId, date, count],
    function(err) {
      if (err) {
        console.error('Error saving steps:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Steps saved successfully' });
    }
  );
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  db.all(`
    SELECT 
      u.name, 
      u.email, 
      u.team,
      COALESCE(SUM(s.count), 0) as total_steps,
      COALESCE(AVG(s.count), 0) as avg_steps_per_day,
      COUNT(s.id) as days_logged,
      CASE 
        WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id)
        ELSE 0 
      END as steps_per_day_reported
    FROM users u
    LEFT JOIN steps s ON u.id = s.user_id
    GROUP BY u.id
    ORDER BY steps_per_day_reported DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching leaderboard:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Admin routes

// Get all users (admin only)
app.get('/api/admin/users', requireApiAdmin, (req, res) => {
  db.all(`
    SELECT 
      u.id,
      u.email,
      u.name,
      u.team,
      u.is_admin,
      COALESCE(SUM(s.count), 0) as total_steps,
      COUNT(s.id) as days_logged
    FROM users u
    LEFT JOIN steps s ON u.id = s.user_id
    GROUP BY u.id
    ORDER BY u.name
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Update user team (admin only)
app.put('/api/admin/users/:userId/team', requireApiAdmin, (req, res) => {
  const { userId } = req.params;
  const { team } = req.body;
  
  db.run(
    `UPDATE users SET team = ? WHERE id = ?`,
    [team, userId],
    function(err) {
      if (err) {
        console.error('Error updating user team:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Team updated successfully' });
    }
  );
});

// Get teams list
app.get('/api/teams', (req, res) => {
  db.all(`SELECT id, name FROM teams ORDER BY name`, (err, rows) => {
    if (err) {
      console.error('Error fetching teams:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create new team
app.post('/api/admin/teams', requireApiAdmin, (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Team name is required' });
  }
  
  db.run(
    `INSERT INTO teams (name) VALUES (?)`,
    [name.trim()],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ error: 'Team name already exists' });
        }
        console.error('Error creating team:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ id: this.lastID, name: name.trim(), message: 'Team created successfully' });
    }
  );
});

// Update team name
app.put('/api/admin/teams/:teamId', requireApiAdmin, (req, res) => {
  const { teamId } = req.params;
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Team name is required' });
  }
  
  db.run(
    `UPDATE teams SET name = ? WHERE id = ?`,
    [name.trim(), teamId],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ error: 'Team name already exists' });
        }
        console.error('Error updating team:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      // Update all users with the old team name to the new team name
      db.run(
        `UPDATE users SET team = ? WHERE team = (SELECT name FROM teams WHERE id = ?)`,
        [name.trim(), teamId],
        (err) => {
          if (err) {
            console.error('Error updating user teams:', err);
          }
        }
      );
      
      res.json({ message: 'Team updated successfully' });
    }
  );
});

// Delete team (soft delete by setting inactive)
app.delete('/api/admin/teams/:teamId', requireApiAdmin, (req, res) => {
  const { teamId } = req.params;
  
  // First, remove team assignment from all users
  db.run(
    `UPDATE users SET team = NULL WHERE team = (SELECT name FROM teams WHERE id = ?)`,
    [teamId],
    (err) => {
      if (err) {
        console.error('Error removing team from users:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Then delete the team
      db.run(
        `DELETE FROM teams WHERE id = ?`,
        [teamId],
        function(err) {
          if (err) {
            console.error('Error deleting team:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Team not found' });
          }
          
          res.json({ message: 'Team deleted successfully' });
        }
      );
    }
  );
});

// Team leaderboard
app.get('/api/team-leaderboard', (req, res) => {
  db.all(`
    SELECT 
      u.team,
      COUNT(DISTINCT u.id) as member_count,
      COALESCE(SUM(s.count), 0) as total_steps,
      COALESCE(AVG(s.count), 0) as avg_steps_per_entry,
      CASE 
        WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id)
        ELSE 0 
      END as avg_steps_per_day_reported,
      CASE 
        WHEN COUNT(DISTINCT u.id) > 0 AND COUNT(s.id) > 0 THEN 
          COALESCE(SUM(s.count), 0) / COUNT(s.id)
        ELSE 0 
      END as team_steps_per_day_reported
    FROM users u
    LEFT JOIN steps s ON u.id = s.user_id
    WHERE u.team IS NOT NULL AND u.team != ''
    GROUP BY u.team
    ORDER BY team_steps_per_day_reported DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching team leaderboard:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Admin dashboard
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});