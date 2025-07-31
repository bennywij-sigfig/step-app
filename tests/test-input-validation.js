#!/usr/bin/env node

/**
 * Comprehensive Input Validation Security Test
 * Tests malicious inputs against the new validation system
 */

const http = require('http');
const https = require('https');

// Test configuration
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://step-app-4x-yhw.fly.dev' 
  : 'http://localhost:3000';

const USE_HTTPS = BASE_URL.startsWith('https');

console.log(`🔍 Testing input validation security against: ${BASE_URL}`);
console.log('=' .repeat(60));

// Test cases for malicious inputs
const testCases = [
  // Type confusion attacks
  { name: 'String injection', count: "DELETE FROM users", expectedError: 'must be a valid number' },
  { name: 'Object injection', count: { malicious: 'payload' }, expectedError: 'must be a number, received object' },
  { name: 'Array injection', count: ['1', '2', '3'], expectedError: 'must be a number, received object' },
  { name: 'Boolean injection', count: true, expectedError: 'must be a number, received boolean' },
  { name: 'Null injection', count: null, expectedError: 'is required' },
  { name: 'Undefined injection', count: undefined, expectedError: 'is required' },
  
  // String-based numeric attacks
  { name: 'SQL injection string', count: "1'; DROP TABLE steps; --", expectedError: 'must be a valid number' },
  { name: 'XSS attempt', count: "<script>alert('xss')</script>", expectedError: 'must be a valid number' },
  { name: 'Command injection', count: "1 && rm -rf /", expectedError: 'must be a valid number' },
  { name: 'Empty string', count: "", expectedError: 'cannot be empty' },
  { name: 'Whitespace only', count: "   ", expectedError: 'cannot be empty' },
  
  // Numeric edge cases
  { name: 'Negative number', count: -1000, expectedError: 'Step count must be between 0 and 70000' },
  { name: 'Too large number', count: 99999, expectedError: 'Step count must be between 0 and 70000' },
  { name: 'Float number', count: 1234.56, expectedResult: 1234 }, // Should be floored
  { name: 'Scientific notation', count: "1e5", expectedError: 'must be a valid number' },
  { name: 'Infinity', count: Infinity, expectedError: 'must be a finite number' },
  { name: 'NaN', count: NaN, expectedError: 'must be a finite number' },
  
  // Valid cases that should work
  { name: 'Valid number', count: 5000, expectedResult: 5000 },
  { name: 'Valid string number', count: "3000", expectedResult: 3000 },
  { name: 'Zero', count: 0, expectedResult: 0 },
  { name: 'Max valid', count: 70000, expectedResult: 70000 },
];

// Helper function to make HTTP/HTTPS requests
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const client = USE_HTTPS ? https : http;
    
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: body, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Get CSRF token (for testing, we'll mock this)
async function runTests() {
  let passed = 0;
  let failed = 0;
  
  console.log(`Testing ${testCases.length} input validation scenarios...\n`);
  
  for (const testCase of testCases) {
    try {
      const testData = {
        date: '2025-07-28',
        count: testCase.count,
        csrfToken: 'mock-token' // In real test, we'd get this properly
      };
      
      const options = {
        hostname: USE_HTTPS ? BASE_URL.replace('https://', '') : 'localhost',
        port: USE_HTTPS ? 443 : 3000,
        path: '/api/steps',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': JSON.stringify(testData).length
        }
      };
      
      const response = await makeRequest(options, testData);
      
      // Analyze response
      let testPassed = false;
      let actualResult = null;
      
      if (testCase.expectedError) {
        // Expecting an error
        if (response.status === 400 || response.status === 403) {
          const errorMessage = response.body.error || '';
          if (errorMessage.includes(testCase.expectedError)) {
            testPassed = true;
            actualResult = `✅ Correctly rejected: ${errorMessage}`;
          } else {
            actualResult = `❌ Wrong error: ${errorMessage}`;
          }
        } else {
          actualResult = `❌ Should have failed but got status ${response.status}`;
        }
      } else if (testCase.expectedResult !== undefined) {
        // Expecting success with specific result
        if (response.status === 200 && response.body.count === testCase.expectedResult) {
          testPassed = true;
          actualResult = `✅ Correctly processed: ${response.body.count}`;
        } else {
          actualResult = `❌ Expected ${testCase.expectedResult}, got ${response.body.count || response.status}`;
        }
      }
      
      console.log(`${testCase.name.padEnd(25)} | ${actualResult}`);
      
      if (testPassed) {
        passed++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.log(`${testCase.name.padEnd(25)} | ❌ Network error: ${error.message}`);
      failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`🎯 Test Results: ${passed} passed, ${failed} failed`);
  console.log(`📊 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('🎉 All input validation tests passed! Security is strong.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Review the validation logic.');
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testCases };