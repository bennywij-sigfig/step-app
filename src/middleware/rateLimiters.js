const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const magicLinkLimiter = rateLimit({
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

const apiLimiter = rateLimit({
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

const adminApiLimiter = rateLimit({
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
const mcpApiLimiter = rateLimit({
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
const mcpBurstLimiter = rateLimit({
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
  adminApiLimiter,
  mcpApiLimiter,
  mcpBurstLimiter,
};