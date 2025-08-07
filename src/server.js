const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
let db = require('./database');
const { mcpUtils, handleMCPRequest, getMCPCapabilities } = require('../mcp/mcp-server');
const { isDevelopment, devLog } = require('./utils/dev');
const {
  requireAuth,
  requireApiAuth,
  requireAdmin,
  requireApiAdmin
} = require('./middleware/auth');
const {
  magicLinkLimiter,
  apiLimiter,
  adminApiLimiter,
  mcpApiLimiter,
  mcpBurstLimiter
} = require('./middleware/rateLimiters');
const { sendEmail } = require('./services/email');
const { isValidEmail, normalizeEmail, isValidDate } = require('./utils/validation');
const { hashToken, generateSecureToken } = require('./utils/token');
const { getCurrentPacificTime, getCurrentChallengeDay, getTotalChallengeDays } = require('./utils/challenge');

// Load environment variables
require('dotenv').config();

// Environment validation
function validateEnvironment() {
  const requiredVars = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  const missing = [];
  
  // Check for production requirements
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      missing.push('SESSION_SECRET (must be at least 32 characters for production)');
    }
    if (!process.env.MAILGUN_API_KEY) {
      console.warn('⚠️  MAILGUN_API_KEY not set - email functionality will be disabled');
    }
  }
  
  // Check for development default secret
  if (process.env.SESSION_SECRET === 'step-challenge-secret-key-change-in-production') {
    console.warn('⚠️  Using default SESSION_SECRET - please change for production!');
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please copy .env.example to .env and configure the required variables.');
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
}

// Validate environment at startup
validateEnvironment();

// Environment info (production-safe)
const isProduction = process.env.NODE_ENV === 'production';

if (isDevelopment) {
  console.log('🔧 Development mode - debug logging enabled');
  console.log('Environment check:');
  console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'SET' : 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('MAILGUN_API_KEY:', process.env.MAILGUN_API_KEY ? 'SET' : 'NOT SET');
} else {
  console.log('🚀 Production mode - starting Step Challenge App');
}


const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for fly.io (enables secure cookies behind HTTPS proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"], // Allow inline styles and CDN
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // Allow inline scripts and CDN for MCP setup page
      imgSrc: ["'self'", "data:", "https:"], // Allow external images for charts/icons
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"], // Allow font awesome fonts
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for compatibility
}));

// CORS configuration
const corsOptions = {
  origin: isProduction 
    ? process.env.ALLOWED_ORIGIN || 'https://step-app-4x-yhw.fly.dev'
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Configure session store
const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: process.env.NODE_ENV === 'production' ? '/data' : '.',
  table: 'sessions'
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'step-challenge-secret-key-change-in-production',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));






// Check if a date is within challenge period (Pacific Time)
function isDateInChallengePeriod(date, challenge) {
  try {
    const checkDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone edge cases
    const startPacific = new Date(challenge.start_date + 'T00:00:00');
    const endPacific = new Date(challenge.end_date + 'T23:59:59');
    
    return checkDate >= startPacific && checkDate <= endPacific;
  } catch (error) {
    console.error('Error checking date in challenge period:', error);
    return false;
  }
}

// Calculate individual reporting percentage for challenge
async function calculateIndividualReportingPercentage(challengeId, currentDay) {
  return new Promise((resolve, reject) => {
    if (currentDay <= 0) {
      return resolve({ percentage: 0, expected: 0, actual: 0 });
    }

    const query = `
      WITH challenge_participants AS (
        SELECT DISTINCT s.user_id 
        FROM steps s 
        WHERE s.challenge_id = ?
      ),
      expected_entries AS (
        SELECT COUNT(*) * ? as expected_total
        FROM challenge_participants
      ),
      actual_entries AS (
        SELECT COUNT(*) as actual_total
        FROM steps s
        JOIN challenges c ON s.challenge_id = c.id
        WHERE s.challenge_id = ? 
        AND s.date >= c.start_date 
        AND s.date <= date(c.start_date, '+' || (? - 1) || ' days')
      )
      SELECT 
        COALESCE(expected_entries.expected_total, 0) as expected_total,
        COALESCE(actual_entries.actual_total, 0) as actual_total,
        CASE 
          WHEN expected_entries.expected_total = 0 THEN 0
          ELSE ROUND((actual_entries.actual_total * 100.0) / expected_entries.expected_total, 2)
        END as reporting_percentage
      FROM expected_entries, actual_entries
    `;
    
    db.get(query, [challengeId, currentDay, challengeId, currentDay], (err, result) => {
      if (err) {
        console.error('Error calculating individual reporting percentage:', err);
        return reject(err);
      }
      
      resolve({
        percentage: result ? result.reporting_percentage : 0,
        expected: result ? result.expected_total : 0,
        actual: result ? result.actual_total : 0
      });
    });
  });
}


// Get active challenge with error handling
async function getActiveChallenge() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM challenges WHERE is_active = 1 LIMIT 1`, (err, challenge) => {
      if (err) {
        console.error('Error fetching active challenge:', err);
        return reject(err);
      }
      resolve(challenge || null);
    });
  });
}

// Get participant count for a challenge
async function getChallengeParticipantCount(challengeId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(DISTINCT user_id) as count FROM steps WHERE challenge_id = ?`,
      [challengeId],
      (err, result) => {
        if (err) {
          console.error('Error getting participant count:', err);
          return reject(err);
        }
        resolve(result ? result.count : 0);
      }
    );
  });
}

