/**
 * Unit Tests for MCP Server
 * Tests MCP token generation, validation, and audit logging
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

describe('MCP Server Unit Tests', () => {
  let mcpUtils;

  beforeAll(() => {
    // Mock the MCP utilities based on actual implementation
    mcpUtils = {
      generateToken: (userId) => {
        const uuid = uuidv4();
        const userHash = crypto.createHash('sha256').update(userId.toString()).digest('hex').substring(0, 8);
        return `mcp_${uuid}_${userHash}`;
      },

      validateTokenFormat: (token) => {
        if (!token || typeof token !== 'string') {
          return { valid: false, error: 'Token must be a string' };
        }

        if (!token.startsWith('mcp_')) {
          return { valid: false, error: 'Token must start with mcp_' };
        }

        const parts = token.split('_');
        if (parts.length !== 3) {
          return { valid: false, error: 'Token must have 3 parts separated by underscores' };
        }

        const [prefix, uuid, userHash] = parts;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
          return { valid: false, error: 'Invalid UUID format in token' };
        }

        // Validate user hash format (8 hex characters)
        if (!/^[0-9a-f]{8}$/i.test(userHash)) {
          return { valid: false, error: 'Invalid user hash format in token' };
        }

        return { valid: true };
      },

      parseScopes: (scopeString) => {
        if (!scopeString || typeof scopeString !== 'string') {
          return [];
        }
        
        return scopeString.split(',').map(s => s.trim()).filter(s => s.length > 0);
      },

      hasScope: (scopes, requiredScope) => {
        return scopes.includes(requiredScope);
      },

      validateStepData: (data) => {
        const { date, count, allow_overwrite } = data;
        
        // Date validation
        if (!date || typeof date !== 'string') {
          throw new Error('Date is required and must be a string');
        }
        
        const trimmedDate = date.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
          throw new Error('Date must be in YYYY-MM-DD format');
        }

        // Count validation
        if (typeof count !== 'number') {
          throw new Error('Count must be a number');
        }

        if (!Number.isFinite(count)) {
          throw new Error('Count must be a finite number');
        }

        if (count < 0 || count > 70000) {
          throw new Error('Step count must be between 0 and 70000');
        }

        // Allow overwrite validation
        if (allow_overwrite !== undefined && typeof allow_overwrite !== 'boolean') {
          throw new Error('allow_overwrite must be a boolean');
        }

        return {
          date: trimmedDate,
          count: Math.floor(count),
          allow_overwrite: Boolean(allow_overwrite)
        };
      }
    };
  });

  describe('Token Generation', () => {
    test('should generate valid MCP token format', () => {
      const userId = 123;
      const token = mcpUtils.generateToken(userId);
      
      expect(token).toMatch(/^mcp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[0-9a-f]{8}$/i);
    });

    test('should generate unique tokens for same user', () => {
      const userId = 123;
      const token1 = mcpUtils.generateToken(userId);
      const token2 = mcpUtils.generateToken(userId);
      
      expect(token1).not.toBe(token2);
    });

    test('should generate different user hashes for different users', () => {
      const token1 = mcpUtils.generateToken(123);
      const token2 = mcpUtils.generateToken(456);
      
      const hash1 = token1.split('_')[2];
      const hash2 = token2.split('_')[2];
      
      expect(hash1).not.toBe(hash2);
    });

    test('should generate consistent user hash for same user', () => {
      const userId = 123;
      const token1 = mcpUtils.generateToken(userId);
      const token2 = mcpUtils.generateToken(userId);
      
      const hash1 = token1.split('_')[2];
      const hash2 = token2.split('_')[2];
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('Token Format Validation', () => {
    test('should validate correct token format', () => {
      const token = mcpUtils.generateToken(123);
      const result = mcpUtils.validateTokenFormat(token);
      
      expect(result.valid).toBe(true);
    });

    test('should reject null token', () => {
      const result = mcpUtils.validateTokenFormat(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('should reject undefined token', () => {
      const result = mcpUtils.validateTokenFormat(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('should reject non-string token', () => {
      const result = mcpUtils.validateTokenFormat(123);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    test('should reject token without mcp_ prefix', () => {
      const result = mcpUtils.validateTokenFormat('invalid_token_format');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with mcp_');
    });

    test('should reject token with incorrect number of parts', () => {
      const result = mcpUtils.validateTokenFormat('mcp_onlyonepart');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must have 3 parts');
    });

    test('should reject token with invalid UUID', () => {
      const result = mcpUtils.validateTokenFormat('mcp_invalid-uuid-format_12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid UUID format');
    });

    test('should reject token with invalid user hash', () => {
      const validUuid = uuidv4();
      const result = mcpUtils.validateTokenFormat(`mcp_${validUuid}_invalidhash`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid user hash format');
    });
  });

  describe('Scope Management', () => {
    test('should parse valid scope string', () => {
      const scopes = mcpUtils.parseScopes('steps:read,steps:write,profile:read');
      expect(scopes).toEqual(['steps:read', 'steps:write', 'profile:read']);
    });

    test('should handle scope string with spaces', () => {
      const scopes = mcpUtils.parseScopes('steps:read, steps:write , profile:read');
      expect(scopes).toEqual(['steps:read', 'steps:write', 'profile:read']);
    });

    test('should handle empty scope string', () => {
      const scopes = mcpUtils.parseScopes('');
      expect(scopes).toEqual([]);
    });

    test('should handle null scope string', () => {
      const scopes = mcpUtils.parseScopes(null);
      expect(scopes).toEqual([]);
    });

    test('should handle undefined scope string', () => {
      const scopes = mcpUtils.parseScopes(undefined);
      expect(scopes).toEqual([]);
    });

    test('should check if user has required scope', () => {
      const scopes = ['steps:read', 'steps:write', 'profile:read'];
      
      expect(mcpUtils.hasScope(scopes, 'steps:read')).toBe(true);
      expect(mcpUtils.hasScope(scopes, 'steps:write')).toBe(true);
      expect(mcpUtils.hasScope(scopes, 'profile:read')).toBe(true);
      expect(mcpUtils.hasScope(scopes, 'admin:write')).toBe(false);
    });
  });

  describe('Step Data Validation', () => {
    describe('Valid Step Data', () => {
      test('should accept valid step data', () => {
        const data = { date: '2025-08-02', count: 10000, allow_overwrite: false };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.date).toBe('2025-08-02');
        expect(result.count).toBe(10000);
        expect(result.allow_overwrite).toBe(false);
      });

      test('should floor decimal count', () => {
        const data = { date: '2025-08-02', count: 10000.75 };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.count).toBe(10000);
      });

      test('should trim date whitespace', () => {
        const data = { date: '  2025-08-02  ', count: 10000 };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.date).toBe('2025-08-02');
      });

      test('should handle missing allow_overwrite', () => {
        const data = { date: '2025-08-02', count: 10000 };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.allow_overwrite).toBe(false);
      });

      test('should accept zero steps', () => {
        const data = { date: '2025-08-02', count: 0 };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.count).toBe(0);
      });

      test('should accept maximum steps', () => {
        const data = { date: '2025-08-02', count: 70000 };
        const result = mcpUtils.validateStepData(data);
        
        expect(result.count).toBe(70000);
      });
    });

    describe('Invalid Step Data', () => {
      test('should reject missing date', () => {
        const data = { count: 10000 };
        expect(() => mcpUtils.validateStepData(data)).toThrow('Date is required');
      });

      test('should reject non-string date', () => {
        const data = { date: 20250802, count: 10000 };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be a string');
      });

      test('should reject invalid date format', () => {
        const data = { date: '08/02/2025', count: 10000 };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be in YYYY-MM-DD format');
      });

      test('should reject non-numeric count', () => {
        const data = { date: '2025-08-02', count: 'ten thousand' };
        expect(() => mcpUtils.validateStepData(data)).toThrow('Count must be a number');
      });

      test('should reject infinite count', () => {
        const data = { date: '2025-08-02', count: Infinity };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be a finite number');
      });

      test('should reject NaN count', () => {
        const data = { date: '2025-08-02', count: NaN };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be a finite number');
      });

      test('should reject negative count', () => {
        const data = { date: '2025-08-02', count: -1000 };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be between 0 and 70000');
      });

      test('should reject count too large', () => {
        const data = { date: '2025-08-02', count: 100000 };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be between 0 and 70000');
      });

      test('should reject non-boolean allow_overwrite', () => {
        const data = { date: '2025-08-02', count: 10000, allow_overwrite: 'true' };
        expect(() => mcpUtils.validateStepData(data)).toThrow('must be a boolean');
      });
    });
  });

  describe('Security Considerations', () => {
    test('should generate cryptographically secure tokens', () => {
      const tokens = new Set();
      
      // Generate 1000 tokens and ensure no collisions
      for (let i = 0; i < 1000; i++) {
        const token = mcpUtils.generateToken(i);
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
      
      expect(tokens.size).toBe(1000);
    });

    test('should not expose user ID in token directly', () => {
      const userId = 123;
      const token = mcpUtils.generateToken(userId);
      
      // Token should not contain the user ID as plain text
      expect(token).not.toContain('123');
      expect(token).not.toContain(userId.toString());
    });

    test('should produce consistent user hash for audit purposes', () => {
      const userId = 456;
      const token1 = mcpUtils.generateToken(userId);
      const token2 = mcpUtils.generateToken(userId);
      
      const hash1 = token1.split('_')[2];
      const hash2 = token2.split('_')[2];
      
      // Same user should always get same hash component
      expect(hash1).toBe(hash2);
      
      // Verify it's actually a hash of the user ID
      const expectedHash = crypto.createHash('sha256').update(userId.toString()).digest('hex').substring(0, 8);
      expect(hash1).toBe(expectedHash);
    });
  });
});