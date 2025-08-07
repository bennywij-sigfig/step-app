/**
 * CSRF Token Generation Tests
 * 
 * These tests specifically validate CSRF token functionality in isolation
 * to catch import failures and generation issues that integration tests might miss.
 */

const request = require('supertest');

describe('CSRF Token Generation (Isolated Tests)', () => {
  let app;
  
  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-csrf-secret-key-for-isolation-tests';
    delete process.env.DB_PATH; // Use in-memory database
    
    // Import app after setting environment
    app = require('../../../src/server');
    
    // Wait for app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterAll(async () => {
    // Cleanup
    delete process.env.SESSION_SECRET;
    delete process.env.DB_PATH;
  });

  describe('Server Startup and Import Validation', () => {
    test('should start server without import errors', () => {
      // If we get here, the server loaded successfully without throwing
      // This catches missing imports like uuidv4 that cause startup failures
      expect(app).toBeDefined();
      expect(typeof app).toBe('function'); // Express app should be a function
    });

    test('should have all required CSRF functions available', () => {
      // Test that critical functions are available (not undefined)
      // This would catch the uuidv4 import issue directly
      const serverModule = require('../../../src/server');
      expect(serverModule).toBeDefined();
      
      // We can't directly test internal functions, but we can test that
      // the server module loaded without throwing errors
      expect(typeof serverModule).toBe('function');
    });
  });

  describe('CSRF Token Endpoint Direct Testing', () => {
    test('should generate CSRF token for authenticated session', async () => {
      const agent = request.agent(app);
      
      // Create a test user and authenticate
      const testEmail = `csrf-test-${Date.now()}@test.com`;
      
      // Get magic link
      const magicResponse = await agent
        .post('/dev/get-magic-link')
        .send({ email: testEmail })
        .expect(200);
      
      expect(magicResponse.body).toHaveProperty('magicLink');
      
      // Extract and use token
      const magicUrl = new URL(magicResponse.body.magicLink);
      const token = magicUrl.searchParams.get('token');
      
      await agent
        .get('/auth/login')
        .query({ token })
        .expect(302); // Redirect after successful auth
      
      // NOW test CSRF token generation directly
      const csrfResponse = await agent
        .get('/api/csrf-token')
        .expect(200);
      
      // Validate CSRF token structure
      expect(csrfResponse.body).toHaveProperty('csrfToken');
      expect(typeof csrfResponse.body.csrfToken).toBe('string');
      expect(csrfResponse.body.csrfToken.length).toBeGreaterThan(0);
      
      // Should be a valid UUID format (what uuidv4 generates)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(csrfResponse.body.csrfToken).toMatch(uuidRegex);
    });

    test('should generate different CSRF tokens for different sessions', async () => {
      // Create two separate sessions
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);
      
      const email1 = `csrf-test1-${Date.now()}@test.com`;
      const email2 = `csrf-test2-${Date.now()}@test.com`;
      
      // Authenticate both sessions
      const magic1 = await agent1.post('/dev/get-magic-link').send({ email: email1 }).expect(200);
      const magic2 = await agent2.post('/dev/get-magic-link').send({ email: email2 }).expect(200);
      
      const token1 = new URL(magic1.body.magicLink).searchParams.get('token');
      const token2 = new URL(magic2.body.magicLink).searchParams.get('token');
      
      await agent1.get('/auth/login').query({ token: token1 }).expect(302);
      await agent2.get('/auth/login').query({ token: token2 }).expect(302);
      
      // Get CSRF tokens
      const csrf1 = await agent1.get('/api/csrf-token').expect(200);
      const csrf2 = await agent2.get('/api/csrf-token').expect(200);
      
      // Should be different tokens
      expect(csrf1.body.csrfToken).not.toBe(csrf2.body.csrfToken);
      expect(csrf1.body.csrfToken).toMatch(/^[0-9a-f-]{36}$/i);
      expect(csrf2.body.csrfToken).toMatch(/^[0-9a-f-]{36}$/i);
    });

    test('should return same CSRF token for same session on multiple requests', async () => {
      const agent = request.agent(app);
      const testEmail = `csrf-persist-${Date.now()}@test.com`;
      
      // Authenticate
      const magicResponse = await agent.post('/dev/get-magic-link').send({ email: testEmail }).expect(200);
      const token = new URL(magicResponse.body.magicLink).searchParams.get('token');
      await agent.get('/auth/login').query({ token }).expect(302);
      
      // Get CSRF token twice
      const csrf1 = await agent.get('/api/csrf-token').expect(200);
      const csrf2 = await agent.get('/api/csrf-token').expect(200);
      
      // Should be the same token (persistent within session)
      expect(csrf1.body.csrfToken).toBe(csrf2.body.csrfToken);
    });
  });

  describe('CSRF Validation Logic Testing', () => {
    test('should validate CSRF token correctly on protected endpoints', async () => {
      const agent = request.agent(app);
      const testEmail = `csrf-validate-${Date.now()}@test.com`;
      
      // Authenticate and get CSRF token
      const magicResponse = await agent.post('/dev/get-magic-link').send({ email: testEmail }).expect(200);
      const token = new URL(magicResponse.body.magicLink).searchParams.get('token');
      await agent.get('/auth/login').query({ token }).expect(302);
      
      const csrfResponse = await agent.get('/api/csrf-token').expect(200);
      const csrfToken = csrfResponse.body.csrfToken;
      
      // Test with valid CSRF token (should succeed)
      const validResponse = await agent
        .post('/api/steps')
        .set('X-CSRF-Token', csrfToken)
        .send({ date: '2025-08-01', count: 5000 })
        .expect(200);
      
      expect(validResponse.body).toHaveProperty('message');
    });

    test('should reject requests with invalid CSRF token', async () => {
      const agent = request.agent(app);
      const testEmail = `csrf-invalid-${Date.now()}@test.com`;
      
      // Authenticate (but don't get proper CSRF token)
      const magicResponse = await agent.post('/dev/get-magic-link').send({ email: testEmail }).expect(200);
      const token = new URL(magicResponse.body.magicLink).searchParams.get('token');
      await agent.get('/auth/login').query({ token }).expect(302);
      
      // Test with invalid CSRF token (should fail)
      const invalidResponse = await agent
        .post('/api/steps')
        .set('X-CSRF-Token', 'invalid-token-12345')
        .send({ date: '2025-08-01', count: 5000 })
        .expect(403);
      
      expect(invalidResponse.body).toHaveProperty('error');
      expect(invalidResponse.body.error).toBe('Invalid CSRF token');
    });

    test('should reject requests without CSRF token', async () => {
      const agent = request.agent(app);
      const testEmail = `csrf-missing-${Date.now()}@test.com`;
      
      // Authenticate (but don't send CSRF token)
      const magicResponse = await agent.post('/dev/get-magic-link').send({ email: testEmail }).expect(200);
      const token = new URL(magicResponse.body.magicLink).searchParams.get('token');
      await agent.get('/auth/login').query({ token }).expect(302);
      
      // Test without CSRF token (should fail)
      const noTokenResponse = await agent
        .post('/api/steps')
        .send({ date: '2025-08-01', count: 5000 })
        .expect(403);
      
      expect(noTokenResponse.body).toHaveProperty('error');
      expect(noTokenResponse.body.error).toBe('Invalid CSRF token');
    });
  });

  describe('Error Conditions and Edge Cases', () => {
    test('should handle CSRF token generation failure gracefully', async () => {
      // This test would catch if uuidv4 function becomes undefined again
      const agent = request.agent(app);
      const testEmail = `csrf-error-${Date.now()}@test.com`;
      
      // Authenticate
      const magicResponse = await agent.post('/dev/get-magic-link').send({ email: testEmail }).expect(200);
      const token = new URL(magicResponse.body.magicLink).searchParams.get('token');
      await agent.get('/auth/login').query({ token }).expect(302);
      
      // Request CSRF token - should NOT return 500 error
      const csrfResponse = await agent.get('/api/csrf-token');
      
      // Should succeed (not 500) and return valid token
      expect(csrfResponse.status).toBe(200);
      expect(csrfResponse.body).toHaveProperty('csrfToken');
      expect(typeof csrfResponse.body.csrfToken).toBe('string');
      
      // If uuidv4 was undefined, this would fail with 500 instead of 200
    });

    test('should require authentication before providing CSRF token', async () => {
      const agent = request.agent(app);
      
      // Try to get CSRF token without authentication
      const response = await agent
        .get('/api/csrf-token')
        .expect(401); // Should require authentication
      
      expect(response.body).toHaveProperty('error');
    });
  });
});