// Get individual leaderboard with personal reporting rates
async function getIndividualLeaderboardWithRates(challengeId, currentDay, threshold) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        u.name, 
        u.team,
        COALESCE(SUM(s.count), 0) as total_steps,
        COALESCE(AVG(s.count), 0) as avg_steps_per_day,
        COUNT(s.id) as days_logged,
        CASE 
          WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id)
          ELSE 0 
        END as steps_per_day_reported,
        CASE 
          WHEN ? > 0 THEN ROUND((COUNT(s.id) * 100.0) / ?, 2)
          ELSE 0
        END as personal_reporting_rate,
        CASE 
          WHEN ? > 0 AND ROUND((COUNT(s.id) * 100.0) / ?, 2) >= ? THEN 1
          ELSE 0
        END as meets_threshold
      FROM users u
      LEFT JOIN steps s ON u.id = s.user_id AND s.challenge_id = ?
      WHERE u.id IN (SELECT DISTINCT user_id FROM steps WHERE challenge_id = ?)
      GROUP BY u.id
      ORDER BY meets_threshold DESC, steps_per_day_reported DESC, u.name ASC
    `;
    
    db.all(query, [currentDay, currentDay, currentDay, currentDay, threshold, challengeId, challengeId], (err, rows) => {
      if (err) {
        console.error('Error getting individual leaderboard with rates:', err);
        return reject(err);
      }
      
      const ranked = rows.filter(row => row.meets_threshold === 1);
      const unranked = rows.filter(row => row.meets_threshold === 0);
      
      resolve({ ranked, unranked });
    });
  });
}

// Get team leaderboard with team reporting rates
async function getTeamLeaderboardWithRates(challengeId, currentDay, threshold) {
  return new Promise((resolve, reject) => {
    const query = `
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
        END as team_steps_per_day_reported,
        COUNT(s.id) as team_entries,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 AND ? > 0 THEN 
            ROUND((COUNT(s.id) * 100.0) / (COUNT(DISTINCT u.id) * ?), 2)
          ELSE 0
        END as team_reporting_rate,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 AND ? > 0 AND 
               ROUND((COUNT(s.id) * 100.0) / (COUNT(DISTINCT u.id) * ?), 2) >= ? THEN 1
          ELSE 0
        END as meets_threshold
      FROM users u
      LEFT JOIN steps s ON u.id = s.user_id AND s.challenge_id = ?
      WHERE u.team IS NOT NULL AND u.team != ''
      GROUP BY u.team
      ORDER BY meets_threshold DESC, team_steps_per_day_reported DESC, u.team ASC
    `;
    
    db.all(query, [currentDay, currentDay, currentDay, currentDay, threshold, challengeId], (err, rows) => {
      if (err) {
        console.error('Error getting team leaderboard with rates:', err);
        return reject(err);
      }
      
      const ranked = rows.filter(row => row.meets_threshold === 1);
      const unranked = rows.filter(row => row.meets_threshold === 0);
      
      resolve({ ranked, unranked });
    });
  });
}

// Authentication middleware

// CSRF Protection
function generateCSRFToken() {
  return uuidv4();
}

function validateCSRFToken(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  const token = req.body.csrfToken || req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;
  
  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
}

// Input sanitization to prevent XSS
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function sanitizeUserInput(req, res, next) {
  // Sanitize common user input fields
  if (req.body.name) req.body.name = sanitizeInput(req.body.name);
  if (req.body.email) req.body.email = sanitizeInput(req.body.email);
  if (req.body.team) req.body.team = sanitizeInput(req.body.team);
  next();
}

// Robust numeric input validation to prevent type confusion attacks
function validateNumericInput(value, fieldName, min = 0, max = Number.MAX_SAFE_INTEGER) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  
  // Type check and conversion
  if (typeof value !== 'number') {
    // Allow string numbers but validate carefully
    if (typeof value === 'string') {
      // Check for empty string
      if (value.trim() === '') {
        throw new Error(`${fieldName} cannot be empty`);
      }
      
      // Check for non-numeric strings
      if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
        throw new Error(`${fieldName} must be a valid number`);
      }
      
      const parsed = parseFloat(value.trim());
      if (isNaN(parsed)) {
        throw new Error(`${fieldName} must be a valid number`);
      }
      value = parsed;
    } else {
      // Reject objects, arrays, booleans, etc.
      throw new Error(`${fieldName} must be a number, received ${typeof value}`);
    }
  }
  
  // NaN/Infinity check
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  
  // Range validation
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  
  // Ensure integer for step counts
  return Math.floor(Math.abs(value)); // Also ensure positive
}

// Routes

// CSRF token endpoint
app.get('/api/csrf-token', requireApiAuth, (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  res.json({ csrfToken: req.session.csrfToken });
});

// Health check endpoint with comprehensive database monitoring
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: require('../package.json').version,
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: 'unknown',
        accessible: false,
        integrity: false,
        diskSpace: false
      },
      stats: null
    };

    // Check database health
    const dbHealth = await db.utils.checkHealth();
    health.database = {
      status: dbHealth.accessible && dbHealth.integrity ? 'healthy' : 'degraded',
      accessible: dbHealth.accessible,
      integrity: dbHealth.integrity,
      diskSpace: dbHealth.diskSpace,
      error: dbHealth.error
    };

    // Get database statistics if accessible
    if (dbHealth.accessible) {
      try {
        health.stats = await db.utils.getStats();
      } catch (statsErr) {
        console.warn('Could not get database stats:', statsErr.message);
      }

      // Get backup status
      try {
        health.backup = await db.utils.getBackupStatus();
      } catch (backupErr) {
        console.warn('Could not get backup status:', backupErr.message);
        health.backup = { hasBackups: false, error: backupErr.message };
      }
    }

    // Determine overall status
    if (!dbHealth.accessible) {
      health.status = 'unhealthy';
      console.error('Health check failed - database not accessible:', dbHealth.error);
      return res.status(503).json(health);
    } else if (!dbHealth.integrity) {
      health.status = 'degraded';
      console.warn('Health check warning - database integrity issue');
      return res.status(200).json(health);
    }

    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error.message
    });
  }
});

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Send magic link
app.post('/auth/send-link', magicLinkLimiter, async (req, res) => {
  const { email: rawEmail } = req.body;
  const email = normalizeEmail(rawEmail);
  
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const token = generateSecureToken();
    const hashedToken = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    // Store hashed token in database (security enhancement) - await the operation
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
        [hashedToken, email, expiresAt.toISOString()],
        function(err) {
          if (err) {
            console.error('Error storing token:', err);
            return reject(err);
          }
          resolve();
        }
      );
    });

    // Send email
    const loginUrl = `${req.protocol}://${req.get('host')}/auth/login?token=${token}`;
    
    // Random quotes
    const quotes = [
      "To alcohol! The cause of, and solution to, all of life's problems. -- Homer",
      "Do or do not, there is no try. -- Yoda",
      "The most important thing we learn at school is the fact that the most important things can't be learned at school. -- Murakami",
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
              Step Challenge • Made with LLMs and powered by fly.io
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
      return res.json({ message: 'Login link sent to your email' });
    } else {
      console.error('Failed to send email:', emailResult.error);
      return res.json({ message: 'Login link sent to your email' }); // Still show success to user
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send login link' });
  }
});

