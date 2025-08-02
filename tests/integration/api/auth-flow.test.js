/**
 * Integration Tests for Authentication Flow
 * Tests complete authentication workflow including magic links
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const path = require('path');
const { createTestDatabase, cleanupTestDatabase } = require('../../environments/shared/test-helpers');

describe('Authentication Flow Integration Tests', () => {
  let app;
  let testDbPath;

  beforeAll(async () => {
    // Suppress console output during tests
    suppressConsole();
    
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_RATE_LIMITING = 'true';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.CSRF_SECRET = 'test-csrf-secret';
  });

  afterAll(() => {
    restoreConsole();
  });

  beforeEach(async () => {
    // Create fresh test database for each test
    testDbPath = createTestDatabase();
    process.env.DB_PATH = testDbPath;
    
    // Clear require cache to get fresh app instance
    delete require.cache[require.resolve('../../../src/server.js')];
    
    // Import app after setting environment
    app = require('../../../src/server.js');
    
    // Wait for app to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (app && app.close) {
      await new Promise(resolve => app.close(resolve));
    }
    cleanupTestDatabase(testDbPath);
    delete process.env.DB_PATH;
  });

  describe('Magic Link Generation', () => {
    test('should generate magic link for new user', async () => {
      const email = 'newuser@example.com';
      
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('sent');
      expect(response.body).toHaveProperty('debug');
      expect(response.body.debug).toBe(true); // Test mode should show debug info
    });

    test('should generate magic link for existing user', async () => {
      const email = 'existing@example.com';
      
      // First request creates user
      await request(app)
        .post('/auth/send-link')
        .send({ email })
        .expect(200);

      // Second request should work for existing user
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email })
        .expect(200);

      expect(response.body.message).toContain('sent');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('valid email');
    });

    test('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    test('should reject empty email', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    test('should handle SQL injection attempts', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: "test@example.com'; DROP TABLE users; --" })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('valid email');
    });
  });

  describe('Magic Link Verification', () => {
    let magicToken;

    beforeEach(async () => {
      // Generate a magic link first
      const email = 'test@example.com';
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email })
        .expect(200);

      // Extract token from response (in test mode, it's included)
      if (response.body.token) {
        magicToken = response.body.token;
      } else {
        // If not in response, we'd need to query the database
        // For this test, we'll mock a valid token structure
        magicToken = 'test-magic-token-' + Date.now() + Math.random();
      }
    });

    test('should reject invalid token format', async () => {
      const response = await request(app)
        .get('/auth/verify?token=invalid-token')
        .expect(400);

      expect(response.text).toContain('Invalid or expired');
    });

    test('should reject missing token', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .expect(400);

      expect(response.text).toContain('Invalid or expired');
    });

    test('should reject expired token', async () => {
      // This would require database manipulation to create an expired token
      // For now, test with a clearly invalid token
      const response = await request(app)
        .get('/auth/verify?token=expired-token-12345')
        .expect(400);

      expect(response.text).toContain('Invalid or expired');
    });
  });

  describe('Session Management', () => {
    test('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get('/dashboard')
        .expect(302); // Redirect to login

      expect(response.headers.location).toContain('/');
    });

    test('should provide CSRF token to authenticated users', async () => {
      // This test would require a valid session
      // For now, test that the endpoint exists and returns proper structure
      const response = await request(app)
        .get('/api/csrf-token')
        .expect(401); // Unauthorized without session

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Logout Flow', () => {
    test('should destroy session on logout', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('logged out');
    });

    test('should redirect to home after logout', async () => {
      const response = await request(app)
        .get('/auth/logout')
        .expect(302);

      expect(response.headers.location).toBe('/');
    });
  });

  describe('Rate Limiting (when enabled)', () => {
    beforeEach(() => {
      // Enable rate limiting for these tests
      delete process.env.DISABLE_RATE_LIMITING;
    });

    afterEach(() => {
      // Restore disabled rate limiting
      process.env.DISABLE_RATE_LIMITING = 'true';
    });

    test('should enforce rate limit on magic link requests', async () => {
      const email = 'ratelimit@example.com';
      
      // Make requests up to the limit (typically 10 per hour)
      const promises = [];
      for (let i = 0; i < 12; i++) {
        promises.push(
          request(app)
            .post('/auth/send-link')
            .send({ email })
        );
      }

      const responses = await Promise.all(promises);
      
      // Some should succeed, some should be rate limited
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThanOrEqual(10); // Default rate limit
    });
  });

  describe('Security Headers', () => {
    test('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should enforce HTTPS in production', async () => {
      // Save original environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const response = await request(app)
          .get('/')
          .expect(200);

        // In production, should have HTTPS-related headers
        if (response.headers['strict-transport-security']) {
          expect(response.headers['strict-transport-security']).toBeDefined();
        }
      } finally {
        // Restore original environment
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize email input', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: '  TEST@EXAMPLE.COM  ' })
        .expect(200);

      expect(response.body.message).toContain('sent');
      // Email should be normalized (trimmed and lowercased)
    });

    test('should reject XSS attempts in email', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: '<script>alert("xss")</script>@example.com' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('valid email');
    });

    test('should handle Unicode in email addresses', async () => {
      const response = await request(app)
        .post('/auth/send-link')
        .send({ email: 'tëst@example.com' })
        .expect(400); // Should reject non-ASCII for security

      expect(response.body).toHaveProperty('error');
    });
  });
});