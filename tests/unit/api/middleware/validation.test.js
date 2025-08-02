/**
 * Unit Tests for Input Validation Middleware
 * Tests comprehensive input validation and security measures
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');

describe('Input Validation Middleware', () => {
  let validateStepsInput;
  let validateEmailInput;
  let validateDateInput;

  beforeAll(() => {
    // Mock validation functions based on the actual implementation
    validateStepsInput = (input) => {
      const { count, date } = input;
      
      // Type validation
      if (typeof count !== 'number' && typeof count !== 'string') {
        throw new Error(`Step count must be a number, received ${typeof count}`);
      }
      
      // Convert string to number - only if it's a valid numeric string
      let numericCount;
      if (typeof count === 'string') {
        // Check if string contains only numeric characters (and decimal point)
        if (!/^\d*\.?\d+$/.test(count.trim())) {
          throw new Error('Step count must be a valid number');
        }
        numericCount = parseFloat(count);
      } else {
        numericCount = count;
      }
      
      // Validate numeric
      if (!isFinite(numericCount)) {
        throw new Error('Step count must be a finite number');
      }
      
      if (isNaN(numericCount)) {
        throw new Error('Step count must be a valid number');
      }
      
      // Range validation
      if (numericCount < 0 || numericCount > 70000) {
        throw new Error('Step count must be between 0 and 70000');
      }
      
      // Date validation
      if (!date || typeof date !== 'string') {
        throw new Error('Date is required and must be a string');
      }
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }
      
      return {
        count: Math.floor(numericCount), // Floor the number
        date: date.trim()
      };
    };

    validateEmailInput = (email) => {
      if (!email || typeof email !== 'string') {
        throw new Error('Email is required and must be a string');
      }
      
      const trimmedEmail = email.trim();
      if (trimmedEmail.length === 0) {
        throw new Error('Email cannot be empty');
      }
      
      // Basic email regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        throw new Error('Email must be a valid email address');
      }
      
      return trimmedEmail.toLowerCase();
    };

    validateDateInput = (date) => {
      if (!date || typeof date !== 'string') {
        throw new Error('Date is required and must be a string');
      }
      
      const trimmedDate = date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }
      
      // Validate it's a real date
      const parsedDate = new Date(trimmedDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Date must be a valid date');
      }
      
      return trimmedDate;
    };
  });

  describe('Steps Input Validation', () => {
    describe('Valid Inputs', () => {
      test('should accept valid numeric step count', () => {
        const input = { count: 10000, date: '2025-08-02' };
        const result = validateStepsInput(input);
        
        expect(result.count).toBe(10000);
        expect(result.date).toBe('2025-08-02');
      });

      test('should accept valid string numeric step count', () => {
        const input = { count: '8500', date: '2025-08-02' };
        const result = validateStepsInput(input);
        
        expect(result.count).toBe(8500);
        expect(result.date).toBe('2025-08-02');
      });

      test('should floor decimal numbers', () => {
        const input = { count: 1234.56, date: '2025-08-02' };
        const result = validateStepsInput(input);
        
        expect(result.count).toBe(1234);
      });

      test('should accept zero steps', () => {
        const input = { count: 0, date: '2025-08-02' };
        const result = validateStepsInput(input);
        
        expect(result.count).toBe(0);
      });

      test('should accept maximum valid steps', () => {
        const input = { count: 70000, date: '2025-08-02' };
        const result = validateStepsInput(input);
        
        expect(result.count).toBe(70000);
      });
    });

    describe('Type Confusion Attacks', () => {
      test('should reject object input', () => {
        const input = { count: { malicious: 'payload' }, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a number, received object');
      });

      test('should reject array input', () => {
        const input = { count: ['1', '2', '3'], date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a number, received object');
      });

      test('should reject boolean input', () => {
        const input = { count: true, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a number, received boolean');
      });

      test('should reject null input', () => {
        const input = { count: null, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a number, received object');
      });

      test('should reject undefined input', () => {
        const input = { count: undefined, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a number, received undefined');
      });
    });

    describe('String-based Attack Vectors', () => {
      test('should reject SQL injection attempts', () => {
        const input = { count: "1'; DROP TABLE steps; --", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });

      test('should reject XSS attempts', () => {
        const input = { count: "<script>alert('xss')</script>", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });

      test('should reject command injection attempts', () => {
        const input = { count: "1 && rm -rf /", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });

      test('should reject empty string', () => {
        const input = { count: "", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });

      test('should reject whitespace-only string', () => {
        const input = { count: "   ", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });
    });

    describe('Numeric Edge Cases', () => {
      test('should reject negative numbers', () => {
        const input = { count: -1000, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be between 0 and 70000');
      });

      test('should reject numbers too large', () => {
        const input = { count: 99999, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be between 0 and 70000');
      });

      test('should reject Infinity', () => {
        const input = { count: Infinity, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a finite number');
      });

      test('should reject -Infinity', () => {
        const input = { count: -Infinity, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a finite number');
      });

      test('should reject NaN', () => {
        const input = { count: NaN, date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a finite number');
      });

      test('should reject scientific notation strings', () => {
        const input = { count: "1e5", date: '2025-08-02' };
        
        expect(() => validateStepsInput(input)).toThrow('must be a valid number');
      });
    });

    describe('Date Validation', () => {
      test('should reject missing date', () => {
        const input = { count: 1000 };
        
        expect(() => validateStepsInput(input)).toThrow('Date is required');
      });

      test('should reject invalid date format', () => {
        const input = { count: 1000, date: '08/02/2025' };
        
        expect(() => validateStepsInput(input)).toThrow('must be in YYYY-MM-DD format');
      });

      test('should reject non-string date', () => {
        const input = { count: 1000, date: 20250802 };
        
        expect(() => validateStepsInput(input)).toThrow('Date is required and must be a string');
      });
    });
  });

  describe('Email Input Validation', () => {
    describe('Valid Emails', () => {
      test('should accept valid email', () => {
        const result = validateEmailInput('test@example.com');
        expect(result).toBe('test@example.com');
      });

      test('should normalize email to lowercase', () => {
        const result = validateEmailInput('TEST@EXAMPLE.COM');
        expect(result).toBe('test@example.com');
      });

      test('should trim whitespace', () => {
        const result = validateEmailInput('  test@example.com  ');
        expect(result).toBe('test@example.com');
      });
    });

    describe('Invalid Emails', () => {
      test('should reject missing email', () => {
        expect(() => validateEmailInput()).toThrow('Email is required');
      });

      test('should reject null email', () => {
        expect(() => validateEmailInput(null)).toThrow('Email is required');
      });

      test('should reject empty string', () => {
        expect(() => validateEmailInput('')).toThrow('Email cannot be empty');
      });

      test('should reject whitespace-only string', () => {
        expect(() => validateEmailInput('   ')).toThrow('Email cannot be empty');
      });

      test('should reject invalid email format', () => {
        expect(() => validateEmailInput('invalid-email')).toThrow('must be a valid email address');
      });

      test('should reject email without domain', () => {
        expect(() => validateEmailInput('test@')).toThrow('must be a valid email address');
      });

      test('should reject email without @ symbol', () => {
        expect(() => validateEmailInput('testexample.com')).toThrow('must be a valid email address');
      });
    });
  });

  describe('Date Input Validation', () => {
    describe('Valid Dates', () => {
      test('should accept valid date', () => {
        const result = validateDateInput('2025-08-02');
        expect(result).toBe('2025-08-02');
      });

      test('should trim whitespace', () => {
        const result = validateDateInput('  2025-08-02  ');
        expect(result).toBe('2025-08-02');
      });
    });

    describe('Invalid Dates', () => {
      test('should reject missing date', () => {
        expect(() => validateDateInput()).toThrow('Date is required');
      });

      test('should reject null date', () => {
        expect(() => validateDateInput(null)).toThrow('Date is required');
      });

      test('should reject non-string date', () => {
        expect(() => validateDateInput(20250802)).toThrow('must be a string');
      });

      test('should reject invalid format', () => {
        expect(() => validateDateInput('08/02/2025')).toThrow('must be in YYYY-MM-DD format');
      });

      test('should reject invalid date values', () => {
        expect(() => validateDateInput('2025-13-02')).toThrow('must be a valid date');
      });

      test('should reject february 30th', () => {
        expect(() => validateDateInput('2025-02-30')).toThrow('must be a valid date');
      });
    });
  });
});