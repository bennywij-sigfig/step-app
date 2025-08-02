/**
 * Unit Tests for Frontend JavaScript Utilities
 * Tests client-side utility functions
 */

const { describe, test, expect } = require('@jest/globals');

describe('Frontend Utilities', () => {
  
  // Mock DOM environment for testing
  const mockWindow = {
    innerWidth: 1024,
    innerHeight: 768
  };
  
  const mockLocalStorage = {
    storage: {},
    getItem: function(key) {
      return this.storage[key] || null;
    },
    setItem: function(key, value) {
      this.storage[key] = value;
    },
    clear: function() {
      this.storage = {};
    }
  };

  // Mock the frontend utility functions
  const frontendUtils = {
    isMobileViewport: (width = mockWindow.innerWidth) => {
      return width <= 768;
    },

    formatReportingRate: (rate, color = '#28a745', isMobile = false) => {
      const percentage = rate >= 1 ? Math.round(rate) : rate;
      if (isMobile) {
        return `<span style="color: ${color}; font-size: 0.7em; margin-left: 6px;">📋 ${percentage}%</span>`;
      } else {
        return `<span style="color: ${color}; font-size: 0.7em; margin-left: 6px;">📋 ${percentage}% reporting</span>`;
      }
    },

    formatMemberCount: (count, isMobile = false) => {
      if (isMobile) {
        return `<span style="color: #888; font-size: 0.75em; margin-left: 6px;">👥 ${count}</span>`;
      } else {
        return `<span style="color: #888; font-size: 0.75em; margin-left: 6px;">👥 ${count} member${count !== 1 ? 's' : ''}</span>`;
      }
    },

    validateStepsInput: (value) => {
      if (value === null || value === undefined || value === '') {
        return { valid: false, error: 'Steps value is required' };
      }

      const numValue = Number(value);
      
      if (isNaN(numValue)) {
        return { valid: false, error: 'Steps must be a valid number' };
      }

      if (!isFinite(numValue)) {
        return { valid: false, error: 'Steps must be a finite number' };
      }

      if (numValue < 0) {
        return { valid: false, error: 'Steps cannot be negative' };
      }

      if (numValue > 70000) {
        return { valid: false, error: 'Steps cannot exceed 70,000' };
      }

      return { valid: true, value: Math.floor(numValue) };
    },

    sanitizeUserInput: (input) => {
      if (typeof input !== 'string') {
        return '';
      }
      
      // Remove HTML tags and dangerous characters
      return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>&"']/g, '') // Remove dangerous characters
        .trim();
    },

    formatNumber: (num, locale = 'en-US') => {
      if (typeof num !== 'number' || !isFinite(num)) {
        return '0';
      }
      
      return num.toLocaleString(locale);
    },

    calculateStepsPerDay: (totalSteps, days) => {
      if (!days || days === 0) return 0;
      return Math.round(totalSteps / days);
    },

    isValidDate: (dateString) => {
      if (!dateString || typeof dateString !== 'string') {
        return false;
      }

      // Check YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
      }

      const date = new Date(dateString);
      return !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0];
    }
  };

  describe('Mobile Detection', () => {
    test('should detect mobile viewport correctly', () => {
      expect(frontendUtils.isMobileViewport(320)).toBe(true);
      expect(frontendUtils.isMobileViewport(768)).toBe(true);
      expect(frontendUtils.isMobileViewport(769)).toBe(false);
      expect(frontendUtils.isMobileViewport(1024)).toBe(false);
    });

    test('should handle edge cases', () => {
      expect(frontendUtils.isMobileViewport(0)).toBe(true);
      expect(frontendUtils.isMobileViewport(-1)).toBe(true);
    });
  });

  describe('Reporting Rate Formatting', () => {
    test('should format reporting rate for desktop', () => {
      const result = frontendUtils.formatReportingRate(75.5, '#28a745', false);
      expect(result).toContain('76% reporting');
      expect(result).toContain('color: #28a745');
      expect(result).toContain('📋');
    });

    test('should format reporting rate for mobile', () => {
      const result = frontendUtils.formatReportingRate(75.5, '#28a745', true);
      expect(result).toContain('76%');
      expect(result).not.toContain('reporting');
      expect(result).toContain('📋');
    });

    test('should handle decimal rates correctly', () => {
      const result = frontendUtils.formatReportingRate(0.75, '#28a745', false);
      expect(result).toContain('0.75% reporting');
    });

    test('should round rates >= 1', () => {
      const result = frontendUtils.formatReportingRate(85.7, '#28a745', false);
      expect(result).toContain('86% reporting');
    });

    test('should use default color', () => {
      const result = frontendUtils.formatReportingRate(50);
      expect(result).toContain('color: #28a745');
    });
  });

  describe('Member Count Formatting', () => {
    test('should format single member for desktop', () => {
      const result = frontendUtils.formatMemberCount(1, false);
      expect(result).toContain('1 member');
      expect(result).not.toContain('members');
      expect(result).toContain('👥');
    });

    test('should format multiple members for desktop', () => {
      const result = frontendUtils.formatMemberCount(5, false);
      expect(result).toContain('5 members');
      expect(result).toContain('👥');
    });

    test('should format member count for mobile', () => {
      const result = frontendUtils.formatMemberCount(5, true);
      expect(result).toContain('👥 5');
      expect(result).not.toContain('member');
    });

    test('should handle zero members', () => {
      const result = frontendUtils.formatMemberCount(0, false);
      expect(result).toContain('0 members');
    });
  });

  describe('Steps Input Validation', () => {
    test('should accept valid step counts', () => {
      expect(frontendUtils.validateStepsInput(10000)).toEqual({
        valid: true,
        value: 10000
      });
      expect(frontendUtils.validateStepsInput('5000')).toEqual({
        valid: true,
        value: 5000
      });
      expect(frontendUtils.validateStepsInput(0)).toEqual({
        valid: true,
        value: 0
      });
    });

    test('should floor decimal values', () => {
      expect(frontendUtils.validateStepsInput(1234.56)).toEqual({
        valid: true,
        value: 1234
      });
    });

    test('should reject invalid inputs', () => {
      expect(frontendUtils.validateStepsInput(null).valid).toBe(false);
      expect(frontendUtils.validateStepsInput('').valid).toBe(false);
      expect(frontendUtils.validateStepsInput('abc').valid).toBe(false);
      expect(frontendUtils.validateStepsInput(-100).valid).toBe(false);
      expect(frontendUtils.validateStepsInput(100000).valid).toBe(false);
      expect(frontendUtils.validateStepsInput(Infinity).valid).toBe(false);
      expect(frontendUtils.validateStepsInput(NaN).valid).toBe(false);
    });

    test('should provide appropriate error messages', () => {
      expect(frontendUtils.validateStepsInput(null).error).toContain('required');
      expect(frontendUtils.validateStepsInput('abc').error).toContain('valid number');
      expect(frontendUtils.validateStepsInput(-100).error).toContain('negative');
      expect(frontendUtils.validateStepsInput(100000).error).toContain('exceed');
    });
  });

  describe('Input Sanitization', () => {
    test('should remove HTML tags', () => {
      const result = frontendUtils.sanitizeUserInput('<script>alert("xss")</script>Hello');
      expect(result).toBe('Hello');
    });

    test('should remove dangerous characters', () => {
      const result = frontendUtils.sanitizeUserInput('Hello<>&"\'World');
      expect(result).toBe('HelloWorld');
    });

    test('should trim whitespace', () => {
      const result = frontendUtils.sanitizeUserInput('  Hello World  ');
      expect(result).toBe('Hello World');
    });

    test('should handle non-string input', () => {
      expect(frontendUtils.sanitizeUserInput(123)).toBe('');
      expect(frontendUtils.sanitizeUserInput(null)).toBe('');
      expect(frontendUtils.sanitizeUserInput(undefined)).toBe('');
    });
  });

  describe('Number Formatting', () => {
    test('should format numbers with locale-specific separators', () => {
      expect(frontendUtils.formatNumber(1234)).toBe('1,234');
      expect(frontendUtils.formatNumber(1234567)).toBe('1,234,567');
    });

    test('should handle edge cases', () => {
      expect(frontendUtils.formatNumber(0)).toBe('0');
      expect(frontendUtils.formatNumber(NaN)).toBe('0');
      expect(frontendUtils.formatNumber(Infinity)).toBe('0');
      expect(frontendUtils.formatNumber(-1234)).toBe('-1,234');
    });

    test('should handle non-number input', () => {
      expect(frontendUtils.formatNumber('abc')).toBe('0');
      expect(frontendUtils.formatNumber(null)).toBe('0');
    });
  });

  describe('Steps Per Day Calculation', () => {
    test('should calculate steps per day correctly', () => {
      expect(frontendUtils.calculateStepsPerDay(10000, 5)).toBe(2000);
      expect(frontendUtils.calculateStepsPerDay(15000, 7)).toBe(2143); // Rounded
    });

    test('should handle edge cases', () => {
      expect(frontendUtils.calculateStepsPerDay(10000, 0)).toBe(0);
      expect(frontendUtils.calculateStepsPerDay(0, 5)).toBe(0);
      expect(frontendUtils.calculateStepsPerDay(10000, null)).toBe(0);
    });
  });

  describe('Date Validation', () => {
    test('should validate correct date formats', () => {
      expect(frontendUtils.isValidDate('2025-08-02')).toBe(true);
      expect(frontendUtils.isValidDate('2025-12-31')).toBe(true);
      expect(frontendUtils.isValidDate('2025-01-01')).toBe(true);
    });

    test('should reject invalid date formats', () => {
      expect(frontendUtils.isValidDate('08/02/2025')).toBe(false);
      expect(frontendUtils.isValidDate('2025-8-2')).toBe(false);
      expect(frontendUtils.isValidDate('invalid-date')).toBe(false);
      expect(frontendUtils.isValidDate('')).toBe(false);
      expect(frontendUtils.isValidDate(null)).toBe(false);
    });

    test('should reject invalid date values', () => {
      expect(frontendUtils.isValidDate('2025-13-01')).toBe(false);
      expect(frontendUtils.isValidDate('2025-02-30')).toBe(false);
      expect(frontendUtils.isValidDate('2025-04-31')).toBe(false);
    });
  });
});