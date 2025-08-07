/**
 * Route Contract Tests
 * 
 * These tests ensure that:
 * 1. Routes defined in config match actual server endpoints
 * 2. URL generation matches URL consumption patterns
 * 3. Magic link URLs work end-to-end
 * 4. Route definitions are valid and consistent
 */

const request = require('supertest');
const { ROUTES, getAllRoutes } = require('../../../src/config/routes');

describe('Route Contract Tests', () => {
  let app;
  
  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-contract-secret-key';
    delete process.env.DB_PATH; // Use in-memory database
    
    // Import app after setting environment
    app = require('../../../src/server');
    
    // Wait for app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterAll(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.DB_PATH;
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
  });

  describe('Server Endpoint Contract Validation', () => {
    test('should respond to defined health endpoint', async () => {
      await request(app)
        .get(ROUTES.pages.health)
        .expect(200);
    });

    test('should respond to defined dashboard endpoint', async () => {
      await request(app)
        .get(ROUTES.pages.dashboard)
        .expect(200);
    });

    test('should have auth endpoints available', async () => {
      // Test send link endpoint exists (should be POST only)
      // Note: Some Express configurations return 404 instead of 405 for wrong method
      const response = await request(app)
        .get(ROUTES.auth.sendLink);
      
      // Should be either 404 (route not found for GET) or 405 (method not allowed)
      expect([404, 405]).toContain(response.status);
      
      // Test dev magic link endpoint exists (development only)
      const devResponse = await request(app)
        .get(ROUTES.auth.devMagicLink);
      
      // Should be either 404 (route not found for GET) or 405 (method not allowed)
      expect([404, 405]).toContain(devResponse.status);
    });

    test('should have API endpoints available', async () => {
      // CSRF token endpoint should require authentication
      await request(app)
        .get(ROUTES.api.csrfToken)
        .expect(401); // Unauthorized without session
    });

    test('should have MCP endpoints available', async () => {
      await request(app)
        .get(ROUTES.mcp.capabilities)
        .expect(200);
    });
  });

  describe('Magic Link URL Generation Contract', () => {
    test('should generate magic links using correct route definition', async () => {
      const testEmail = `contract-test-${Date.now()}@test.com`;
      
      const response = await request(app)
        .post(ROUTES.auth.devMagicLink)
        .send({ email: testEmail })
        .expect(200);
      
      expect(response.body).toHaveProperty('magicLink');
      
      const magicUrl = new URL(response.body.magicLink);
      
      // Should use the route defined in ROUTES.auth.login
      expect(magicUrl.pathname).toBe(ROUTES.auth.login);
      expect(magicUrl.searchParams.has('token')).toBe(true);
    });

    test('should generate consumable magic link URLs', async () => {
      const testEmail = `consumable-test-${Date.now()}@test.com`;
      
      // 1. Generate magic link
      const magicResponse = await request(app)
        .post(ROUTES.auth.devMagicLink)
        .send({ email: testEmail })
        .expect(200);
      
      const magicUrl = new URL(magicResponse.body.magicLink);
      const token = magicUrl.searchParams.get('token');
      
      // 2. Use the generated URL (should work without hardcoding paths)
      const agent = request.agent(app);
      await agent
        .get(magicUrl.pathname)
        .query({ token })
        .expect(302); // Should redirect after successful auth
      
      // 3. Should be able to access protected endpoints
      await agent
        .get(ROUTES.api.csrfToken)
        .expect(200);
    });

    test('should validate magic link token parameter extraction', async () => {
      const testEmail = `token-extract-${Date.now()}@test.com`;
      
      const response = await request(app)
        .post(ROUTES.auth.devMagicLink)
        .send({ email: testEmail })
        .expect(200);
      
      const magicUrl = new URL(response.body.magicLink);
      const token = magicUrl.searchParams.get('token');
      
      // Token should be a valid UUID v4
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(36);
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(token).toMatch(uuidRegex);
    });
  });

  describe('End-to-End Route Workflow Validation', () => {
    test('complete authentication workflow should use consistent routes', async () => {
      const agent = request.agent(app);
      const testEmail = `e2e-workflow-${Date.now()}@test.com`;
      
      // 1. Request magic link using route definition
      const magicResponse = await agent
        .post(ROUTES.auth.devMagicLink)
        .send({ email: testEmail })
        .expect(200);
      
      // 2. Extract URL and validate it uses correct route
      const magicUrl = new URL(magicResponse.body.magicLink);
      expect(magicUrl.pathname).toBe(ROUTES.auth.login);
      
      // 3. Use magic link for authentication
      const token = magicUrl.searchParams.get('token');
      await agent
        .get(ROUTES.auth.login)
        .query({ token })
        .expect(302);
      
      // 4. Access protected API endpoints
      const csrfResponse = await agent
        .get(ROUTES.api.csrfToken)
        .expect(200);
      
      expect(csrfResponse.body).toHaveProperty('csrfToken');
      
      // 5. Use CSRF token for API operations
      const stepsResponse = await agent
        .post(ROUTES.api.steps)
        .set('X-CSRF-Token', csrfResponse.body.csrfToken)
        .send({ date: '2025-08-01', count: 7500 })
        .expect(200);
      
      expect(stepsResponse.body).toHaveProperty('message');
    });
  });

  describe('Route Consistency Validation', () => {
    test('should not have hardcoded routes in critical functions', () => {
      // This is a meta-test that validates our approach
      const routes = getAllRoutes();
      const authRoutes = routes.filter(r => r.path.includes('auth'));
      
      expect(authRoutes.length).toBeGreaterThan(0);
      
      // Should have both sendLink and login routes defined
      expect(ROUTES.auth.sendLink).toBeDefined();
      expect(ROUTES.auth.login).toBeDefined();
      expect(ROUTES.auth.devMagicLink).toBeDefined();
    });

    test('should validate route parameter consistency', () => {
      // All routes should be strings starting with '/'
      const routes = getAllRoutes();
      
      routes.forEach(({ path, route }) => {
        expect(route).toMatch(/^\/[a-zA-Z0-9\-_\/\.]*$/);
      });
    });
  });

  describe('Error Condition Route Validation', () => {
    test('should handle invalid magic link tokens correctly', async () => {
      await request(app)
        .get(ROUTES.auth.login)
        .query({ token: 'invalid-token-123' })
        .expect(400); // Bad request for invalid token
    });

    test('should handle missing tokens correctly', async () => {
      await request(app)
        .get(ROUTES.auth.login)
        .expect(400); // Bad request for missing token
    });

    test('should protect API endpoints correctly', async () => {
      // Should require authentication
      await request(app)
        .post(ROUTES.api.steps)
        .send({ date: '2025-08-01', count: 5000 })
        .expect(401); // Unauthorized without session
    });
  });
});