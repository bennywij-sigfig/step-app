/**
 * Server Startup Smoke Tests - Unit Tests Only
 * 
 * These tests catch critical import and startup failures before other tests run.
 * They validate dependencies and module structure without starting servers.
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

  describe('Database Module Structure', () => {
    test('should initialize database module without errors', () => {
      expect(() => {
        const db = require('../../../src/database');
        expect(db).toBeDefined();
        expect(db.ready).toBeDefined();
        expect(db.utils).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Express Module Structure', () => {
    test('should validate express and core dependencies', () => {
      expect(() => {
        const express = require('express');
        const session = require('express-session');
        const rateLimit = require('express-rate-limit');
        const helmet = require('helmet');
        
        expect(express).toBeDefined();
        expect(session).toBeDefined();  
        expect(rateLimit).toBeDefined();
        expect(helmet).toBeDefined();
        
        // Test basic Express functionality
        const testApp = express();
        expect(typeof testApp).toBe('function');
        expect(testApp.get).toBeDefined();
        expect(testApp.post).toBeDefined();
        expect(testApp.use).toBeDefined();
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

  describe('Environment Configuration Validation', () => {
    test('should validate environment variables are available', () => {
      // Test that critical environment variables can be set
      const testVars = {
        NODE_ENV: 'test',
        SESSION_SECRET: 'test-secret-validation'
      };
      
      Object.entries(testVars).forEach(([key, value]) => {
        const original = process.env[key];
        process.env[key] = value;
        expect(process.env[key]).toBe(value);
        if (original !== undefined) {
          process.env[key] = original;
        }
      });
    });

    test('should handle missing optional environment variables', () => {
      const originalMailgun = process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_API_KEY;
      
      expect(process.env.MAILGUN_API_KEY).toBeUndefined();
      
      if (originalMailgun !== undefined) {
        process.env.MAILGUN_API_KEY = originalMailgun;
      }
    });
  });

  describe('File System Structure', () => {
    test('should validate critical file paths exist', () => {
      const fs = require('fs');
      const path = require('path');
      
      const criticalPaths = [
        '../../../src/server.js',
        '../../../src/database.js',
        '../../../mcp/mcp-server.js',
        '../../../package.json'
      ];
      
      criticalPaths.forEach(filePath => {
        const resolvedPath = require.resolve(filePath);
        expect(fs.existsSync(resolvedPath)).toBe(true);
      });
    });
  });
});