// Development-only: Get magic link directly (localhost only)
if (isDevelopment) {
  app.post('/dev/get-magic-link', magicLinkLimiter, async (req, res) => {
    const { email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);
    
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    try {
      // Wait for database initialization to complete before proceeding
      await db.ready;
      
      const token = generateSecureToken();
      const hashedToken = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      // Ensure auth_tokens table exists before trying to insert
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.error('Error ensuring auth_tokens table:', err);
            return reject(err);
          }
          resolve();
        });
      });
      
      // Store hashed token in database using retry mechanism for reliability
      await db.utils.executeWithRetry((callback) => {
        db.run(
          `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
          [hashedToken, email, expiresAt.toISOString()],
          callback
        );
      });

      // Return the magic link directly (development only)
      const loginUrl = `${req.protocol}://${req.get('host')}/auth/login?token=${token}`;
      
      console.log('🔗 Development magic link generated:', loginUrl);
      
      return res.json({ 
        message: 'Magic link generated for development',
        magicLink: loginUrl,
        email: email,
        expiresAt: expiresAt.toISOString(),
        note: 'This endpoint only works in development mode'
      });
    } catch (error) {
      console.error('Error generating development magic link:', error);
      return res.status(500).json({ error: 'Failed to generate magic link' });
    }
  });
}

// Login with token
app.get('/auth/login', (req, res) => {
  const { token } = req.query;
  
  devLog('Login attempt with token:', token ? 'present' : 'missing');
  
  if (!token) {
    devLog('No token provided');
    return res.status(400).send('Invalid login link');
  }

  try {
    // Verify token (hash before comparison for security)
    const hashedToken = hashToken(token);
  db.get(
    `SELECT * FROM auth_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')`,
    [hashedToken],
    (err, row) => {
      if (err) {
        console.error('Token verification error:', err);
        return res.status(500).send('Database error');
      }
      
      if (!row) {
        devLog('Token not found, used, or expired');
        return res.status(400).send('Invalid or expired login link');
      }

      devLog('Valid token found for email:', row.email);
      const normalizedEmail = normalizeEmail(row.email);
      
      // Mark token as used
      db.run(`UPDATE auth_tokens SET used = 1 WHERE token = ?`, [hashedToken]);

      // Create or get user and set session
      db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail], (err, user) => {
        if (err) {
          console.error('User lookup error:', err);
          return res.status(500).send('Database error');
        }

        if (!user) {
          devLog('Creating new user for:', normalizedEmail);
          // Create new user
          const sanitizedName = sanitizeInput(normalizedEmail.split('@')[0]);
          db.run(
            `INSERT INTO users (email, name) VALUES (?, ?)`,
            [normalizedEmail, sanitizedName],
            function(err) {
              if (err) {
                console.error('User creation error:', err);
                return res.status(500).send('Database error');
              }
              
              devLog('New user created with ID:', this.lastID);
              
              // Regenerate session for security and set user data
              req.session.regenerate((err) => {
                if (err) {
                  console.error('Session regeneration error:', err);
                  return res.status(500).send('Session error');
                }
                req.session.userId = this.lastID;
                req.session.email = normalizedEmail;
              
                req.session.save((err) => {
                if (err) {
                  console.error('Session save error:', err);
                  return res.status(500).send('Session error');
                }
                devLog('Session saved for new user, redirecting to dashboard');
                res.redirect(`/dashboard`);
                });
              });
            }
          );
        } else {
          devLog('Existing user found:', user.id, user.email);
          // Regenerate session for security and set user data
          req.session.regenerate((err) => {
            if (err) {
              console.error('Session regeneration error:', err);
              return res.status(500).send('Session error');
            }
            req.session.userId = user.id;
            req.session.email = normalizedEmail;
          
            req.session.save((err) => {
            if (err) {
              console.error('Session save error:', err);
              return res.status(500).send('Session error');
            }
            devLog('Session saved for existing user, redirecting to dashboard');
            res.redirect(`/dashboard`);
            });
          });
        }
      });
    }
  );
  } catch (error) {
    console.error('Login endpoint error:', error);
    devLog('Login endpoint error:', error.message);
    return res.status(400).send('Invalid login link');
  }
});

// Logout endpoints
app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Successfully logged out' });
  });
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/');
  });
});

