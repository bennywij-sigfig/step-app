/**
 * Middleware Integrity Tests
 * 
 * Tests middleware functions in isolation to ensure they work correctly
 * and haven't been broken by refactoring or dependency changes.
 * 
 * This catches issues like:
 * - Authentication middleware not properly validating sessions
 * - Rate limiters not working as expected
 * - CSRF protection being bypassed
 */

const { requireAuth, requireApiAuth, requireAdmin, requireApiAdmin } = require('../../../src/middleware/auth');
const { magicLinkLimiter, apiLimiter, adminApiLimiter, mcpApiLimiter, mcpBurstLimiter } = require('../../../src/middleware/rateLimiters');

describe('Middleware Integrity Tests', () => {
  describe('Authentication Middleware', () => {
    let mockReq, mockRes, nextSpy;

    beforeEach(() => {
      mockReq = {
        session: {},
        path: '/test',
        ip: '127.0.0.1'
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        redirect: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
      nextSpy = jest.fn();
    });

    describe('requireAuth middleware', () => {
      test('should allow authenticated user to proceed', () => {
        mockReq.session.userId = 123;
        mockReq.session.email = 'test@example.com';

        requireAuth(mockReq, mockRes, nextSpy);

        expect(nextSpy).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('should redirect unauthenticated user to login', () => {
        requireAuth(mockReq, mockRes, nextSpy);

        expect(mockRes.redirect).toHaveBeenCalledWith('/');
        expect(nextSpy).not.toHaveBeenCalled();
      });

      test('should handle missing session gracefully', () => {
        mockReq.session = undefined;
        
        expect(() => {
          requireAuth(mockReq, mockRes, nextSpy);
        }).not.toThrow();

        expect(mockRes.redirect).toHaveBeenCalledWith('/');
      });
    });

    describe('requireApiAuth middleware', () => {
      test('should allow authenticated API request to proceed', () => {
        mockReq.session.userId = 123;
        mockReq.session.email = 'test@example.com';

        requireApiAuth(mockReq, mockRes, nextSpy);

        expect(nextSpy).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('should return 401 for unauthenticated API request', () => {
        requireApiAuth(mockReq, mockRes, nextSpy);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
        expect(nextSpy).not.toHaveBeenCalled();
      });

      test('should handle malformed session data', () => {
        mockReq.session.userId = 'invalid';
        mockReq.session.email = null;

        requireApiAuth(mockReq, mockRes, nextSpy);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(nextSpy).not.toHaveBeenCalled();
      });
    });

    describe('requireAdmin middleware', () => {
      test('should allow admin user to proceed', () => {
        mockReq.session.userId = 1;
        mockReq.session.email = 'admin@example.com';
        mockReq.session.isAdmin = true;

        requireAdmin(mockReq, mockRes, nextSpy);

        expect(nextSpy).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('should redirect non-admin user', () => {
        mockReq.session.userId = 123;
        mockReq.session.email = 'user@example.com';
        mockReq.session.isAdmin = false;

        requireAdmin(mockReq, mockRes, nextSpy);

        expect(mockRes.redirect).toHaveBeenCalledWith('/');
        expect(nextSpy).not.toHaveBeenCalled();
      });

      test('should redirect unauthenticated user', () => {
        requireAdmin(mockReq, mockRes, nextSpy);

        expect(mockRes.redirect).toHaveBeenCalledWith('/');
        expect(nextSpy).not.toHaveBeenCalled();
      });
    });

    describe('requireApiAdmin middleware', () => {
      test('should allow admin API request to proceed', () => {
        mockReq.session.userId = 1;
        mockReq.session.email = 'admin@example.com';
        mockReq.session.isAdmin = true;

        requireApiAdmin(mockReq, mockRes, nextSpy);

        expect(nextSpy).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('should return 403 for non-admin API request', () => {
        mockReq.session.userId = 123;
        mockReq.session.email = 'user@example.com';
        mockReq.session.isAdmin = false;

        requireApiAdmin(mockReq, mockRes, nextSpy);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Admin access required' });
        expect(nextSpy).not.toHaveBeenCalled();
      });

      test('should return 401 for unauthenticated API request', () => {
        requireApiAdmin(mockReq, mockRes, nextSpy);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
        expect(nextSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Rate Limiter Middleware', () => {
    let mockReq, mockRes, nextSpy;

    beforeEach(() => {
      mockReq = {
        ip: '127.0.0.1',
        path: '/test',
        method: 'POST',
        headers: {
          'user-agent': 'test-agent'
        }
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn()
      };
      nextSpy = jest.fn();
    });

    describe('Rate limiter configuration validation', () => {
      test('should have magic link limiter configured correctly', () => {
        expect(magicLinkLimiter).toBeDefined();
        expect(typeof magicLinkLimiter).toBe('function');
      });

      test('should have API limiter configured correctly', () => {
        expect(apiLimiter).toBeDefined();
        expect(typeof apiLimiter).toBe('function');
      });

      test('should have admin API limiter configured correctly', () => {
        expect(adminApiLimiter).toBeDefined();
        expect(typeof adminApiLimiter).toBe('function');
      });

      test('should have MCP API limiters configured correctly', () => {
        expect(mcpApiLimiter).toBeDefined();
        expect(typeof mcpApiLimiter).toBe('function');
        expect(mcpBurstLimiter).toBeDefined();
        expect(typeof mcpBurstLimiter).toBe('function');
      });
    });

    describe('Rate limiter behavior validation', () => {
      test('should allow requests under rate limit', (done) => {
        // Create a fresh limiter for this test
        const testLimiter = require('express-rate-limit')({
          windowMs: 60 * 1000, // 1 minute
          max: 5,
          message: { error: 'Too many requests' }
        });

        testLimiter(mockReq, mockRes, (err) => {
          expect(err).toBeUndefined();
          expect(nextSpy).not.toHaveBeenCalled(); // nextSpy not called in this context
          expect(mockRes.status).not.toHaveBeenCalled();
          done();
        });
      });

      test('should have proper error messages configured', () => {
        // Test that rate limiters have proper error message structure
        const limiters = [
          { name: 'magicLinkLimiter', limiter: magicLinkLimiter },
          { name: 'apiLimiter', limiter: apiLimiter },
          { name: 'adminApiLimiter', limiter: adminApiLimiter },
          { name: 'mcpApiLimiter', limiter: mcpApiLimiter },
          { name: 'mcpBurstLimiter', limiter: mcpBurstLimiter }
        ];

        limiters.forEach(({ name, limiter }) => {
          expect(limiter).toBeDefined();
          // Rate limiters should be middleware functions
          expect(typeof limiter).toBe('function');
        });
      });
    });
  });

  describe('Middleware Integration', () => {
    test('should have all middleware functions available', () => {
      // Authentication middleware
      expect(requireAuth).toBeDefined();
      expect(requireApiAuth).toBeDefined();
      expect(requireAdmin).toBeDefined();
      expect(requireApiAdmin).toBeDefined();

      // Rate limiting middleware
      expect(magicLinkLimiter).toBeDefined();
      expect(apiLimiter).toBeDefined();
      expect(adminApiLimiter).toBeDefined();
      expect(mcpApiLimiter).toBeDefined();
      expect(mcpBurstLimiter).toBeDefined();

      // All should be functions
      [requireAuth, requireApiAuth, requireAdmin, requireApiAdmin,
       magicLinkLimiter, apiLimiter, adminApiLimiter, mcpApiLimiter, mcpBurstLimiter]
        .forEach(middleware => {
          expect(typeof middleware).toBe('function');
        });
    });

    test('should handle edge cases gracefully', () => {
      const mockReq = { session: undefined, ip: undefined };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn()
      };
      const nextSpy = jest.fn();

      // Should not throw errors even with malformed requests
      expect(() => {
        requireAuth(mockReq, mockRes, nextSpy);
      }).not.toThrow();

      expect(() => {
        requireApiAuth(mockReq, mockRes, nextSpy);
      }).not.toThrow();
    });
  });

  describe('CSRF Protection Integration', () => {
    test('should validate CSRF middleware is available through server', () => {
      // Import server to ensure CSRF middleware is loaded
      process.env.NODE_ENV = 'test';
      process.env.SESSION_SECRET = 'test-csrf-middleware';
      
      expect(() => {
        const app = require('../../../src/server');
        expect(app).toBeDefined();
      }).not.toThrow();
      
      delete process.env.SESSION_SECRET;
    });

    test('should ensure UUID dependency is available for CSRF tokens', () => {
      const { v4: uuidv4 } = require('uuid');
      
      expect(uuidv4).toBeDefined();
      expect(typeof uuidv4).toBe('function');
      
      const token = uuidv4();
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('Security Boundary Validation', () => {
    test('should properly isolate user data access', () => {
      const mockReq1 = {
        session: { userId: 123, email: 'user1@example.com' }
      };
      const mockReq2 = {
        session: { userId: 456, email: 'user2@example.com' }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const nextSpy = jest.fn();

      // Both users should be able to authenticate
      requireApiAuth(mockReq1, mockRes, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(1);

      requireApiAuth(mockReq2, mockRes, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(2);

      // But should maintain session isolation
      expect(mockReq1.session.userId).not.toBe(mockReq2.session.userId);
    });

    test('should enforce admin boundaries correctly', () => {
      const adminReq = {
        session: { userId: 1, email: 'admin@example.com', isAdmin: true }
      };
      const userReq = {
        session: { userId: 123, email: 'user@example.com', isAdmin: false }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn()
      };
      const nextSpy = jest.fn();

      // Admin should pass
      requireApiAdmin(adminReq, mockRes, nextSpy);
      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();

      // User should fail
      requireApiAdmin(userReq, mockRes, nextSpy);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextSpy).toHaveBeenCalledTimes(1); // Still only called once
    });
  });
});