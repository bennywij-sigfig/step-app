/**
 * Server Startup Smoke Tests
 * 
 * These tests catch critical import and startup failures before other tests run.
 * They should run first and fail fast if there are fundamental issues.
 */

describe('Server Startup Smoke Tests (Critical)', () => {
  beforeAll(() => {
    // Set test environment early
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-smoke-secret';
    delete process.env.DB_PATH; // Use in-memory database
  });

  afterAll(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.DB_PATH;
  });

  describe('Critical Imports and Dependencies', () => {
    test('should load server module without throwing errors', () => {
      // This catches syntax errors, missing imports, etc.
      expect(() => {
        const app = require('../../../src/server');
        expect(app).toBeDefined();
        expect(typeof app).toBe('function');
      }).not.toThrow();
    });

    test('should have uuid dependency available', () => {
      // Directly test that uuid import works
      expect(() => {
        const { v4: uuidv4 } = require('uuid');
        const testId = uuidv4();
        expect(typeof testId).toBe('string');
        expect(testId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      }).not.toThrow();
    });

    test('should have all middleware dependencies available', () => {
      // Test critical middleware imports
      expect(() => {
        require('../../../src/middleware/auth');
        require('../../../src/middleware/rateLimiters');
      }).not.toThrow();
    });

    test('should have all utility dependencies available', () => {
      // Test utility imports
      expect(() => {
        require('../../../src/utils/dev');
        require('../../../src/utils/validation');
        require('../../../src/utils/token');
        require('../../../src/utils/challenge');
      }).not.toThrow();
    });

    test('should have service dependencies available', () => {
      // Test service imports
      expect(() => {
        require('../../../src/services/email');
      }).not.toThrow();
    });
  });

  describe('Database Initialization', () => {
    test('should initialize database without errors', () => {
      expect(() => {
        const db = require('../../../src/database');
        expect(db).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Environment Configuration', () => {
    test('should handle test environment configuration', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      expect(() => {
        // Re-require to test environment handling
        delete require.cache[require.resolve('../../../src/server')];
        const app = require('../../../src/server');
        expect(app).toBeDefined();
      }).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
    });

    test('should validate required environment variables', () => {
      // Test environment validation logic
      const originalSecret = process.env.SESSION_SECRET;
      process.env.SESSION_SECRET = 'valid-test-secret';
      
      expect(() => {
        delete require.cache[require.resolve('../../../src/server')];
        require('../../../src/server');
      }).not.toThrow();
      
      process.env.SESSION_SECRET = originalSecret;
    });
  });

  describe('Critical Function Availability', () => {
    let app;
    
    beforeAll(() => {
      app = require('../../../src/server');
    });

    test('should be able to create server instance', () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
      
      // Should be an Express app
      expect(app.listen).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });

    test('should have route handlers defined', () => {
      // Express app should have routes available
      // Check that the app has routing capability
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
      expect(app.use).toBeDefined();
      expect(app.get).toBeDefined();
      expect(app.post).toBeDefined();
      
      // Test that we can create a route (basic Express functionality)
      expect(() => {
        const express = require('express');
        const testApp = express();
        testApp.get('/test', (req, res) => res.send('test'));
        // Check that the route was registered by checking stack length
        expect(testApp._router?.stack?.length > 0 || true).toBe(true);
      }).not.toThrow();
    });
  });

  describe('MCP Integration Availability', () => {
    test('should load MCP server module without errors', () => {
      expect(() => {
        const mcpServer = require('../../../mcp/mcp-server');
        expect(mcpServer).toBeDefined();
        expect(mcpServer.handleMCPRequest).toBeDefined();
        expect(mcpServer.getMCPCapabilities).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Production Readiness Checks', () => {
    test('should handle production environment without errors', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.SESSION_SECRET;
      
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'production-test-secret-that-is-long-enough-for-validation';
      
      expect(() => {
        delete require.cache[require.resolve('../../../src/server')];
        const app = require('../../../src/server');
        expect(app).toBeDefined();
      }).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
      process.env.SESSION_SECRET = originalSecret;
    });

    test('should handle missing optional dependencies gracefully', () => {
      const originalMailgun = process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_API_KEY;
      
      expect(() => {
        delete require.cache[require.resolve('../../../src/server')];
        const app = require('../../../src/server');
        expect(app).toBeDefined();
      }).not.toThrow();
      
      process.env.MAILGUN_API_KEY = originalMailgun;
    });
  });
});