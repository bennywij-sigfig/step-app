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
// Configure session store - avoid SQLite for unit tests to prevent hanging
let sessionStore;
if (process.env.NODE_ENV === 'test' && !process.env.DB_PATH) {
  // Use memory store for unit tests that don't need database persistence
  sessionStore = new session.MemoryStore();
} else {
  // Use SQLite store for integration tests and production
  sessionStore = new SQLiteStore({
    db: 'sessions.db',
    dir: process.env.NODE_ENV === 'production' ? '/data' : '.',
    table: 'sessions'
  });
}

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
async function getActiveChallenge(dbConnection = null) {
  return new Promise((resolve, reject) => {
    // Use provided connection or get active connection for test environment
    const activeDb = dbConnection || (process.env.NODE_ENV === 'test' && process.env.DB_PATH ? 
      getActiveDbConnection().db : db);
    
    activeDb.get(`SELECT * FROM challenges WHERE is_active = 1 LIMIT 1`, (err, challenge) => {
      if (err) {
        console.error('Error fetching active challenge:', err);
        return reject(err);
      }
      resolve(challenge || null);
    });
  });
}

// Get participant count for a challenge
async function getChallengeParticipantCount(challengeId, dbConnection = null) {
  return new Promise((resolve, reject) => {
    // Use provided connection or get active connection for test environment
    const activeDb = dbConnection || (process.env.NODE_ENV === 'test' && process.env.DB_PATH ? 
      getActiveDbConnection().db : db);
    
    activeDb.get(
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
        u.id,
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
      WHERE u.archived_at IS NULL AND u.id IN (SELECT DISTINCT user_id FROM steps WHERE challenge_id = ?)
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
      WHERE u.archived_at IS NULL AND u.team IS NOT NULL AND u.team != ''
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
  
  const token = req.body?.csrfToken || req.headers?.['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;
  
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

// Shadow Pig Game (protected, separate from main app)
app.get('/pig', requireAuth, (req, res) => {
  devLog('Pig game accessed by user:', req.session.userId);
  res.sendFile(path.join(__dirname, 'views', 'pig.html'));
});

// Mount shadow game API (completely separate from main app)
const shadowApi = require('./shadow-api');
app.use('/api/shadow', shadowApi);


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

/**
 * Get active database connection for the current environment
 * In test mode, creates fresh connection to avoid closed connection issues
 */
function getActiveDbConnection() {
  if (process.env.NODE_ENV === 'test' && process.env.DB_PATH) {
    const sqlite3 = require('sqlite3').verbose();
    const activeDb = new sqlite3.Database(process.env.DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    activeDb.configure('busyTimeout', 5000);
    activeDb.run('PRAGMA journal_mode = MEMORY');
    activeDb.run('PRAGMA synchronous = OFF');
    return { db: activeDb, shouldClose: true };
  }
  return { db: db, shouldClose: false };
}

// Development-only: Get magic link directly (localhost only)
if (isDevelopment) {
  app.post('/dev/get-magic-link', magicLinkLimiter, async (req, res) => {
    const { email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);
    
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    try {
      // Get appropriate database connection for current environment
      const { db: activeDb, shouldClose } = getActiveDbConnection();
      
      if (!shouldClose) {
        // Wait for database initialization to complete before proceeding (production/development)
        await db.ready;
      }
      
      const token = generateSecureToken();
      const hashedToken = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      // Ensure auth_tokens table exists before trying to insert
      await new Promise((resolve, reject) => {
        activeDb.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
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
      
      // Store hashed token in database
      await new Promise((resolve, reject) => {
        activeDb.run(
          `INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
          [hashedToken, email, expiresAt.toISOString()],
          (err) => {
            // Close test database connection if we created one
            if (shouldClose) {
              activeDb.close();
            }
            
            if (err) {
              console.error('Error inserting auth token:', err);
              return reject(err);
            }
            resolve();
          }
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
    // Get appropriate database connection for current environment
    const { db: activeDb, shouldClose } = getActiveDbConnection();
    
    // Verify token (hash before comparison for security)
    const hashedToken = hashToken(token);
    activeDb.get(
      `SELECT * FROM auth_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')`,
      [hashedToken],
      (err, row) => {
        if (err) {
          console.error('Token verification error:', err);
          if (shouldClose) activeDb.close();
          return res.status(500).send('Database error');
        }
        
        if (!row) {
          devLog('Token not found, used, or expired');
          if (shouldClose) activeDb.close();
          return res.status(400).send('Invalid or expired login link');
        }

        devLog('Valid token found for email:', row.email);
        const normalizedEmail = normalizeEmail(row.email);
        
        // Mark token as used
        activeDb.run(`UPDATE auth_tokens SET used = 1 WHERE token = ?`, [hashedToken]);

        // Create or get user and set session
        activeDb.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail], (err, user) => {
          if (err) {
            console.error('User lookup error:', err);
            if (shouldClose) activeDb.close();
            return res.status(500).send('Database error');
          }

          if (!user) {
            devLog('Creating new user for:', normalizedEmail);
            // Create new user
            const sanitizedName = sanitizeInput(normalizedEmail.split('@')[0]);
            activeDb.run(
              `INSERT INTO users (email, name) VALUES (?, ?)`,
              [normalizedEmail, sanitizedName],
              function(err) {
                if (err) {
                  console.error('User creation error:', err);
                  if (shouldClose) activeDb.close();
                  return res.status(500).send('Database error');
                }
                
                devLog('New user created with ID:', this.lastID);
                
                // Close database connection before session operations
                if (shouldClose) activeDb.close();
                
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
          
          // Close database connection before session operations
          if (shouldClose) activeDb.close();
          
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

// API endpoint to get daily steps for a specific user (individual leaderboard disclosure)
app.get('/api/user/:userId/daily-steps', apiLimiter, requireApiAuth, (req, res) => {
  const requestedUserId = req.params.userId;
  
  // Validate userId parameter
  if (!requestedUserId || isNaN(requestedUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  // First verify the requested user exists and is not archived
  db.get(
    'SELECT id, name, archived_at FROM users WHERE id = ?',
    [requestedUserId],
    (err, user) => {
      if (err) {
        console.error('Error checking user for daily steps:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (user.archived_at) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get the user's daily step data
      db.all(
        `SELECT 
           date,
           count as steps,
           strftime('%w', date) as day_of_week,
           strftime('%m/%d', date) as display_date
         FROM steps 
         WHERE user_id = ? 
         ORDER BY date DESC 
         LIMIT 45`,
        [requestedUserId],
        (err, stepData) => {
          if (err) {
            console.error('Error fetching user daily steps:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Process step data to add formatted_date and calculate total_days
          const processedStepData = (stepData || []).map(day => ({
            ...day,
            formatted_date: day.display_date  // Add the expected field name
          }));
          
          // Format the response
          res.json({
            user: {
              id: user.id,
              name: user.name
            },
            daily_steps: processedStepData,
            total_days: processedStepData.length
          });
        }
      );
    }
  );
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

// Download user's own step data as CSV (protected - only own steps)
app.get('/api/steps/csv', apiLimiter, requireApiAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Get user info and their step data
  db.get('SELECT name, email FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error fetching user for CSV:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's step data
    db.all(
      `SELECT date, count, created_at, updated_at FROM steps 
       WHERE user_id = ? 
       ORDER BY date DESC`,
      [userId],
      (err, stepData) => {
        if (err) {
          console.error('Error fetching user steps for CSV:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        // Generate CSV content
        const csvHeader = 'Date,Steps,Created At,Updated At\n';
        const csvRows = stepData.map(row => {
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
            escapeCsvField(row.date),
            escapeCsvField(row.count),
            escapeCsvField(row.created_at),
            escapeCsvField(row.updated_at)
          ].join(',');
        }).join('\n');
        
        const csvContent = csvHeader + csvRows;
        
        // Set headers for CSV download
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `my_step_data_${timestamp}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        res.send(csvContent);
      }
    );
  });
});

// Add/update steps (protected - only own steps)
app.post('/api/steps', apiLimiter, requireApiAuth, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { date, count } = req.body;
  const userId = req.session.userId;
  
  // First check if user is archived
  db.get('SELECT archived_at FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error checking user archive status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (user && user.archived_at !== null) {
      return res.status(403).json({ 
        error: 'Your account is archived. You cannot add steps. Contact admin to restore access.',
        archived: true,
        archived_at: user.archived_at
      });
    }
    
    // Continue with step input processing
    processStepInput();
  });
  
  function processStepInput() {
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
  } // End processStepInput function
});

// Challenge-aware individual leaderboard
app.get('/api/leaderboard', apiLimiter, requireApiAuth, async (req, res) => {
  try {
    // Get appropriate database connection for current environment
    const { db: activeDb, shouldClose } = getActiveDbConnection();
    
    const activeChallenge = await getActiveChallenge(activeDb);
    
    // If no active challenge, return all-time rankings
    if (!activeChallenge) {
      activeDb.all(`
        SELECT 
          u.id,
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
        WHERE u.archived_at IS NULL
        GROUP BY u.id
        ORDER BY steps_per_day_reported DESC
      `, (err, rows) => {
        // Close database connection if we created one
        if (shouldClose) activeDb.close();
        
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
    const participantCount = await getChallengeParticipantCount(activeChallenge.id, activeDb);
    try {
      const leaderboardData = await getIndividualLeaderboardWithRates(
        activeChallenge.id, 
        currentDay, 
        activeChallenge.reporting_threshold
      );
      
      // Close database connection if we created one
      if (shouldClose) activeDb.close();
      
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
      // Close database connection if we created one
      if (shouldClose) activeDb.close();
      return res.status(500).json({ error: 'Database error' });
    }

  } catch (error) {
    console.error('Leaderboard error:', error);
    // Close database connection if we created one (error in active challenge lookup)
    if (typeof shouldClose !== 'undefined' && shouldClose) activeDb.close();
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
      u.archived_at,
      COALESCE(SUM(s.count), 0) as total_steps,
      COUNT(s.id) as days_logged
    FROM users u
    LEFT JOIN steps s ON u.id = s.user_id
    GROUP BY u.id
    ORDER BY u.archived_at ASC, u.name ASC
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

// Archive user (admin only)
app.post('/api/admin/users/:userId/archive', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  const { userId } = req.params;
  
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid user ID required' });
  }

  // First check if user exists and if they're an admin
  db.get('SELECT id, name, email, is_admin FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error checking user for archive:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent archiving admin users
    if (user.is_admin) {
      return res.status(400).json({ error: 'Cannot archive admin users' });
    }

    // Archive the user
    db.run(
      'UPDATE users SET archived_at = datetime("now") WHERE id = ?',
      [userId],
      function(err) {
        if (err) {
          console.error('Error archiving user:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        console.log(`Admin archived user: ${user.name} (${user.email})`);
        res.json({ 
          message: `User "${user.name}" has been archived successfully`,
          archived_user: {
            id: user.id,
            name: user.name,
            email: user.email
          }
        });
      }
    );
  });
});

// Unarchive user (admin only)
app.post('/api/admin/users/:userId/unarchive', adminApiLimiter, requireApiAdmin, validateCSRFToken, (req, res) => {
  const { userId } = req.params;
  
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid user ID required' });
  }

  // First check if user exists
  db.get('SELECT id, name, email, archived_at FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Error checking user for unarchive:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.archived_at) {
      return res.status(400).json({ error: 'User is not archived' });
    }

    // Unarchive the user
    db.run(
      'UPDATE users SET archived_at = NULL WHERE id = ?',
      [userId],
      function(err) {
        if (err) {
          console.error('Error unarchiving user:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        console.log(`Admin unarchived user: ${user.name} (${user.email})`);
        res.json({ 
          message: `User "${user.name}" has been unarchived successfully`,
          unarchived_user: {
            id: user.id,
            name: user.name,
            email: user.email
          }
        });
      }
    );
  });
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
    // Get appropriate database connection for current environment
    const { db: activeDb, shouldClose } = getActiveDbConnection();
    
    const activeChallenge = await getActiveChallenge(activeDb);
    
    // If no active challenge, return all-time team rankings
    if (!activeChallenge) {
      activeDb.all(`
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
        WHERE u.archived_at IS NULL AND u.team IS NOT NULL AND u.team != ''
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

// Update fun setting
app.post('/api/admin/fun-setting', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { allowFun } = req.body;
  
  if (typeof allowFun !== 'boolean') {
    return res.status(400).json({ error: 'allowFun must be a boolean' });
  }
  
  // Store in database settings table
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
    ['allow_fun', allowFun ? 'true' : 'false'], 
    function(err) {
      if (err) {
        console.error('Error updating fun setting:', err);
        return res.status(500).json({ error: 'Failed to update fun setting' });
      }
      
      devLog('Fun setting updated:', allowFun);
      res.json({ success: true, allowFun });
    }
  );
});

// Get fun setting
app.get('/api/admin/fun-setting', adminApiLimiter, requireApiAdmin, (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['allow_fun'], (err, row) => {
    if (err) {
      console.error('Error fetching fun setting:', err);
      return res.status(500).json({ error: 'Failed to fetch fun setting' });
    }
    
    const allowFun = row ? row.value === 'true' : false;
    res.json({ allowFun });
  });
});

// Update pig sprite setting
app.post('/api/admin/pig-sprite-setting', adminApiLimiter, requireApiAdmin, validateCSRFToken, sanitizeUserInput, (req, res) => {
  const { pigStyle } = req.body;
  
  if (!['head-on', 'side'].includes(pigStyle)) {
    return res.status(400).json({ error: 'pigStyle must be either "head-on" or "side"' });
  }
  
  // Store in database settings table
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
    ['pig_style', pigStyle], 
    function(err) {
      if (err) {
        console.error('Error updating pig sprite setting:', err);
        return res.status(500).json({ error: 'Failed to update pig sprite setting' });
      }
      
      devLog('Pig sprite setting updated:', pigStyle);
      res.json({ success: true, pigStyle });
    }
  );
});

// Get pig sprite setting
app.get('/api/admin/pig-sprite-setting', adminApiLimiter, requireApiAdmin, (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['pig_style'], (err, row) => {
    if (err) {
      console.error('Error fetching pig sprite setting:', err);
      return res.status(500).json({ error: 'Failed to fetch pig sprite setting' });
    }
    
    const pigStyle = row ? row.value : 'head-on'; // default to head-on
    res.json({ pigStyle });
  });
});

// Public endpoint to get pig sprite setting (accessible to all users)
app.get('/api/pig-sprite-setting', apiLimiter, (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['pig_style'], (err, row) => {
    if (err) {
      console.error('Error fetching pig sprite setting:', err);
      return res.status(500).json({ error: 'Failed to fetch pig sprite setting' });
    }
    
    const pigStyle = row ? row.value : 'head-on'; // default to head-on
    res.json({ pigStyle });
  });
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
        WHERE u.archived_at IS NULL AND u.team = ?
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
      WHERE u.archived_at IS NULL AND u.team = ?
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

// Archive challenge (admin only) 
app.post('/api/admin/challenges/:challengeId/archive', requireApiAdmin, validateCSRFToken, (req, res) => {
  const { challengeId } = req.params;
  const adminUserId = req.session.userId;
  
  if (!adminUserId) {
    return res.status(401).json({ error: 'Admin user not found in session' });
  }

  // First, get the challenge details
  db.get(`SELECT * FROM challenges WHERE id = ?`, [challengeId], (err, challenge) => {
    if (err) {
      console.error('Error fetching challenge for archive:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    // Check if challenge is already archived
    db.get(`SELECT id FROM challenge_archives WHERE challenge_id = ?`, [challengeId], (archiveCheckErr, existingArchive) => {
      if (archiveCheckErr) {
        console.error('Error checking existing archive:', archiveCheckErr);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (existingArchive) {
        return res.status(400).json({ error: 'Challenge has already been archived' });
      }

      // Count participants for this challenge
      db.get(`
        SELECT COUNT(DISTINCT user_id) as participant_count 
        FROM steps 
        WHERE challenge_id = ?
      `, [challengeId], (countErr, participantResult) => {
        if (countErr) {
          console.error('Error counting participants:', countErr);
          return res.status(500).json({ error: 'Database error' });
        }
        
        const totalParticipants = participantResult ? participantResult.participant_count : 0;
        
        // Create archive record
        db.run(`
          INSERT INTO challenge_archives (
            challenge_id, challenge_name, challenge_start_date, challenge_end_date,
            reporting_threshold, created_by_user_id, total_participants
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [challengeId, challenge.name, challenge.start_date, challenge.end_date, 
            challenge.reporting_threshold, adminUserId, totalParticipants], 
        function(archiveInsertErr) {
          if (archiveInsertErr) {
            console.error('Error creating archive record:', archiveInsertErr);
            return res.status(500).json({ error: 'Failed to create archive' });
          }
          
          const archiveId = this.lastID;
          
          // Now copy all step data for this challenge with user information
          db.all(`
            SELECT s.*, u.name as user_name, u.team as user_team, u.email as user_email,
                   s.updated_at as original_updated_at
            FROM steps s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.challenge_id = ?
            ORDER BY s.user_id, s.date
          `, [challengeId], (stepsFetchErr, stepsData) => {
            if (stepsFetchErr) {
              console.error('Error fetching steps for archive:', stepsFetchErr);
              // Rollback archive creation
              db.run(`DELETE FROM challenge_archives WHERE id = ?`, [archiveId]);
              return res.status(500).json({ error: 'Failed to fetch step data' });
            }
            
            if (stepsData.length === 0) {
              // Archive created but no step data to copy
              console.log(`Archive created for challenge "${challenge.name}" but no step data found`);
              return res.json({ 
                success: true, 
                archiveId,
                message: 'Challenge archived successfully (no step data found)',
                totalParticipants: 0,
                stepsArchived: 0
              });
            }
            
            // Insert step data in batches to avoid overwhelming the database
            const batchSize = 100;
            const batches = [];
            for (let i = 0; i < stepsData.length; i += batchSize) {
              batches.push(stepsData.slice(i, i + batchSize));
            }
            
            let batchesProcessed = 0;
            let totalStepsInserted = 0;
            
            const processBatch = (batch) => {
              return new Promise((resolve, reject) => {
                const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                const values = [];
                
                batch.forEach(step => {
                  values.push(
                    archiveId, step.user_id, step.user_name, step.user_team,
                    step.user_email, step.date, step.count, step.original_updated_at
                  );
                });
                
                db.run(`
                  INSERT INTO challenge_archive_steps (
                    archive_id, user_id, user_name, user_team, 
                    user_email, date, count, original_updated_at
                  ) VALUES ${placeholders}
                `, values, function(batchErr) {
                  if (batchErr) {
                    reject(batchErr);
                  } else {
                    totalStepsInserted += batch.length;
                    resolve();
                  }
                });
              });
            };
            
            // Process all batches
            Promise.all(batches.map(processBatch))
              .then(() => {
                console.log(`✅ Archive created for challenge "${challenge.name}": ${totalStepsInserted} step records archived`);
                res.json({ 
                  success: true, 
                  archiveId,
                  message: 'Challenge archived successfully',
                  totalParticipants,
                  stepsArchived: totalStepsInserted,
                  challengeName: challenge.name
                });
              })
              .catch((batchErr) => {
                console.error('Error inserting step batches:', batchErr);
                // Rollback archive creation
                db.run(`DELETE FROM challenge_archives WHERE id = ?`, [archiveId]);
                res.status(500).json({ error: 'Failed to archive step data' });
              });
          });
        });
      });
    });
  });
});

// Get all challenge archives (admin only)
app.get('/api/admin/archives', requireApiAdmin, (req, res) => {
  db.all(`
    SELECT ca.*, u.name as created_by_name
    FROM challenge_archives ca
    LEFT JOIN users u ON ca.created_by_user_id = u.id
    ORDER BY ca.archive_timestamp DESC
  `, (err, rows) => {
    if (err) {
      console.error('Error fetching archives:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Download archived challenge data as ZIP (admin only)
app.get('/api/admin/archives/:archiveId/download', requireApiAdmin, async (req, res) => {
  const { archiveId } = req.params;
  const archiver = require('archiver');
  const { promisify } = require('util');
  
  try {
    // Get archive details
    const archive = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM challenge_archives WHERE id = ?`, [archiveId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    if (!archive) {
      return res.status(404).json({ error: 'Archive not found' });
    }
    
    // Get archived step data
    const steps = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM challenge_archive_steps 
        WHERE archive_id = ? 
        ORDER BY date, user_name
      `, [archiveId], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    // Create safe filename
    const safeChallengeName = archive.challenge_name.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_');
    const zipFilename = `${safeChallengeName}_Archive.zip`;
    
    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    
    // Create ZIP archive
    const archive_zip = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    // Handle ZIP errors
    archive_zip.on('error', (err) => {
      console.error('Archive creation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });
    
    // Pipe archive to response
    archive_zip.pipe(res);
    
    // 1. Create challenge metadata CSV
    const challengeMetadataCSV = [
      'Field,Value',
      `Challenge Name,"${archive.challenge_name.replace(/"/g, '""')}"`,
      `Start Date,${archive.challenge_start_date}`,
      `End Date,${archive.challenge_end_date}`,
      `Reporting Threshold,${archive.reporting_threshold}%`,
      `Total Participants,${archive.total_participants}`,
      `Total Step Records,${steps.length}`,
      `Archived On,${archive.archive_timestamp}`,
      `Created By User ID,${archive.created_by_user_id}`
    ].join('\n');
    
    archive_zip.append(challengeMetadataCSV, { name: 'challenge_info.csv' });
    
    // 2. Create daily steps CSV
    const stepsCSVHeader = 'Date,User_Name,Team,User_Email,Steps,Original_Update_Time\n';
    const stepsCSVRows = steps.map(step => {
      const escapedName = (step.user_name || '').replace(/"/g, '""');
      const escapedTeam = (step.user_team || '').replace(/"/g, '""');
      const escapedEmail = (step.user_email || '').replace(/"/g, '""');
      const escapedUpdateTime = (step.original_updated_at || '').replace(/"/g, '""');
      
      return `${step.date},"${escapedName}","${escapedTeam}","${escapedEmail}",${step.count},"${escapedUpdateTime}"`;
    });
    
    const stepsCSV = stepsCSVHeader + stepsCSVRows.join('\n');
    archive_zip.append(stepsCSV, { name: 'daily_steps.csv' });
    
    // 3. Create participant summary CSV
    const participantSummary = {};
    steps.forEach(step => {
      const key = step.user_name || 'Unknown';
      if (!participantSummary[key]) {
        participantSummary[key] = {
          user_name: step.user_name,
          team: step.user_team,
          email: step.user_email,
          total_steps: 0,
          days_logged: 0,
          avg_steps_per_day: 0
        };
      }
      participantSummary[key].total_steps += step.count;
      participantSummary[key].days_logged += 1;
    });
    
    // Calculate averages and sort by total steps
    const participantArray = Object.values(participantSummary).map(p => ({
      ...p,
      avg_steps_per_day: p.days_logged > 0 ? Math.round(p.total_steps / p.days_logged) : 0
    })).sort((a, b) => b.total_steps - a.total_steps);
    
    const summaryCSVHeader = 'Rank,User_Name,Team,Email,Total_Steps,Days_Logged,Avg_Steps_Per_Day\n';
    const summaryCSVRows = participantArray.map((p, index) => {
      const escapedName = (p.user_name || '').replace(/"/g, '""');
      const escapedTeam = (p.team || '').replace(/"/g, '""');
      const escapedEmail = (p.email || '').replace(/"/g, '""');
      
      return `${index + 1},"${escapedName}","${escapedTeam}","${escapedEmail}",${p.total_steps},${p.days_logged},${p.avg_steps_per_day}`;
    });
    
    const summaryCSV = summaryCSVHeader + summaryCSVRows.join('\n');
    archive_zip.append(summaryCSV, { name: 'participant_summary.csv' });
    
    // 4. Create README file
    const readme = `Challenge Archive: ${archive.challenge_name}
===============================================

This archive contains complete data for the challenge "${archive.challenge_name}"
Period: ${archive.challenge_start_date} to ${archive.challenge_end_date}
Archived on: ${archive.archive_timestamp}

Files included:
- challenge_info.csv: Challenge metadata and settings
- daily_steps.csv: All step records by user and date during the challenge
- participant_summary.csv: Summary statistics for each participant
- README.txt: This file

Data Notes:
- ${steps.length} step records from ${archive.total_participants} participants
- Reporting threshold was ${archive.reporting_threshold}%
- Data preserved exactly as it was when the challenge was active

Generated by Step Challenge App Archive System
`;
    
    archive_zip.append(readme, { name: 'README.txt' });
    
    // Finalize the archive
    await archive_zip.finalize();
    
    console.log(`✅ Archive download created for challenge "${archive.challenge_name}": ${steps.length} records`);
    
  } catch (error) {
    console.error('Error creating archive download:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive download' });
    }
  }
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