// Dashboard (protected)
app.get('/dashboard', requireAuth, (req, res) => {
  devLog('Dashboard accessed by user:', req.session.userId);
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Redirect dashboard.html to protected route
app.get('/dashboard.html', requireAuth, (req, res) => {
  res.redirect('/dashboard');
});

// API to get current user info
app.get('/api/user', apiLimiter, requireApiAuth, (req, res) => {
  db.get(`SELECT id, email, name, team, is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get current active challenge
    db.get(`SELECT * FROM challenges WHERE is_active = 1`, (challengeErr, challenge) => {
      if (challengeErr) {
        console.error('Error fetching active challenge:', challengeErr);
        // Return user info without challenge info if there's an error
        return res.json(user);
      }
      
      // Include challenge info with user data
      res.json({
        ...user,
        current_challenge: challenge || null
      });
    });
  });
});

// API endpoint to get user's MCP tokens (for setup page)
app.get('/api/user/mcp-tokens', apiLimiter, requireApiAuth, (req, res) => {
  const userId = req.session.userId;
  
  db.all(`
    SELECT id, token, name, permissions, expires_at, last_used_at, created_at 
    FROM mcp_tokens 
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `, [userId], (err, tokens) => {
    if (err) {
      console.error('MCP tokens fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch MCP tokens' });
    }
    
    res.json({
      tokens: tokens || []
    });
  });
});

// Get user steps (protected - only own steps)
app.get('/api/steps', apiLimiter, requireApiAuth, (req, res) => {
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
app.post('/api/steps', apiLimiter, requireApiAuth, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { date, count } = req.body;
  const userId = req.session.userId;
  
  try {
    // Validate inputs with strict type checking
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    // Validate step count with comprehensive type checking
    const validatedCount = validateNumericInput(count, 'Step count', 0, 70000);
    
    // Validate date format
    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Prevent future date entries (allow up to +1 day for timezone flexibility)
    const stepDate = new Date(date + 'T00:00:00');
    const nowPacific = getCurrentPacificTime();
    const maxAllowedDate = new Date(nowPacific);
    maxAllowedDate.setDate(maxAllowedDate.getDate() + 1); // Allow +1 day for timezone flexibility
    
    if (stepDate > maxAllowedDate) {
      return res.status(400).json({ error: 'Cannot enter steps for future dates' });
    }
    
    // Use validated count instead of raw input
    const stepCount = validatedCount;

    // Check if there's an active challenge and validate date
    db.get(`SELECT * FROM challenges WHERE is_active = 1`, (err, challenge) => {
      if (err) {
        console.error('Error checking active challenge:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (challenge) {
        // Parse dates for comparison (ignoring time)
        const stepDate = new Date(date + 'T00:00:00');
        const startDate = new Date(challenge.start_date + 'T00:00:00');
        const endDate = new Date(challenge.end_date + 'T23:59:59');
        
        // Only block dates before challenge start - allow historical entries within challenge period
        if (stepDate < startDate) {
          return res.status(400).json({ 
            error: `Step logging is only allowed from the challenge start date onwards (${challenge.start_date} to ${challenge.end_date})`,
            challenge_period: {
              start_date: challenge.start_date,
              end_date: challenge.end_date,
              name: challenge.name
            }
          });
        }
        
        // Save steps with challenge_id using validated count
        db.run(
          `INSERT OR REPLACE INTO steps (user_id, date, count, challenge_id, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [userId, date, stepCount, challenge.id],
          function(err) {
            if (err) {
              console.error('Error saving steps:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Steps saved successfully', count: stepCount });
          }
        );
      } else {
        // No active challenge, save steps without challenge_id using validated count
        db.run(
          `INSERT OR REPLACE INTO steps (user_id, date, count, updated_at) VALUES (?, ?, ?, datetime('now'))`,
          [userId, date, stepCount],
          function(err) {
            if (err) {
              console.error('Error saving steps:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Steps saved successfully', count: stepCount });
          }
        );
      }
    });
  } catch (error) {
    // Handle validation errors
    console.log(`Input validation failed for user ${userId}: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});

// Challenge-aware individual leaderboard
app.get('/api/leaderboard', apiLimiter, requireApiAuth, async (req, res) => {
  try {
    const activeChallenge = await getActiveChallenge();
    
    // If no active challenge, return all-time rankings
    if (!activeChallenge) {
      db.all(`
        SELECT 
          u.name, 
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
          console.error('Error fetching all-time leaderboard:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({
          type: 'all_time',
          challenge_active: false,
          data: rows,
          message: 'All-time rankings (no active challenge)'
        });
      });
      return;
    }

    // Challenge is active - return challenge rankings with personal filtering
    const currentDay = getCurrentChallengeDay(activeChallenge);
    const participantCount = await getChallengeParticipantCount(activeChallenge.id);
    try {
      const leaderboardData = await getIndividualLeaderboardWithRates(
        activeChallenge.id, 
        currentDay, 
        activeChallenge.reporting_threshold
      );
      
      res.json({
        type: 'challenge',
        challenge_active: true,
        data: {
          ranked: leaderboardData.ranked,
          unranked: leaderboardData.unranked
        },
        meta: {
          challenge_name: activeChallenge.name,
          challenge_day: currentDay,
          total_days: getTotalChallengeDays(activeChallenge),
          participant_count: participantCount,
          ranked_count: leaderboardData.ranked.length,
          unranked_count: leaderboardData.unranked.length,
          personal_threshold: activeChallenge.reporting_threshold
        }
      });
    } catch (leaderboardError) {
      console.error('Error getting individual leaderboard with rates:', leaderboardError);
      return res.status(500).json({ error: 'Database error' });
    }

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// MCP (Model Context Protocol) remote server

// Remote MCP server endpoint - Streamable HTTP transport
app.post('/mcp', mcpBurstLimiter, mcpApiLimiter, async (req, res) => {
  try {
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');
    const authHeader = req.get('Authorization');
    
    // Set headers for Streamable HTTP remote MCP support
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const response = await handleMCPRequest(req.body, ipAddress, userAgent, authHeader);
    res.json(response);
  } catch (error) {
    console.error('Remote MCP server error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: 'Server error processing MCP request'
      },
      id: req.body?.id || null
    });
  }
});

// Handle preflight OPTIONS requests for CORS
app.options('/mcp', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// MCP Bridge Script Download (Public - no authentication required)
app.get('/download/step_bridge.py', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '..', 'mcp', 'step_bridge.py');
    
    // Security: Set proper headers for script download
    res.setHeader('Content-Type', 'text/x-python');
    res.setHeader('Content-Disposition', 'attachment; filename="step_bridge.py"');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Send the bridge script file
    res.sendFile(scriptPath, (err) => {
      if (err) {
        console.error('Error serving bridge script:', err);
        res.status(404).json({ error: 'Bridge script not found' });
      }
    });
  } catch (error) {
    console.error('Bridge script download error:', error);
    res.status(500).json({ error: 'Failed to download bridge script' });
  }
});

// MCP capabilities discovery endpoint (no authentication required)
app.get('/mcp/capabilities', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(getMCPCapabilities());
});

// Admin routes for MCP token management

