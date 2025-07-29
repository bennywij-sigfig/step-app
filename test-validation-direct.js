#!/usr/bin/env node

/**
 * Direct unit tests for the validateNumericInput function
 */

// Copy the validation function for testing
function validateNumericInput(value, fieldName, min = 0, max = Number.MAX_SAFE_INTEGER) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  
  // Type check and conversion
  if (typeof value !== 'number') {
    // Allow string numbers but validate carefully
    if (typeof value === 'string') {
      // Check for empty string
      if (value.trim() === '') {
        throw new Error(`${fieldName} cannot be empty`);
      }
      
      // Check for non-numeric strings
      if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
        throw new Error(`${fieldName} must be a valid number`);
      }
      
      const parsed = parseFloat(value.trim());
      if (isNaN(parsed)) {
        throw new Error(`${fieldName} must be a valid number`);
      }
      value = parsed;
    } else {
      // Reject objects, arrays, booleans, etc.
      throw new Error(`${fieldName} must be a number, received ${typeof value}`);
    }
  }
  
  // NaN/Infinity check
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  
  // Range validation
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  
  // Ensure integer for step counts
  return Math.floor(Math.abs(value)); // Also ensure positive
}

// Test cases
const tests = [
  // Should fail
  { input: null, shouldFail: true, expectedError: 'is required' },
  { input: undefined, shouldFail: true, expectedError: 'is required' },
  { input: {}, shouldFail: true, expectedError: 'must be a number, received object' },
  { input: [], shouldFail: true, expectedError: 'must be a number, received object' },
  { input: true, shouldFail: true, expectedError: 'must be a number, received boolean' },
  { input: "", shouldFail: true, expectedError: 'cannot be empty' },
  { input: "   ", shouldFail: true, expectedError: 'cannot be empty' },
  { input: "abc", shouldFail: true, expectedError: 'must be a valid number' },
  { input: "1e5", shouldFail: true, expectedError: 'must be a valid number' },
  { input: "1 OR 1=1", shouldFail: true, expectedError: 'must be a valid number' },
  { input: Infinity, shouldFail: true, expectedError: 'must be a finite number' },
  { input: NaN, shouldFail: true, expectedError: 'must be a finite number' },
  { input: -100, shouldFail: true, expectedError: 'must be between 0 and 70000' },
  { input: 80000, shouldFail: true, expectedError: 'must be between 0 and 70000' },
  
  // Should pass
  { input: 0, shouldFail: false, expected: 0 },
  { input: 1000, shouldFail: false, expected: 1000 },
  { input: "5000", shouldFail: false, expected: 5000 },
  { input: "0", shouldFail: false, expected: 0 },
  { input: 1234.56, shouldFail: false, expected: 1234 }, // Should floor
  { input: -100, shouldFail: false, expected: 100, min: -1000 }, // Should abs
];

console.log('🧪 Testing validateNumericInput function directly...\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  try {
    const result = validateNumericInput(
      test.input, 
      'Test field', 
      test.min || 0, 
      test.max || 70000
    );
    
    if (test.shouldFail) {
      console.log(`❌ Test ${index + 1}: Expected failure but got ${result}`);
      failed++;
    } else if (result === test.expected) {
      console.log(`✅ Test ${index + 1}: Passed (${test.input} → ${result})`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: Expected ${test.expected}, got ${result}`);
      failed++;
    }
  } catch (error) {
    if (test.shouldFail && error.message.includes(test.expectedError)) {
      console.log(`✅ Test ${index + 1}: Correctly failed (${error.message})`);
      passed++;
    } else if (test.shouldFail) {
      console.log(`❌ Test ${index + 1}: Wrong error message: ${error.message}`);
      failed++;
    } else {
      console.log(`❌ Test ${index + 1}: Unexpected error: ${error.message}`);
      failed++;
    }
  }
});

console.log(`\n🎯 Results: ${passed} passed, ${failed} failed`);
console.log(`📊 Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('🎉 All validation tests passed!');
} else {
  console.log('⚠️  Some tests failed - validation needs fixes');
  process.exit(1);
}