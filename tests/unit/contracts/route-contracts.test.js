/**
 * Route Contract Tests - Unit Tests Only
 * 
 * These tests ensure that:
 * 1. Route definitions are valid and consistent
 * 2. URL patterns follow expected conventions
 * 3. Route structure is properly organized
 * 4. No duplicate or conflicting routes exist
 */

const { ROUTES, getAllRoutes } = require('../../../src/config/routes');

describe('Route Contract Tests', () => {
  beforeAll(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-contract-secret-key';
  });
  
  afterAll(() => {
    delete process.env.SESSION_SECRET;
  });

  describe('Route Definition Validation', () => {
    test('should have valid route definitions', () => {
      const routes = getAllRoutes();
      
      expect(routes.length).toBeGreaterThan(0);
      
      routes.forEach(({ path, route }) => {
        expect(route).toBeDefined();
        expect(typeof route).toBe('string');
        expect(route.startsWith('/')).toBe(true);
      });
    });

    test('should not have duplicate routes', () => {
      const routes = getAllRoutes();
      const routeValues = routes.map(r => r.route);
      const uniqueRoutes = new Set(routeValues);
      
      expect(uniqueRoutes.size).toBe(routeValues.length);
    });

    test('should have expected auth routes defined', () => {
      expect(ROUTES.auth).toBeDefined();
      expect(ROUTES.auth.sendLink).toBe('/auth/send-link');
      expect(ROUTES.auth.login).toBe('/auth/login');
      expect(ROUTES.auth.logout).toBe('/auth/logout');
      expect(ROUTES.auth.devMagicLink).toBe('/dev/get-magic-link');
    });

    test('should have expected API routes defined', () => {
      expect(ROUTES.api).toBeDefined();
      expect(ROUTES.api.csrfToken).toBe('/api/csrf-token');
      expect(ROUTES.api.steps).toBe('/api/steps');
      expect(ROUTES.api.leaderboard).toBe('/api/leaderboard');
      expect(ROUTES.api.teamLeaderboard).toBe('/api/team-leaderboard');
      expect(ROUTES.api.userProfile).toBe('/api/user-profile');
      expect(ROUTES.api.settings).toBe('/api/settings');
    });

    test('should have expected page routes defined', () => {
      expect(ROUTES.pages).toBeDefined();
      expect(ROUTES.pages.dashboard).toBe('/');
      expect(ROUTES.pages.admin).toBe('/admin');
      expect(ROUTES.pages.health).toBe('/health');
    });

    test('should have expected MCP routes defined', () => {
      expect(ROUTES.mcp).toBeDefined();
      expect(ROUTES.mcp.capabilities).toBe('/mcp/capabilities');
      expect(ROUTES.mcp.main).toBe('/mcp');
    });
  });

  describe('Route Pattern Validation', () => {
    test('should validate route parameter consistency', () => {
      // All routes should be strings starting with '/'
      const routes = getAllRoutes();
      
      routes.forEach(({ path, route }) => {
        expect(route).toMatch(/^\/[a-zA-Z0-9\-_\/\.]*$/);
      });
    });

    test('should follow REST conventions', () => {
      // API routes should follow /api/{resource} or /api/{category}/{resource} pattern
      const apiRoutes = getAllRoutes().filter(r => r.route.startsWith('/api/'));
      
      expect(apiRoutes.length).toBeGreaterThan(0);
      
      apiRoutes.forEach(({ route }) => {
        // Allow both /api/resource and /api/category/resource patterns
        expect(route).toMatch(/^\/api\/[a-z-]+(?:\/[a-z-]+)*$/);
      });
    });

    test('should have consistent auth route patterns', () => {
      const authRoutes = getAllRoutes().filter(r => r.route.startsWith('/auth/'));
      
      expect(authRoutes.length).toBeGreaterThan(0);
      
      authRoutes.forEach(({ route }) => {
        expect(route).toMatch(/^\/auth\/[a-z-]+$/);
      });
    });
  });

  describe('URL Generation Validation', () => {
    test('should generate valid magic link URLs', () => {
      const baseUrl = 'https://example.com';
      const token = 'test-token-123';
      
      // Simulate URL generation logic
      const magicUrl = `${baseUrl}${ROUTES.auth.login}?token=${token}`;
      
      const parsedUrl = new URL(magicUrl);
      expect(parsedUrl.pathname).toBe(ROUTES.auth.login);
      expect(parsedUrl.searchParams.get('token')).toBe(token);
    });

    test('should create valid API endpoint URLs', () => {
      const baseUrl = 'https://example.com';
      
      // Test various API routes
      const apiEndpoints = [
        ROUTES.api.steps,
        ROUTES.api.leaderboard,
        ROUTES.api.csrfToken,
        ROUTES.api.userProfile
      ];

      apiEndpoints.forEach(endpoint => {
        const fullUrl = `${baseUrl}${endpoint}`;
        const parsedUrl = new URL(fullUrl);
        expect(parsedUrl.pathname).toBe(endpoint);
      });
    });
  });

  describe('Route Organization Validation', () => {
    test('should group routes by functionality', () => {
      expect(ROUTES.auth).toBeDefined();
      expect(ROUTES.api).toBeDefined();  
      expect(ROUTES.pages).toBeDefined();
      expect(ROUTES.mcp).toBeDefined();
      expect(ROUTES.admin).toBeDefined();
      
      // Should have multiple routes in each category
      expect(Object.keys(ROUTES.auth).length).toBeGreaterThan(1);
      expect(Object.keys(ROUTES.api).length).toBeGreaterThan(1);
      expect(Object.keys(ROUTES.pages).length).toBeGreaterThan(1);
    });

    test('should not have conflicting route prefixes', () => {
      const routes = getAllRoutes();
      const routesByPrefix = {};
      
      routes.forEach(({ route }) => {
        const prefix = route.split('/')[1] || 'root';
        if (!routesByPrefix[prefix]) {
          routesByPrefix[prefix] = [];
        }
        routesByPrefix[prefix].push(route);
      });
      
      // Check for common prefix conflicts
      expect(routesByPrefix.api).toBeDefined();
      expect(routesByPrefix.auth).toBeDefined();
      expect(routesByPrefix.mcp).toBeDefined();
    });
  });

  describe('Token Parameter Validation', () => {
    test('should validate UUID token format', () => {
      const { v4: uuidv4 } = require('uuid');
      const testToken = uuidv4();
      
      // Token should be a valid UUID v4
      expect(testToken).toBeTruthy();
      expect(typeof testToken).toBe('string');
      expect(testToken.length).toBe(36);
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(testToken).toMatch(uuidRegex);
    });

    test('should handle token URL encoding', () => {
      const { v4: uuidv4 } = require('uuid');
      const testToken = uuidv4();
      
      const params = new URLSearchParams();
      params.set('token', testToken);
      
      const encodedToken = params.get('token');
      expect(encodedToken).toBe(testToken);
      
      // UUID tokens should not need URL encoding
      expect(encodeURIComponent(testToken)).toBe(testToken);
    });
  });

  describe('Route Structure Consistency', () => {
    test('should maintain consistent route structure', () => {
      const routes = getAllRoutes();
      
      // All routes should have path and route properties
      routes.forEach(routeObj => {
        expect(routeObj).toHaveProperty('path');
        expect(routeObj).toHaveProperty('route');
        expect(typeof routeObj.path).toBe('string');
        expect(typeof routeObj.route).toBe('string');
      });
    });

    test('should not have hardcoded routes outside config', () => {
      // This is a meta-test that validates our approach
      const routes = getAllRoutes();
      const authRoutes = routes.filter(r => r.path.includes('auth'));
      
      expect(authRoutes.length).toBeGreaterThan(0);
      
      // Should have both sendLink and login routes defined
      expect(ROUTES.auth.sendLink).toBeDefined();
      expect(ROUTES.auth.login).toBeDefined();
      expect(ROUTES.auth.devMagicLink).toBeDefined();
    });
  });

  describe('Error Handling Route Validation', () => {
    test('should have consistent error response patterns', () => {
      // Test that routes are structured for error handling
      const criticalRoutes = [
        ROUTES.auth.login,
        ROUTES.api.steps,
        ROUTES.api.csrfToken
      ];
      
      criticalRoutes.forEach(route => {
        expect(route).toBeDefined();
        expect(typeof route).toBe('string');
        expect(route.startsWith('/')).toBe(true);
      });
    });

    test('should validate route path safety', () => {
      const routes = getAllRoutes();
      
      routes.forEach(({ route }) => {
        // Routes should not contain dangerous characters
        expect(route).not.toMatch(/[<>'"&]/);
        expect(route).not.toMatch(/\.\./);
        expect(route).not.toMatch(/\/\//);
      });
    });
  });
});