// Get all MCP tokens (admin only)
app.get('/api/admin/mcp-tokens', adminApiLimiter, requireApiAdmin, (req, res) => {
  db.all(`
    SELECT 
      t.id,
      t.token,
      t.name,
      t.permissions,
      t.scopes,
      t.expires_at,
      t.last_used_at,
      t.created_at,
      u.email as user_email,
      u.name as user_name
    FROM mcp_tokens t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC
  `, (err, tokens) => {
    if (err) {
      console.error('Error fetching MCP tokens:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(tokens);
  });
});

// Create new MCP token (admin only)
app.post('/api/admin/mcp-tokens', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { user_id, name, permissions = 'read_write', scopes = 'steps:read,steps:write,profile:read', expires_days = 30 } = req.body;

  try {
    // Validate inputs
    if (!user_id || !name) {
      return res.status(400).json({ error: 'User ID and name are required' });
    }

    if (!['read_only', 'read_write'].includes(permissions)) {
      return res.status(400).json({ error: 'Invalid permissions. Must be read_only or read_write' });
    }

    const expiresDays = parseInt(expires_days);
    if (isNaN(expiresDays) || expiresDays < 1 || expiresDays > 365) {
      return res.status(400).json({ error: 'Expires days must be between 1 and 365' });
    }

    // Generate token and expiration
    const token = mcpUtils.generateToken(user_id);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    // Validate scopes
    const validScopes = ['steps:read', 'steps:write', 'profile:read', '*'];
    const scopeList = scopes.split(',').map(s => s.trim());
    const invalidScopes = scopeList.filter(scope => !validScopes.includes(scope));
    
    if (invalidScopes.length > 0) {
      return res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${validScopes.join(', ')}` });
    }

    // Insert token
    db.run(`
      INSERT INTO mcp_tokens (token, user_id, name, permissions, scopes, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [token, user_id, name, permissions, scopes, expiresAt.toISOString()], function(err) {
      if (err) {
        console.error('Error creating MCP token:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        message: 'MCP token created successfully',
        token: {
          id: this.lastID,
          token,
          name,
          permissions,
          scopes,
          expires_at: expiresAt.toISOString()
        }
      });
    });

  } catch (error) {
    console.error('MCP token creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Revoke MCP token (admin only)
app.delete('/api/admin/mcp-tokens/:id', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  const tokenId = req.params.id;

  db.run('DELETE FROM mcp_tokens WHERE id = ?', [tokenId], function(err) {
    if (err) {
      console.error('Error revoking MCP token:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json({ message: 'MCP token revoked successfully' });
  });
});

// Get MCP audit log (admin only)
app.get('/api/admin/mcp-audit', adminApiLimiter, requireApiAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  db.all(`
    SELECT 
      a.id,
      a.action,
      a.params,
      a.old_value,
      a.new_value,
      a.was_overwrite,
      a.ip_address,
      a.success,
      a.error_message,
      a.created_at,
      u.email as user_email,
      u.name as user_name,
      t.name as token_name
    FROM mcp_audit_log a
    JOIN users u ON a.user_id = u.id
    JOIN mcp_tokens t ON a.token_id = t.id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset], (err, logs) => {
    if (err) {
      console.error('Error fetching MCP audit log:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Transform data to match frontend expectations
    const transformedLogs = logs.map(log => {
      // Create details string from available data
      let details = '';
      if (log.error_message) {
        details = log.error_message;
      } else if (log.params) {
        try {
          const params = JSON.parse(log.params);
          details = Object.keys(params).map(key => `${key}: ${params[key]}`).join(', ');
        } catch (e) {
          details = log.params;
        }
      } else if (log.was_overwrite) {
        details = 'Overwrite existing data';
      }
      
      return {
        id: log.id,
        timestamp: log.created_at,
        user_name: log.user_name,
        user_email: log.user_email,
        method: log.action,
        status_code: log.success ? 200 : 500,
        params: log.params,
        old_value: log.old_value,
        new_value: log.new_value,
        was_overwrite: log.was_overwrite,
        ip_address: log.ip_address,
        error_message: log.error_message,
        token_name: log.token_name,
        details: details || '-'
      };
    });

    // Get total count for pagination
    db.get('SELECT COUNT(*) as total FROM mcp_audit_log', (err, countResult) => {
      if (err) {
        console.error('Error getting audit log count:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({
        logs: transformedLogs,
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      });
    });
  });
});

// Admin routes

// Get all users (admin only)
app.get('/api/admin/users', adminApiLimiter, requireApiAdmin, (req, res) => {
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
app.put('/api/admin/users/:userId/team', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
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
app.get('/api/teams', apiLimiter, requireApiAuth, (req, res) => {
  db.all(`SELECT id, name FROM teams ORDER BY name`, (err, rows) => {
    if (err) {
      console.error('Error fetching teams:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create new team
app.post('/api/admin/teams', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
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
app.put('/api/admin/teams/:teamId', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { teamId } = req.params;
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Team name is required' });
  }
  
  // First, get the old team name before updating
  db.get(
    `SELECT name FROM teams WHERE id = ?`,
    [teamId],
    (err, oldTeam) => {
      if (err) {
        console.error('Error fetching old team name:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!oldTeam) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      // Update the team name
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
            `UPDATE users SET team = ? WHERE team = ?`,
            [name.trim(), oldTeam.name],
            (err) => {
              if (err) {
                console.error('Error updating user teams:', err);
                return res.status(500).json({ error: 'Failed to update user team assignments' });
              }
              console.log(`✅ Updated user team assignments from "${oldTeam.name}" to "${name.trim()}"`);
            }
          );
          
          res.json({ message: 'Team updated successfully' });
        }
      );
    }
  );
});

// Delete team (soft delete by setting inactive)
app.delete('/api/admin/teams/:teamId', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
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

// Delete user (admin only)
app.delete('/api/admin/users/:userId', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  const { userId } = req.params;
  
  // First, delete all user's steps
  db.run(
    `DELETE FROM steps WHERE user_id = ?`,
    [userId],
    (err) => {
      if (err) {
        console.error('Error deleting user steps:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Then delete the user
      db.run(
        `DELETE FROM users WHERE id = ?`,
        [userId],
        function(err) {
          if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
          }
          
          res.json({ message: 'User deleted successfully' });
        }
      );
    }
  );
});

// Clear user steps (admin only) - removes all step data for a user without deleting the user account
app.delete('/api/admin/users/:userId/steps', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  const { userId } = req.params;
  
  // First verify the user exists
  db.get(
    `SELECT name FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err) {
        console.error('Error checking user existence:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Delete all user's steps but keep the user account
      db.run(
        `DELETE FROM steps WHERE user_id = ?`,
        [userId],
        function(err) {
          if (err) {
            console.error('Error clearing user steps:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json({ 
            message: `All step data cleared for user "${user.name}"`,
            stepsCleared: this.changes
          });
        }
      );
    }
  );
});

// Generate magic link for user (admin only) - Enhanced security version
app.post('/api/admin/generate-magic-link', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, async (req, res) => {
  const { userId, confirmed } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // Security enhancement: Require explicit confirmation
  if (!confirmed) {
    return res.status(400).json({ 
      error: 'Admin confirmation required',
      requiresConfirmation: true,
      message: 'This action will generate a temporary login link that bypasses normal email authentication. Are you sure you want to proceed?'
    });
  }
  
  try {
    // Get user details and admin details for audit logging
    const userPromise = new Promise((resolve, reject) => {
      db.get(`SELECT id, email, name FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
    
    const adminPromise = new Promise((resolve, reject) => {
      db.get(`SELECT id, email, name FROM users WHERE id = ?`, [req.session.userId], (err, admin) => {
        if (err) reject(err);
        else resolve(admin);
      });
    });
    
    const [user, admin] = await Promise.all([userPromise, adminPromise]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!admin) {
      return res.status(500).json({ error: 'Admin session error' });
    }
    
    // Generate secure token
    const token = generateSecureToken();
    const hashedToken = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    // Store hashed token in database (security enhancement)
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
        [hashedToken, user.email, expiresAt.toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Enhanced audit logging with full context
    const auditData = {
      action: 'admin_magic_link_generated',
      admin_id: admin.id,
      admin_email: admin.email,
      admin_name: admin.name,
      target_user_id: user.id,
      target_user_email: user.email,
      target_user_name: user.name,
      token_expires_at: expiresAt.toISOString(),
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      session_id: req.sessionID,
      timestamp: new Date().toISOString()
    };
    
    console.log('🔐 ADMIN ACTION - Magic Link Generated:', JSON.stringify(auditData, null, 2));
    
    // Create magic link
    const magicLink = `${req.protocol}://${req.get('host')}/auth/login?token=${token}`;
    
    // Enhanced response with security information
    res.json({
      success: true,
      magicLink: magicLink,
      maskedToken: `****-****-****-${token.slice(-12)}`, // Show only last 12 chars for UI display
      expiresAt: expiresAt.toISOString(),
      expiresAtLocal: expiresAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' Pacific',
      targetUser: {
        name: user.name,
        email: user.email
      },
      securityNotice: 'This link provides direct access to the user account. Handle with care and inform the user.',
      auditLogged: true
    });
    
  } catch (error) {
    console.error('Error generating admin magic link:', error);
    res.status(500).json({ error: 'Database error' });
  }
});


// Export all step data as CSV (admin only)
app.get('/api/admin/export-csv', adminApiLimiter, requireApiAdmin, (req, res) => {
  db.all(`
    SELECT 
      u.name as user_name,
      u.email as user_email,
      COALESCE(u.team, 'No Team') as team_name,
      s.date,
      s.count as step_count,
      s.created_at,
      s.updated_at
    FROM users u
    LEFT JOIN steps s ON u.id = s.user_id
    ORDER BY u.name ASC, s.date DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching export data:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Generate CSV content
    const csvHeader = 'User Name,User Email,Team,Date,Steps,Created At,Updated At\n';
    const csvRows = rows.map(row => {
      // Escape any commas or quotes in the data
      const escapeCsvField = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      
      return [
        escapeCsvField(row.user_name),
        escapeCsvField(row.user_email),
        escapeCsvField(row.team_name),
        escapeCsvField(row.date),
        escapeCsvField(row.step_count),
        escapeCsvField(row.created_at),
        escapeCsvField(row.updated_at)
      ].join(',');
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    // Set headers for CSV download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="step-challenge-export-${timestamp}.csv"`);
    
    res.send(csvContent);
  });
});

// Challenge-aware team leaderboard
app.get('/api/team-leaderboard', apiLimiter, requireApiAuth, async (req, res) => {
  try {
    const activeChallenge = await getActiveChallenge();
    
    // If no active challenge, return all-time team rankings
    if (!activeChallenge) {
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
          console.error('Error fetching all-time team leaderboard:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({
          type: 'all_time',
          challenge_active: false,
          data: rows,
          message: 'All-time team rankings (no active challenge)'
        });
      });
      return;
    }

    // Challenge is active - return team rankings with per-team filtering
    const currentDay = getCurrentChallengeDay(activeChallenge);
    const participantCount = await getChallengeParticipantCount(activeChallenge.id);
    try {
      const teamLeaderboardData = await getTeamLeaderboardWithRates(
        activeChallenge.id, 
        currentDay, 
        activeChallenge.reporting_threshold
      );
      
      res.json({
        type: 'challenge',
        challenge_active: true,
        data: {
          ranked: teamLeaderboardData.ranked,
          unranked: teamLeaderboardData.unranked
        },
        meta: {
          challenge_name: activeChallenge.name,
          challenge_day: currentDay,
          total_days: getTotalChallengeDays(activeChallenge),
          participant_count: participantCount,
          ranked_count: teamLeaderboardData.ranked.length,
          unranked_count: teamLeaderboardData.unranked.length,
          personal_threshold: activeChallenge.reporting_threshold
        }
      });
    } catch (leaderboardError) {
      console.error('Error getting team leaderboard with rates:', leaderboardError);
      return res.status(500).json({ error: 'Database error' });
    }

  } catch (error) {
    console.error('Team leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load team leaderboard' });
  }
});

// Theme management endpoints (admin only)
app.post('/api/admin/theme', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { theme } = req.body;
  
  if (!theme) {
    return res.status(400).json({ error: 'Theme is required' });
  }
  
  const validThemes = ['default', 'sunset', 'forest', 'lavender', 'monochrome'];
  if (!validThemes.includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme' });
  }
  
  // Store theme in database or file system
  // For now, we'll just return success - the theme is managed client-side
  res.json({ message: 'Theme updated successfully', theme: theme });
});

app.get('/api/admin/theme', adminApiLimiter, requireApiAdmin, (req, res) => {
  // For now, return default theme - in production this would be stored
  res.json({ theme: 'default' });
});

// Get confetti threshold settings
app.get('/api/admin/confetti-thresholds', adminApiLimiter, requireApiAdmin, (req, res) => {
  db.all(`SELECT key, value FROM settings WHERE key IN ('confetti_regular_threshold', 'confetti_epic_threshold')`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching confetti thresholds:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
    
    // Convert to object format
    const thresholds = {};
    rows.forEach(row => {
      if (row.key === 'confetti_regular_threshold') {
        thresholds.regular = parseInt(row.value);
      } else if (row.key === 'confetti_epic_threshold') {
        thresholds.epic = parseInt(row.value);
      }
    });
    
    // Set defaults if not found
    if (!thresholds.regular) thresholds.regular = 15000;
    if (!thresholds.epic) thresholds.epic = 20000;
    
    res.json(thresholds);
  });
});

// Update confetti threshold settings
app.post('/api/admin/confetti-thresholds', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { regular, epic } = req.body;
  
  // Validate input
  if (!regular || !epic || isNaN(regular) || isNaN(epic)) {
    return res.status(400).json({ error: 'Both regular and epic thresholds must be valid numbers' });
  }
  
  const regularThreshold = parseInt(regular);
  const epicThreshold = parseInt(epic);
  
  if (regularThreshold < 1000 || regularThreshold > 50000 || epicThreshold < 1000 || epicThreshold > 50000) {
    return res.status(400).json({ error: 'Thresholds must be between 1,000 and 50,000 steps' });
  }
  
  if (epicThreshold <= regularThreshold) {
    return res.status(400).json({ error: 'Epic threshold must be greater than regular threshold' });
  }
  
  // Update both settings in a transaction
  db.serialize(() => {
    db.run(`INSERT OR REPLACE INTO settings (key, value, description, updated_at) VALUES 
      ('confetti_regular_threshold', ?, 'Step count threshold for regular confetti celebration', CURRENT_TIMESTAMP)`, 
      [regularThreshold.toString()]);
    
    db.run(`INSERT OR REPLACE INTO settings (key, value, description, updated_at) VALUES 
      ('confetti_epic_threshold', ?, 'Step count threshold for epic/mega confetti celebration', CURRENT_TIMESTAMP)`, 
      [epicThreshold.toString()], (err) => {
      if (err) {
        console.error('Error updating confetti thresholds:', err);
        return res.status(500).json({ error: 'Failed to update settings' });
      }
      
      console.log(`✅ Admin ${req.session.email || req.session.userId || 'unknown'} updated confetti thresholds: regular=${regularThreshold}, epic=${epicThreshold}`);
      res.json({ success: true, regular: regularThreshold, epic: epicThreshold });
    });
  });
});

