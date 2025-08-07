/**
 * Shared Route Definitions - Single Source of Truth
 * 
 * This module defines all application routes in one place to prevent
 * route/contract mismatches between server implementation and tests.
 * 
 * Usage:
 * - Server: app.get(ROUTES.auth.login, handler)
 * - Tests: request(app).get(ROUTES.auth.login)
 * 
 * This eliminates hardcoded route strings and makes mismatches compile-time errors.
 */

const ROUTES = {
  // Authentication Routes
  auth: {
    sendLink: '/auth/send-link',
    login: '/auth/login',
    logout: '/auth/logout',
    devMagicLink: '/dev/get-magic-link'
  },

  // API Routes
  api: {
    csrfToken: '/api/csrf-token',
    steps: '/api/steps',
    leaderboard: '/api/leaderboard',
    teamLeaderboard: '/api/team-leaderboard',
    userProfile: '/api/user-profile',
    settings: '/api/settings'
  },

  // Admin API Routes
  admin: {
    users: '/api/admin/users',
    teams: '/api/admin/teams',
    challenges: '/api/admin/challenges',
    mcpTokens: '/api/admin/mcp-tokens',
    mcpAudit: '/api/admin/mcp-audit',
    confetti: '/api/admin/confetti-threshold',
    magicLink: '/api/admin/magic-link',
    export: '/api/admin/export'
  },

  // MCP Routes
  mcp: {
    main: '/mcp',
    capabilities: '/mcp/capabilities'
  },

  // Static Pages
  pages: {
    dashboard: '/',
    admin: '/admin',
    mcpSetup: '/mcp-setup',
    health: '/health'
  },

  // Download Routes
  downloads: {
    pythonBridge: '/download/step_bridge.py'
  }
};

// Route validation helper
const validateRoute = (route) => {
  if (typeof route !== 'string' || !route.startsWith('/')) {
    throw new Error(`Invalid route: ${route}. Routes must be strings starting with '/'`);
  }
  return route;
};

// Get all routes as flat array for testing
const getAllRoutes = () => {
  const routes = [];
  const flatten = (obj, prefix = '') => {
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (typeof value === 'object') {
        flatten(value, `${prefix}${key}.`);
      } else {
        routes.push({ path: `${prefix}${key}`, route: value });
      }
    });
  };
  flatten(ROUTES);
  return routes;
};

// Validate all routes on module load
getAllRoutes().forEach(({ path, route }) => {
  try {
    validateRoute(route);
  } catch (error) {
    throw new Error(`Invalid route definition at ${path}: ${error.message}`);
  }
});

module.exports = {
  ROUTES,
  validateRoute,
  getAllRoutes
};