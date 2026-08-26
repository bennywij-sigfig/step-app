const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Skip rate limiting entirely for tests when DISABLE_RATE_LIMITING is set
const skipRateLimit = process.env.DISABLE_RATE_LIMITING === 'true' || process.env.NODE_ENV === 'test';

const magicLinkLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.MAGIC_LINK_LIMIT_MAX) || 50, // increased from 10 to 50 per hour per IP
  message: {
    error: 'Too many login requests from this IP, please try again in an hour.',
    retryAfter: 3600
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use default IP key generator which handles IPv6 properly
  handler: (req, res) => {
    console.log(`Rate limit exceeded for magic link request from IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many login requests from this IP, please try again in an hour.',
      retryAfter: 3600
    });
  }
});

const apiLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.API_LIMIT_MAX) || 300, // increased from 100 to 300 per hour per session
  message: {
    error: 'Too many API requests, please try again in an hour.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use session-based key generator for authenticated users, IP-based for anonymous
  keyGenerator: (req) => {
    return req.session?.userId ? `api_user_${req.session.userId}` : `api_ip_${ipKeyGenerator(req)}`;
  },
  handler: (req, res) => {
    console.log(`API rate limit exceeded for user: ${req.session?.userId || 'anonymous'} from IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many API requests, please try again in an hour.',
      retryAfter: 3600
    });
  }
});

// Chat has a separate, lower ceiling because each request may incur model cost.
const chatApiLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.CHAT_API_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId
    ? `chat_user_${req.session.userId}`
    : `chat_ip_${ipKeyGenerator(req)}`,
  handler: (req, res) => res.status(429).json({
    error: 'Chat limit reached. Please try again later.',
    retryAfter: 3600
  })
});

// Global submission budgets bound aggregate spend even if most read requests
// use both interpretation and voice calls. Confirmations do not use these budgets.
const chatGlobalHourlyLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.CHAT_GLOBAL_HOURLY_LIMIT_MAX, 10) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'chat_global_hourly',
  handler: (req, res) => res.status(429).json({
    error: 'Trotter is taking a short budget break. Please try again later.',
    retryAfter: 3600
  })
});

const chatGlobalDailyLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: parseInt(process.env.CHAT_GLOBAL_DAILY_LIMIT_MAX, 10) || 2500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'chat_global_daily',
  handler: (req, res) => res.status(429).json({
    error: 'Trotter reached today’s shared usage budget. It will be back after the reset.',
    retryAfter: 86400
  })
});

const chatImageLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.CHAT_IMAGE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `chat_image_user_${req.session.userId}`,
  handler: (req, res) => res.status(429).json({
    error: 'Trotter has inspected enough images for the moment. Please try again later.',
    retryAfter: 3600
  })
});

const chatImageGlobalLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.CHAT_IMAGE_GLOBAL_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'chat_image_global',
  handler: (req, res) => res.status(429).json({
    error: 'Trotter’s shared image budget is resting. Please try again later.',
    retryAfter: 3600
  })
});

const adminApiLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.ADMIN_API_LIMIT_MAX) || 400, // increased from 200 to 400 per hour per session
  message: {
    error: 'Too many admin API requests, please try again in an hour.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use session-based key generator for authenticated users, IP-based for anonymous
  keyGenerator: (req) => {
    return req.session?.userId ? `admin_user_${req.session.userId}` : `admin_ip_${ipKeyGenerator(req)}`;
  },
  handler: (req, res) => {
    console.log(`Admin API rate limit exceeded for user: ${req.session?.userId || 'anonymous'} from IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many admin API requests, please try again in an hour.',
      retryAfter: 3600
    });
  }
});

// MCP API rate limiter - token-based (hourly limit)
const mcpApiLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.MCP_API_LIMIT_MAX) || 300, // increased from 60 to 300 per hour per token
  message: {
    error: 'Too many MCP API requests, please try again in an hour.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use token-based key generator
  keyGenerator: (req) => {
    const token = req.body?.params?.token || req.query?.token || 'anonymous';
    return `mcp_hourly_${token}`;
  },
  handler: (req, res) => {
    const token = req.body?.params?.token || req.query?.token || 'unknown';
    console.log(`MCP API hourly rate limit exceeded for token: ${token.substring(0, 10)}... from IP: ${req.ip}`);
    res.status(429).json({
      jsonrpc: '2.0',
      error: {
        code: -32004,
        message: 'Rate limit exceeded',
        data: 'Too many MCP API requests, please try again in an hour.'
      },
      id: req.body?.id || null
    });
  }
});

// MCP API burst rate limiter - protect against rapid fire requests
const mcpBurstLimiter = skipRateLimit ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.MCP_BURST_LIMIT_MAX) || 75, // increased from 15 to 75 per minute per token
  message: {
    error: 'Too many rapid MCP API requests, please slow down.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use token-based key generator
  keyGenerator: (req) => {
    const token = req.body?.params?.token || req.query?.token || 'anonymous';
    return `mcp_burst_${token}`;
  },
  handler: (req, res) => {
    const token = req.body?.params?.token || req.query?.token || 'unknown';
    console.log(`MCP API burst rate limit exceeded for token: ${token.substring(0, 10)}... from IP: ${req.ip}`);
    res.status(429).json({
      jsonrpc: '2.0',
      error: {
        code: -32005,
        message: 'Burst rate limit exceeded',
        data: 'Too many rapid requests, please slow down and try again in a minute.'
      },
      id: req.body?.id || null
    });
  }
});

module.exports = {
  magicLinkLimiter,
  apiLimiter,
  chatApiLimiter,
  chatGlobalHourlyLimiter,
  chatGlobalDailyLimiter,
  chatImageLimiter,
  chatImageGlobalLimiter,
  adminApiLimiter,
  mcpApiLimiter,
  mcpBurstLimiter,
};