// Get confetti thresholds for dashboard (public API)
app.get('/api/confetti-thresholds', apiLimiter, (req, res) => {
  db.all(`SELECT key, value FROM settings WHERE key IN ('confetti_regular_threshold', 'confetti_epic_threshold')`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching confetti thresholds:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
    
    // Convert to object format
    const thresholds = {};
    rows.forEach(row => {
      if (row.key === 'confetti_regular_threshold') {
        thresholds.regular = parseInt(row.value);
      } else if (row.key === 'confetti_epic_threshold') {
        thresholds.epic = parseInt(row.value);
      }
    });
    
    // Set defaults if not found
    if (!thresholds.regular) thresholds.regular = 15000;
    if (!thresholds.epic) thresholds.epic = 20000;
    
    res.json(thresholds);
  });
});

// Get team members for disclosure (new endpoint)
app.get('/api/teams/:teamName/members', apiLimiter, requireApiAuth, async (req, res) => {
  try {
    const { teamName } = req.params;
    const activeChallenge = await getActiveChallenge();
    
    if (!activeChallenge) {
      // All-time team members
      db.all(`
        SELECT 
          u.name,
          COALESCE(SUM(s.count), 0) as total_steps,
          COALESCE(AVG(s.count), 0) as avg_steps_per_day,
          COUNT(s.id) as days_logged,
          CASE 
            WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id)
            ELSE 0 
          END as steps_per_day_reported
        FROM users u
        LEFT JOIN steps s ON u.id = s.user_id
        WHERE u.team = ?
        GROUP BY u.id
        ORDER BY steps_per_day_reported DESC, u.name ASC
      `, [teamName], (err, rows) => {
        if (err) {
          console.error('Error fetching team members:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
      });
      return;
    }

    // Challenge-specific team members
    const currentDay = getCurrentChallengeDay(activeChallenge);
    
    db.all(`
      SELECT 
        u.name,
        COALESCE(SUM(s.count), 0) as total_steps,
        COUNT(s.id) as days_logged,
        CASE 
          WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.count), 0) / COUNT(s.id)
          ELSE 0 
        END as steps_per_day_reported,
        CASE 
          WHEN ? > 0 THEN ROUND((COUNT(s.id) * 100.0) / ?, 2)
          ELSE 0
        END as personal_reporting_rate
      FROM users u
      LEFT JOIN steps s ON u.id = s.user_id AND s.challenge_id = ?
      WHERE u.team = ?
      GROUP BY u.id
      ORDER BY steps_per_day_reported DESC, u.name ASC
    `, [currentDay, currentDay, activeChallenge.id, teamName], (err, rows) => {
      if (err) {
        console.error('Error fetching team members:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });

  } catch (error) {
    console.error('Team members API error:', error);
    res.status(500).json({ error: 'Failed to load team members' });
  }
});

// Get all challenges (admin only)
app.get('/api/admin/challenges', requireApiAdmin, (req, res) => {
  db.all(`SELECT * FROM challenges ORDER BY created_at DESC`, (err, rows) => {
    if (err) {
      console.error('Error fetching challenges:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create new challenge (admin only)
app.post('/api/admin/challenges', requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { name, start_date, end_date, reporting_threshold } = req.body;
  
  if (!name || !start_date || !end_date || reporting_threshold === undefined) {
    return res.status(400).json({ error: 'Name, start date, end date, and reporting threshold are required' });
  }
  
  if (reporting_threshold < 1 || reporting_threshold > 100) {
    return res.status(400).json({ error: 'Reporting threshold must be between 1 and 100' });
  }
  
  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  
  // Validate that start_date is before end_date
  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ error: 'Start date must be before end date' });
  }
  
  // Check for existing challenge with same name
  db.get(`SELECT id FROM challenges WHERE name = ?`, [name.trim()], (checkErr, existingChallenge) => {
    if (checkErr) {
      console.error('Error checking existing challenge:', checkErr);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (existingChallenge) {
      return res.status(400).json({ error: 'A challenge with this name already exists' });
    }
    
    db.run(
      `INSERT INTO challenges (name, start_date, end_date, reporting_threshold, is_active) VALUES (?, ?, ?, ?, 0)`,
      [name.trim(), start_date, end_date, reporting_threshold],
      function(err) {
        if (err) {
          console.error('Error creating challenge:', err);
          console.error('SQL Error details:', err.message);
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json({ 
          id: this.lastID, 
          name: name.trim(),
          start_date,
          end_date,
          reporting_threshold,
          is_active: 0,
          message: 'Challenge created successfully' 
        });
      }
    );
  });
});

// Update challenge (admin only)
app.put('/api/admin/challenges/:challengeId', requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { challengeId } = req.params;
  const { name, start_date, end_date, reporting_threshold, is_active } = req.body;
  
  if (!name || !start_date || !end_date || reporting_threshold === undefined) {
    return res.status(400).json({ error: 'Name, start date, end date, and reporting threshold are required' });
  }
  
  if (reporting_threshold < 1 || reporting_threshold > 100) {
    return res.status(400).json({ error: 'Reporting threshold must be between 1 and 100' });
  }
  
  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  
  // Validate that start_date is before end_date
  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ error: 'Start date must be before end date' });
  }
  
  // If setting this challenge as active, deactivate all others first
  if (is_active) {
    db.run(`UPDATE challenges SET is_active = 0`, (err) => {
      if (err) {
        console.error('Error deactivating challenges:', err);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  }
  
  db.run(
    `UPDATE challenges SET name = ?, start_date = ?, end_date = ?, reporting_threshold = ?, is_active = ? WHERE id = ?`,
    [name.trim(), start_date, end_date, reporting_threshold, is_active ? 1 : 0, challengeId],
    function(err) {
      if (err) {
        console.error('Error updating challenge:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      res.json({ message: 'Challenge updated successfully' });
    }
  );
});

// Delete challenge (admin only)
app.delete('/api/admin/challenges/:challengeId', requireApiAdmin, validateCSRFToken, (req, res) => {
  const { challengeId } = req.params;
  
  db.run(
    `DELETE FROM challenges WHERE id = ?`,
    [challengeId],
    function(err) {
      if (err) {
        console.error('Error deleting challenge:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      res.json({ message: 'Challenge deleted successfully' });
    }
  );
});

// Admin dashboard
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Redirect admin.html to protected route
app.get('/admin.html', requireAdmin, (req, res) => {
  res.redirect('/admin');
});

// MCP Setup page (authenticated users)
app.get('/mcp-setup', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'mcp-setup.html'));
});

// Database cleanup job for expired tokens (runs every hour in production)
function cleanupExpiredTokens() {
  db.run(
    `DELETE FROM auth_tokens WHERE expires_at < datetime('now') OR used = 1`,
    (err) => {
      if (err) {
        console.error('Error cleaning up expired tokens:', err);
      } else {
        devLog('Cleaned up expired authentication tokens');
      }
    }
  );
}

// Run cleanup on startup and then every hour
cleanupExpiredTokens();
if (isProduction) {
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // Every hour
}

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const message = isProduction ? 'Internal server error' : err.message;
  const stack = isProduction ? undefined : err.stack;
  
  res.status(err.status || 500).json({
    error: message,
    ...(stack && { stack })
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handlers for process stability
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Log to external service if available (placeholder for future enhancement)
  // logToExternalService('uncaughtException', error);
  
  // Attempt graceful shutdown
  console.log('Attempting graceful shutdown due to uncaught exception...');
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed due to uncaught exception');
      if (db) {
        db.close(() => {
          console.log('Database closed due to uncaught exception');
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    });
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise);
  console.error('🚨 Reason:', reason);
  console.error('🚨 Timestamp:', new Date().toISOString());
  
  // For unhandled rejections, log but don't exit immediately
  // This allows the application to continue running for other requests
  console.warn('Application continuing after unhandled rejection - monitor for stability');
  
  // Log to external service if available (placeholder for future enhancement)  
  // logToExternalService('unhandledRejection', { reason, promise });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});

// Start server (only if not being imported for testing)
let server;
if (require.main === module) {
  const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
  server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Step Challenge App server running on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (isDevelopment) {
      console.log(`🔧 Admin panel available at: http://localhost:${PORT}/admin`);
      console.log(`❤️  Health check at: http://localhost:${PORT}/health`);
    }
  });
}

// Add cleanup method for testing
app.close = (callback) => {
  if (db && db.open) {
    db.close((err) => {
      if (err) {
        console.log('Test cleanup - Error closing database:', err);
      }
      if (callback) callback();
    });
  } else if (callback) {
    callback();
  }
};

// Add database reinitialization for testing
app.reinitializeDatabase = async () => {
  if (process.env.NODE_ENV === 'test') {
    // Close existing connection if it exists
    if (db && db.open) {
      await new Promise((resolve) => {
        db.close((err) => {
          if (err) {
            console.warn('Warning closing database during reinit:', err.message);
          }
          resolve();
        });
      });
    }
    
    // Clear the database module from require cache
    const dbPath = require.resolve('./database');
    delete require.cache[dbPath];
    
    // Re-require the database module with new DB_PATH
    db = require('./database');
  }
};

// Export for testing
module.exports = app;