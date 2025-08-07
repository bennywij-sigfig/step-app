/**
 * Critical Dependencies Import Validation Tests
 * 
 * These tests validate that all critical dependencies are properly imported
 * and available. They catch missing imports that could cause runtime failures.
 */

describe('Critical Dependencies Import Validation', () => {
  describe('Core Server Dependencies', () => {
    test('should import uuid dependency correctly', () => {
      expect(() => {
        const { v4: uuidv4 } = require('uuid');
        
        // Test that uuid function works
        const testUuid = uuidv4();
        expect(typeof testUuid).toBe('string');
        expect(testUuid.length).toBe(36);
        
        // Should match UUID v4 format
        const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(testUuid).toMatch(uuidv4Regex);
      }).not.toThrow();
    });

    test('should import express and core middleware', () => {
      expect(() => {
        const express = require('express');
        const helmet = require('helmet');
        const session = require('express-session');
        const rateLimit = require('express-rate-limit');
        
        expect(express).toBeDefined();
        expect(helmet).toBeDefined(); 
        expect(session).toBeDefined();
        expect(rateLimit).toBeDefined();
        
        // Test that express creates apps
        const testApp = express();
        expect(typeof testApp).toBe('function');
        expect(testApp.use).toBeDefined();
      }).not.toThrow();
    });

    test('should import database dependencies', () => {
      expect(() => {
        const sqlite3 = require('sqlite3');
        const SQLiteStore = require('connect-sqlite3');
        
        expect(sqlite3).toBeDefined();
        expect(SQLiteStore).toBeDefined();
        expect(typeof SQLiteStore).toBe('function');
      }).not.toThrow();
    });
  });

  describe('Application Module Dependencies', () => {
    test('should import middleware modules', () => {
      expect(() => {
        const auth = require('../../../src/middleware/auth');
        const rateLimiters = require('../../../src/middleware/rateLimiters');
        
        expect(auth).toBeDefined();
        expect(auth.requireAuth).toBeDefined();
        expect(auth.requireApiAuth).toBeDefined();
        expect(auth.requireAdmin).toBeDefined();
        expect(auth.requireApiAdmin).toBeDefined();
        
        expect(rateLimiters).toBeDefined();
        expect(rateLimiters.magicLinkLimiter).toBeDefined();
        expect(rateLimiters.apiLimiter).toBeDefined();
        expect(rateLimiters.adminApiLimiter).toBeDefined();
        expect(rateLimiters.mcpApiLimiter).toBeDefined();
        expect(rateLimiters.mcpBurstLimiter).toBeDefined();
      }).not.toThrow();
    });

    test('should import utility modules', () => {
      expect(() => {
        const dev = require('../../../src/utils/dev');
        const validation = require('../../../src/utils/validation');
        const token = require('../../../src/utils/token');
        const challenge = require('../../../src/utils/challenge');
        
        expect(dev).toBeDefined();
        expect(dev.isDevelopment).toBeDefined();
        expect(dev.devLog).toBeDefined();
        
        expect(validation).toBeDefined();
        expect(validation.isValidEmail).toBeDefined();
        expect(validation.normalizeEmail).toBeDefined();
        expect(validation.isValidDate).toBeDefined();
        
        expect(token).toBeDefined();
        expect(token.hashToken).toBeDefined();
        expect(token.generateSecureToken).toBeDefined();
        
        expect(challenge).toBeDefined();
        expect(challenge.getCurrentPacificTime).toBeDefined();
        expect(challenge.getCurrentChallengeDay).toBeDefined();
        expect(challenge.getTotalChallengeDays).toBeDefined();
      }).not.toThrow();
    });

    test('should import service modules', () => {
      expect(() => {
        const email = require('../../../src/services/email');
        
        expect(email).toBeDefined();
        expect(email.sendEmail).toBeDefined();
      }).not.toThrow();
    });

    test('should import MCP modules', () => {
      expect(() => {
        const mcpServer = require('../../../mcp/mcp-server');
        
        expect(mcpServer).toBeDefined();
        expect(mcpServer.handleMCPRequest).toBeDefined();
        expect(mcpServer.getMCPCapabilities).toBeDefined();
        expect(mcpServer.mcpUtils).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Function Availability Tests', () => {
    test('uuid v4 function should generate valid tokens', () => {
      const { v4: uuidv4 } = require('uuid');
      
      // Generate multiple tokens to ensure consistency
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        tokens.push(uuidv4());
      }
      
      // All should be valid UUIDs
      tokens.forEach(token => {
        expect(typeof token).toBe('string');
        expect(token.length).toBe(36);
        expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
      
      // All should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    test('server utility functions should work correctly', () => {
      const { generateSecureToken, hashToken } = require('../../../src/utils/token');
      const { isValidEmail, normalizeEmail } = require('../../../src/utils/validation');
      
      // Test token generation
      const token = generateSecureToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      
      // Test token hashing
      const hashedToken = hashToken(token);
      expect(typeof hashedToken).toBe('string');
      expect(hashedToken.length).toBeGreaterThan(0);
      expect(hashedToken).not.toBe(token); // Should be different from original
      
      // Test email validation
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      
      const normalizedEmail = normalizeEmail('TEST@EXAMPLE.COM');
      expect(normalizedEmail).toBe('test@example.com');
    });

    test('database module should initialize correctly', () => {
      expect(() => {
        const db = require('../../../src/database');
        expect(db).toBeDefined();
        
        // Should be a database connection object or similar
        expect(typeof db).toBe('object');
      }).not.toThrow();
    });
  });

  describe('Critical Runtime Dependencies', () => {
    test('should have all package.json dependencies available', () => {
      const packageJson = require('../../../package.json');
      const dependencies = packageJson.dependencies;
      
      // Test critical dependencies
      const criticalDeps = [
        'express',
        'helmet', 
        'express-session',
        'express-rate-limit',
        'sqlite3',
        'uuid',
        'axios',
        'cors',
        'dotenv',
        'connect-sqlite3'
      ];
      
      criticalDeps.forEach(dep => {
        expect(dependencies).toHaveProperty(dep);
        
        // Test that we can actually require it
        expect(() => {
          require(dep);
        }).not.toThrow(`Failed to import critical dependency: ${dep}`);
      });
    });

    test('should handle missing optional dependencies gracefully', () => {
      // Test that app can start without optional dependencies
      // This simulates the case where MAILGUN_API_KEY is not set
      const originalMailgun = process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_API_KEY;
      
      expect(() => {
        // Clear require cache to force re-evaluation
        const serverPath = require.resolve('../../../src/server');
        delete require.cache[serverPath];
        
        // Should not throw even without optional dependencies
        const app = require('../../../src/server');
        expect(app).toBeDefined();
      }).not.toThrow();
      
      // Restore environment
      if (originalMailgun) {
        process.env.MAILGUN_API_KEY = originalMailgun;
      }
    });
  });

  describe('Import Error Simulation', () => {
    test('should fail gracefully if uuid import was missing (simulation)', () => {
      // This is a meta-test that verifies our approach to testing imports
      // We can't actually break the import in this test, but we can verify
      // that the detection mechanism would work
      
      const { v4: uuidv4 } = require('uuid');
      
      // Simulate the failure case we're trying to prevent
      const simulatedUndefinedUuid = undefined;
      
      expect(() => {
        if (typeof simulatedUndefinedUuid !== 'function') {
          throw new Error('uuidv4 is not a function - this indicates a missing import');
        }
      }).toThrow('uuidv4 is not a function');
      
      // But the real import should work
      expect(typeof uuidv4).toBe('function');
      expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('Environment-Specific Dependencies', () => {
    test('should handle test environment dependencies', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      expect(() => {
        // Test dependencies that might behave differently in test env
        const supertest = require('supertest');
        const jest = require('@jest/globals');
        
        expect(supertest).toBeDefined();
        expect(jest).toBeDefined();
        
      }).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
    });

    test('should handle production environment dependencies', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.SESSION_SECRET;
      
      process.env.NODE_ENV = 'production';
      process.env.SESSION_SECRET = 'production-test-secret-that-meets-length-requirements';
      
      expect(() => {
        // Clear require cache to test production initialization
        const serverPath = require.resolve('../../../src/server');
        delete require.cache[serverPath];
        
        const app = require('../../../src/server');
        expect(app).toBeDefined();
        
      }).not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
      process.env.SESSION_SECRET = originalSecret;
    });
  });
});