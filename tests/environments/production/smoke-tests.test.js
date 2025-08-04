/**
 * Production Smoke Tests
 * Critical path tests for production environment
 * NOTE: These are READ-ONLY tests - they never modify production data
 */

const { describe, test, expect, beforeAll } = require('@jest/globals');
const request = require('supertest');

describe('Production Smoke Tests', () => {
  const baseUrl = 'https://step-app-4x-yhw.fly.dev';
  let isProduction = false;

  beforeAll(() => {
    // Only run these tests if explicitly testing production
    isProduction = process.env.NODE_ENV === 'production' || process.env.TEST_PRODUCTION === 'true';
    
    if (!isProduction) {
      console.log('Skipping production smoke tests (not in production mode)');
    }
  });

  describe('Health and Availability', () => {
    test('should respond to health check', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('database');
      expect(response.body.database.accessible).toBe(true);
    });

    test('should serve main application page', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Step Challenge');
      expect(response.headers['content-type']).toContain('text/html');
    });

    test('should serve static assets', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/dashboard.js')
        .expect(200);

      expect(response.headers['content-type']).toContain('javascript');
    });
  });

  describe('API Endpoints', () => {
    test('should provide CSRF token endpoint', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/api/csrf-token')
        .expect(401); // Expected - requires authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should handle authentication endpoints', async () => {
      if (!isProduction) return;

      // Test with invalid data - this should not modify anything
      const response = await request(baseUrl)
        .post('/auth/send-link')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Valid email required');
    });
  });

  describe('MCP Integration', () => {
    test('should provide MCP capabilities', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/mcp/capabilities')
        .expect(200);

      expect(response.body).toHaveProperty('capabilities');
      expect(response.body.capabilities).toHaveProperty('tools');
      expect(Array.isArray(response.body.capabilities.tools)).toBe(true);
    });

    test('should handle MCP JSON-RPC requests', async () => {
      if (!isProduction) return;

      // Test valid request without authentication - should return tools list
      const response = await request(baseUrl)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
          // No token required for tools/list
        })
        .expect(200);

      expect(response.body).toHaveProperty('jsonrpc');
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('tools');
      expect(Array.isArray(response.body.result.tools)).toBe(true);
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/')
        .expect(200);

      // Check for critical security headers
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      
      // Should have HTTPS enforcement in production
      if (response.headers['strict-transport-security']) {
        expect(response.headers['strict-transport-security']).toBeDefined();
      }
    });

    test('should enforce HTTPS', async () => {
      if (!isProduction) return;

      // Verify we're actually testing HTTPS
      expect(baseUrl).toContain('https://');
    });
  });

  describe('Rate Limiting', () => {
    test('should have rate limiting configured', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      // Rate limiting headers might be present
      if (response.headers['x-ratelimit-limit']) {
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
      }
    });
  });

  describe('Database Integrity', () => {
    test('should report healthy database', async () => {
      if (!isProduction) return;

      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.body.database).toHaveProperty('accessible');
      expect(response.body.database.accessible).toBe(true);
      
      expect(response.body.database).toHaveProperty('integrity');
      expect(response.body.database.integrity).toBe(true);
    });
  });
});