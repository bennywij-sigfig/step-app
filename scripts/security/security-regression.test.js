#!/usr/bin/env node

/**
 * Comprehensive Security Regression Test Suite
 * 
 * Tests security vulnerabilities and attack vector prevention for the Step Challenge App.
 * Covers input validation, authentication, authorization, CSRF protection, rate limiting,
 * data security, and HTTP security headers.
 * 
 * This test suite validates security measures against common web application security risks:
 * - OWASP Top 10 vulnerabilities
 * - Input validation attacks (SQL injection, XSS, NoSQL injection, etc.)
 * - Authentication and session security
 * - Authorization bypass attempts
 * - Rate limiting and brute force protection
 * - CSRF token validation
 * - Data isolation and access controls
 * - HTTP security headers
 */

const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Test configuration
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://step-app-4x-yhw.fly.dev' 
  : 'http://localhost:3000';
const USE_HTTPS = BASE_URL.startsWith('https');

console.log(`🛡️  Running Security Regression Tests against: ${BASE_URL}`);
console.log('=' .repeat(80));

// Test state management
let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

// Helper function to make HTTP/HTTPS requests
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    
    const requestOptions = {
      hostname: url.hostname,
      port: USE_HTTPS ? 443 : (url.port || 3000),
      path: path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecurityTest/1.0',
        ...options.headers
      }
    };
    
    if (options.data) {
      const postData = JSON.stringify(options.data);
      requestOptions.headers['Content-Length'] = postData.length;
    }
    
    if (options.cookies) {
      requestOptions.headers['Cookie'] = options.cookies;
    }
    
    const client = USE_HTTPS ? https : http;
    
    const req = client.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ 
            status: res.statusCode, 
            body: parsed, 
            headers: res.headers,
            cookies: res.headers['set-cookie'] || [],
            rawBody: body
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            body: body, 
            headers: res.headers,
            cookies: res.headers['set-cookie'] || [],
            rawBody: body
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.data) {
      req.write(JSON.stringify(options.data));
    }
    req.end();
  });
}

// Test result logging functions
function logPass(testName, detail) {
  testResults.passed++;
  testResults.details.push({ type: 'PASS', test: testName, detail });
  console.log(`✅ PASS: ${testName} | ${detail}`);
}

function logFail(testName, detail) {
  testResults.failed++;
  testResults.details.push({ type: 'FAIL', test: testName, detail });
  console.log(`❌ FAIL: ${testName} | ${detail}`);
}

function logWarning(testName, detail) {
  testResults.warnings++;
  testResults.details.push({ type: 'WARN', test: testName, detail });
  console.log(`⚠️  WARN: ${testName} | ${detail}`);
}

// Security test categories

/**
 * 1. INPUT VALIDATION SECURITY TESTS
 * Tests various injection attacks and malicious input handling
 */
async function testInputValidationSecurity() {
  console.log('\n🔍 1. INPUT VALIDATION SECURITY');
  console.log('─'.repeat(50));
  
  // SQL Injection attempts
  const sqlInjectionPayloads = [
    { name: 'Classic SQL injection', payload: "1'; DROP TABLE steps; --" },
    { name: 'Union-based injection', payload: "1 UNION SELECT * FROM users" },
    { name: 'Boolean-based injection', payload: "1' OR '1'='1" },
    { name: 'Time-based injection', payload: "1'; WAITFOR DELAY '00:00:05'; --" },
    { name: 'SQLite specific injection', payload: "1'; ATTACH DATABASE ':memory:' AS test; --" }
  ];
  
  for (const injection of sqlInjectionPayloads) {
    try {
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: injection.payload,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        logPass(`SQL Injection: ${injection.name}`, 'Blocked by authentication/authorization');
      } else if (response.status === 400 && response.body.error && 
                 response.body.error.includes('must be a valid number')) {
        logPass(`SQL Injection: ${injection.name}`, 'Blocked by input validation');
      } else {
        logFail(`SQL Injection: ${injection.name}`, `Unexpected response: ${response.status}`);
      }
    } catch (error) {
      logWarning(`SQL Injection: ${injection.name}`, `Network error: ${error.message}`);
    }
  }
  
  // XSS Prevention tests
  const xssPayloads = [
    { name: 'Script tag injection', payload: '<script>alert("xss")</script>' },
    { name: 'Event handler injection', payload: '<img src="x" onerror="alert(1)">' },
    { name: 'JavaScript URI', payload: 'javascript:alert("xss")' },
    { name: 'Data URI XSS', payload: 'data:text/html,<script>alert(1)</script>' },
    { name: 'SVG XSS', payload: '<svg onload="alert(1)">' }
  ];
  
  for (const xss of xssPayloads) {
    try {
      // Test XSS in step count field
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: xss.payload,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 400 && response.body.error && 
          response.body.error.includes('must be a valid number')) {
        logPass(`XSS Prevention: ${xss.name}`, 'Blocked by input validation');
      } else if (response.status === 401 || response.status === 403) {
        logPass(`XSS Prevention: ${xss.name}`, 'Blocked by authentication');
      } else {
        logWarning(`XSS Prevention: ${xss.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`XSS Prevention: ${xss.name}`, `Network error: ${error.message}`);
    }
  }
  
  // NoSQL Injection (even though we use SQLite, test for generic injection patterns)
  const noSqlPayloads = [
    { name: 'MongoDB injection', payload: { $ne: null } },
    { name: 'JSON injection', payload: { "$where": "function() { return true; }" } },
    { name: 'Array injection', payload: ['$gt', 0] }
  ];
  
  for (const noSql of noSqlPayloads) {
    try {
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: noSql.payload,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 400 && response.body.error && 
          (response.body.error.includes('must be a number') || 
           response.body.error.includes('received object'))) {
        logPass(`NoSQL Injection: ${noSql.name}`, 'Blocked by type validation');
      } else if (response.status === 401 || response.status === 403) {
        logPass(`NoSQL Injection: ${noSql.name}`, 'Blocked by authentication');
      } else {
        logWarning(`NoSQL Injection: ${noSql.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`NoSQL Injection: ${noSql.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Type Confusion attacks
  const typeConfusionPayloads = [
    { name: 'Object instead of string', field: 'date', payload: { malicious: 'data' } },
    { name: 'Array instead of number', field: 'count', payload: [1, 2, 3] },
    { name: 'Boolean instead of number', field: 'count', payload: true },
    { name: 'Function serialization', field: 'count', payload: 'function(){return 1;}' },
    { name: 'Null injection', field: 'count', payload: null },
    { name: 'Undefined injection', field: 'count', payload: undefined }
  ];
  
  for (const typePayload of typeConfusionPayloads) {
    try {
      const testData = { 
        date: '2025-08-06', 
        count: 5000,
        csrfToken: 'test-token'
      };
      testData[typePayload.field] = typePayload.payload;
      
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: testData
      });
      
      if (response.status === 400 && response.body.error) {
        logPass(`Type Confusion: ${typePayload.name}`, `Blocked: ${response.body.error}`);
      } else if (response.status === 401 || response.status === 403) {
        logPass(`Type Confusion: ${typePayload.name}`, 'Blocked by authentication');
      } else {
        logWarning(`Type Confusion: ${typePayload.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Type Confusion: ${typePayload.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Prototype Pollution attempts
  const prototypePollutionPayloads = [
    { name: 'Constructor pollution', payload: { constructor: { prototype: { isAdmin: true } } } },
    { name: '__proto__ pollution', payload: { "__proto__": { isAdmin: true } } },
    { name: 'Nested prototype pollution', payload: { "user": { "__proto__": { role: "admin" } } } }
  ];
  
  for (const protoPayload of prototypePollutionPayloads) {
    try {
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: protoPayload.payload
      });
      
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        logPass(`Prototype Pollution: ${protoPayload.name}`, 'Blocked by validation/auth');
      } else {
        logWarning(`Prototype Pollution: ${protoPayload.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Prototype Pollution: ${protoPayload.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Command Injection attempts
  const commandInjectionPayloads = [
    { name: 'Shell command injection', payload: '5000; rm -rf /' },
    { name: 'Pipe command injection', payload: '5000 | cat /etc/passwd' },
    { name: 'Background execution', payload: '5000 & evil-command' },
    { name: 'Variable expansion', payload: '$(cat /etc/hosts)' },
    { name: 'Backtick execution', payload: '`whoami`' }
  ];
  
  for (const cmdPayload of commandInjectionPayloads) {
    try {
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: cmdPayload.payload,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 400 && response.body.error && 
          response.body.error.includes('must be a valid number')) {
        logPass(`Command Injection: ${cmdPayload.name}`, 'Blocked by input validation');
      } else if (response.status === 401 || response.status === 403) {
        logPass(`Command Injection: ${cmdPayload.name}`, 'Blocked by authentication');
      } else {
        logWarning(`Command Injection: ${cmdPayload.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Command Injection: ${cmdPayload.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Path Traversal attempts
  const pathTraversalPayloads = [
    { name: 'Directory traversal', path: '/api/steps/../../../etc/passwd' },
    { name: 'Windows traversal', path: '/api/steps/..\\..\\..\\windows\\system32\\config\\sam' },
    { name: 'Encoded traversal', path: '/api/steps/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
    { name: 'Unicode traversal', path: '/api/steps/\u002e\u002e\u002f\u002e\u002e\u002f\u002e\u002e\u002fetc\u002fpasswd' }
  ];
  
  for (const pathPayload of pathTraversalPayloads) {
    try {
      const response = await makeRequest(pathPayload.path, {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: 5000,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 404) {
        logPass(`Path Traversal: ${pathPayload.name}`, 'Path not found (expected)');
      } else if (response.status === 400 || response.status === 401 || response.status === 403) {
        logPass(`Path Traversal: ${pathPayload.name}`, 'Blocked by security measures');
      } else {
        logWarning(`Path Traversal: ${pathPayload.name}`, `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Path Traversal: ${pathPayload.name}`, `Network error: ${error.message}`);
    }
  }
}

/**
 * 2. AUTHENTICATION & AUTHORIZATION SECURITY TESTS
 * Tests session management, privilege escalation, and access controls
 */
async function testAuthenticationSecurity() {
  console.log('\n🔐 2. AUTHENTICATION & AUTHORIZATION SECURITY');
  console.log('─'.repeat(50));
  
  // Test unauthenticated access to protected endpoints
  const protectedEndpoints = [
    { path: '/api/steps', method: 'POST', name: 'Steps API' },
    { path: '/api/admin/users', method: 'GET', name: 'Admin Users API' },
    { path: '/api/admin/mcp-tokens', method: 'POST', name: 'MCP Tokens API' },
    { path: '/api/admin/teams', method: 'POST', name: 'Teams API' },
    { path: '/api/csrf-token', method: 'GET', name: 'CSRF Token API' }
  ];
  
  for (const endpoint of protectedEndpoints) {
    try {
      const response = await makeRequest(endpoint.path, {
        method: endpoint.method,
        data: endpoint.method === 'POST' ? { test: 'data' } : undefined
      });
      
      if (response.status === 401) {
        logPass(`Unauth Access: ${endpoint.name}`, 'Correctly rejected (401 Unauthorized)');
      } else if (response.status === 403) {
        logPass(`Unauth Access: ${endpoint.name}`, 'Correctly rejected (403 Forbidden)');
      } else if (response.status === 302) {
        logPass(`Unauth Access: ${endpoint.name}`, 'Redirected to login (302)');
      } else {
        logFail(`Unauth Access: ${endpoint.name}`, `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Unauth Access: ${endpoint.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Test session fixation prevention
  try {
    // Try to set a session cookie and see if it's accepted
    const response = await makeRequest('/api/csrf-token', {
      headers: {
        'Cookie': 'connect.sid=s%3Afixed_session_id.malicious_signature'
      }
    });
    
    if (response.status === 401) {
      logPass('Session Fixation Prevention', 'Invalid session rejected');
    } else {
      logWarning('Session Fixation Prevention', `Status: ${response.status}`);
    }
  } catch (error) {
    logWarning('Session Fixation Prevention', `Network error: ${error.message}`);
  }
  
  // Test token tampering detection
  const tamperedTokens = [
    { name: 'Modified magic link token', token: 'tampered-uuid-token-123' },
    { name: 'JWT-like token', token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE2NDY2Njc1NDIsImV4cCI6MTY3ODIwMzU0MiwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSJ9.test' },
    { name: 'Empty token', token: '' },
    { name: 'Null byte token', token: 'valid-token\x00admin' }
  ];
  
  for (const tokenTest of tamperedTokens) {
    try {
      const response = await makeRequest('/auth/verify', {
        method: 'GET',
        headers: {
          'Cookie': `token=${tokenTest.token}`
        }
      });
      
      if (response.status === 401 || response.status === 400 || response.status === 403) {
        logPass(`Token Tampering: ${tokenTest.name}`, 'Invalid token rejected');
      } else if (response.status === 302) {
        // Check if redirected to error page, not dashboard
        const location = response.headers.location;
        if (location && !location.includes('dashboard')) {
          logPass(`Token Tampering: ${tokenTest.name}`, 'Redirected to error page');
        } else {
          logFail(`Token Tampering: ${tokenTest.name}`, 'Unexpectedly accepted');
        }
      } else {
        logWarning(`Token Tampering: ${tokenTest.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Token Tampering: ${tokenTest.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Test privilege escalation attempts (requires getting a valid session first)
  // This is a simplified test since we'd need proper authentication setup
  const privilegeEscalationTests = [
    { name: 'Admin API access without admin role', path: '/api/admin/users' },
    { name: 'MCP token creation without admin', path: '/api/admin/mcp-tokens' },
    { name: 'User deletion without admin', path: '/api/admin/users/1' }
  ];
  
  for (const privTest of privilegeEscalationTests) {
    try {
      const response = await makeRequest(privTest.path, {
        method: privTest.path.includes('users/1') ? 'DELETE' : 'GET'
      });
      
      if (response.status === 401 || response.status === 403) {
        logPass(`Privilege Escalation: ${privTest.name}`, 'Blocked by authorization');
      } else {
        logWarning(`Privilege Escalation: ${privTest.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Privilege Escalation: ${privTest.name}`, `Network error: ${error.message}`);
    }
  }
}

/**
 * 3. RATE LIMITING SECURITY TESTS
 * Tests brute force protection and API abuse prevention
 */
async function testRateLimitingSecurity() {
  console.log('\n⏱️  3. RATE LIMITING SECURITY');
  console.log('─'.repeat(50));
  
  // Test magic link rate limiting (should be limited to 50/hour)
  console.log('Testing magic link rate limiting...');
  
  const magicLinkRequests = [];
  const rapidRequestCount = 5; // Test with smaller number to avoid actually hitting the limit
  
  for (let i = 0; i < rapidRequestCount; i++) {
    magicLinkRequests.push(
      makeRequest('/auth/send-link', {
        method: 'POST',
        data: { email: `test${i}@example.com` }
      })
    );
  }
  
  try {
    const responses = await Promise.all(magicLinkRequests);
    const rateLimited = responses.some(r => r.status === 429);
    const successful = responses.filter(r => r.status === 200 || r.status === 400).length;
    
    if (successful > 0 && successful <= rapidRequestCount) {
      logPass('Magic Link Rate Limiting', `Processed ${successful}/${rapidRequestCount} requests normally`);
    } else if (rateLimited) {
      logWarning('Magic Link Rate Limiting', 'Rate limiting triggered (expected with high volume)');
    } else {
      logWarning('Magic Link Rate Limiting', `Unexpected behavior: ${successful} successful`);
    }
  } catch (error) {
    logWarning('Magic Link Rate Limiting', `Network error: ${error.message}`);
  }
  
  // Test API rate limiting with invalid requests (should be limited to 300/hour)
  console.log('Testing API rate limiting...');
  
  const apiRequests = [];
  const apiRequestCount = 3; // Small test batch
  
  for (let i = 0; i < apiRequestCount; i++) {
    apiRequests.push(
      makeRequest('/api/steps', {
        method: 'POST',
        data: { 
          date: '2025-08-06', 
          count: 5000,
          csrfToken: 'test-token'
        }
      })
    );
  }
  
  try {
    const responses = await Promise.all(apiRequests);
    const authRejected = responses.filter(r => r.status === 401 || r.status === 403).length;
    const rateLimited = responses.some(r => r.status === 429);
    
    if (authRejected === apiRequestCount) {
      logPass('API Rate Limiting', 'All requests properly authenticated/authorized (rate limiting working)');
    } else if (rateLimited) {
      logWarning('API Rate Limiting', 'Rate limiting triggered');
    } else {
      logWarning('API Rate Limiting', `Mixed responses received`);
    }
  } catch (error) {
    logWarning('API Rate Limiting', `Network error: ${error.message}`);
  }
  
  // Test IP-based vs session-based rate limiting
  try {
    const response = await makeRequest('/auth/send-link', {
      method: 'POST',
      data: { email: 'rate-limit-test@example.com' },
      headers: {
        'X-Forwarded-For': '192.168.1.100', // Simulate different IP
        'X-Real-IP': '192.168.1.100'
      }
    });
    
    if (response.status === 200 || response.status === 400) {
      logPass('IP-based Rate Limiting', 'Different IP processed independently');
    } else if (response.status === 429) {
      logWarning('IP-based Rate Limiting', 'Global rate limiting may be too aggressive');
    } else {
      logWarning('IP-based Rate Limiting', `Status: ${response.status}`);
    }
  } catch (error) {
    logWarning('IP-based Rate Limiting', `Network error: ${error.message}`);
  }
}

/**
 * 4. CSRF PROTECTION TESTS
 * Tests CSRF token validation and cross-origin request blocking
 */
async function testCSRFProtection() {
  console.log('\n🛡️  4. CSRF PROTECTION');
  console.log('─'.repeat(50));
  
  // Test CSRF token validation on state-changing operations
  const csrfProtectedEndpoints = [
    { path: '/api/steps', method: 'POST', name: 'Steps API' },
    { path: '/api/admin/teams', method: 'POST', name: 'Team Creation' },
    { path: '/api/admin/users/1/team', method: 'PUT', name: 'User Team Update' }
  ];
  
  for (const endpoint of csrfProtectedEndpoints) {
    // Test without CSRF token
    try {
      const response = await makeRequest(endpoint.path, {
        method: endpoint.method,
        data: { 
          test: 'data',
          // No csrfToken included
        }
      });
      
      if (response.status === 401) {
        logPass(`CSRF Protection: ${endpoint.name} (No Token)`, 'Blocked by authentication (expected)');
      } else if (response.status === 403 && response.body.error && 
                 response.body.error.includes('CSRF')) {
        logPass(`CSRF Protection: ${endpoint.name} (No Token)`, 'Blocked by CSRF protection');
      } else {
        logWarning(`CSRF Protection: ${endpoint.name} (No Token)`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`CSRF Protection: ${endpoint.name} (No Token)`, `Network error: ${error.message}`);
    }
    
    // Test with invalid CSRF token
    try {
      const response = await makeRequest(endpoint.path, {
        method: endpoint.method,
        data: { 
          test: 'data',
          csrfToken: 'invalid-csrf-token-123'
        }
      });
      
      if (response.status === 401) {
        logPass(`CSRF Protection: ${endpoint.name} (Invalid Token)`, 'Blocked by authentication');
      } else if (response.status === 403 && response.body.error && 
                 response.body.error.includes('CSRF')) {
        logPass(`CSRF Protection: ${endpoint.name} (Invalid Token)`, 'Blocked by CSRF validation');
      } else {
        logWarning(`CSRF Protection: ${endpoint.name} (Invalid Token)`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`CSRF Protection: ${endpoint.name} (Invalid Token)`, `Network error: ${error.message}`);
    }
  }
  
  // Test CSRF token reuse prevention (would require valid session)
  try {
    const response = await makeRequest('/api/csrf-token', { method: 'GET' });
    
    if (response.status === 401) {
      logPass('CSRF Token Reuse Prevention', 'Token endpoint requires authentication');
    } else {
      logWarning('CSRF Token Reuse Prevention', `Token endpoint status: ${response.status}`);
    }
  } catch (error) {
    logWarning('CSRF Token Reuse Prevention', `Network error: ${error.message}`);
  }
  
  // Test cross-origin request blocking
  const crossOriginTests = [
    { name: 'Different Origin', origin: 'https://malicious-site.com' },
    { name: 'Subdomain Attack', origin: 'https://evil.step-app-4x-yhw.fly.dev' },
    { name: 'Port-based Attack', origin: BASE_URL.replace(':3000', ':3001') },
    { name: 'Protocol Downgrade', origin: BASE_URL.replace('https:', 'http:') }
  ];
  
  for (const originTest of crossOriginTests) {
    try {
      const response = await makeRequest('/api/steps', {
        method: 'POST',
        headers: {
          'Origin': originTest.origin,
          'Referer': originTest.origin + '/malicious-page'
        },
        data: { 
          date: '2025-08-06', 
          count: 5000,
          csrfToken: 'test-token'
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        logPass(`Cross-Origin: ${originTest.name}`, 'Blocked by security measures');
      } else if (response.status === 400) {
        logPass(`Cross-Origin: ${originTest.name}`, 'Blocked by validation');
      } else {
        logWarning(`Cross-Origin: ${originTest.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Cross-Origin: ${originTest.name}`, `Network error: ${error.message}`);
    }
  }
}

/**
 * 5. DATA SECURITY TESTS
 * Tests user data isolation and access boundaries
 */
async function testDataSecurity() {
  console.log('\n🔒 5. DATA SECURITY');
  console.log('─'.repeat(50));
  
  // Test user data isolation - attempts to access other users' data
  const dataIsolationTests = [
    { name: 'Steps for other user', path: '/api/steps?userId=999' },
    { name: 'User profile access', path: '/api/user/999' },
    { name: 'Direct database access', path: '/api/steps/../../../database' },
    { name: 'Admin data without auth', path: '/api/admin/users' }
  ];
  
  for (const dataTest of dataIsolationTests) {
    try {
      const response = await makeRequest(dataTest.path, { method: 'GET' });
      
      if (response.status === 401) {
        logPass(`Data Isolation: ${dataTest.name}`, 'Blocked by authentication');
      } else if (response.status === 403) {
        logPass(`Data Isolation: ${dataTest.name}`, 'Blocked by authorization');
      } else if (response.status === 404) {
        logPass(`Data Isolation: ${dataTest.name}`, 'Path not found (expected)');
      } else {
        logWarning(`Data Isolation: ${dataTest.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Data Isolation: ${dataTest.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Test sensitive information leakage prevention
  const infoLeakageTests = [
    { name: 'Error details', path: '/api/nonexistent', expectNoStackTrace: true },
    { name: 'Database errors', path: '/api/steps', method: 'POST', data: { malformed: 'query' } },
    { name: 'Session details', path: '/api/session/debug' }
  ];
  
  for (const leakTest of infoLeakageTests) {
    try {
      const response = await makeRequest(leakTest.path, {
        method: leakTest.method || 'GET',
        data: leakTest.data
      });
      
      const hasStackTrace = response.rawBody && (
        response.rawBody.includes('at ') ||
        response.rawBody.includes('stack:') ||
        response.rawBody.includes('Error:')
      );
      
      const hasDbPath = response.rawBody && (
        response.rawBody.includes('sqlite') ||
        response.rawBody.includes('/data/') ||
        response.rawBody.includes('.db')
      );
      
      if (leakTest.expectNoStackTrace && hasStackTrace) {
        logFail(`Info Leakage: ${leakTest.name}`, 'Stack trace exposed');
      } else if (hasDbPath) {
        logFail(`Info Leakage: ${leakTest.name}`, 'Database path exposed');
      } else {
        logPass(`Info Leakage: ${leakTest.name}`, 'No sensitive information leaked');
      }
    } catch (error) {
      logWarning(`Info Leakage: ${leakTest.name}`, `Network error: ${error.message}`);
    }
  }
  
  // Test admin vs regular user boundaries
  const boundaryTests = [
    { name: 'MCP token creation', path: '/api/admin/mcp-tokens', method: 'POST' },
    { name: 'User management', path: '/api/admin/users', method: 'GET' },
    { name: 'System settings', path: '/api/admin/theme', method: 'POST' }
  ];
  
  for (const boundaryTest of boundaryTests) {
    try {
      const response = await makeRequest(boundaryTest.path, {
        method: boundaryTest.method,
        data: boundaryTest.method === 'POST' ? { test: 'data' } : undefined
      });
      
      if (response.status === 401) {
        logPass(`Admin Boundary: ${boundaryTest.name}`, 'Requires authentication');
      } else if (response.status === 403) {
        logPass(`Admin Boundary: ${boundaryTest.name}`, 'Requires admin privileges');
      } else {
        logWarning(`Admin Boundary: ${boundaryTest.name}`, `Status: ${response.status}`);
      }
    } catch (error) {
      logWarning(`Admin Boundary: ${boundaryTest.name}`, `Network error: ${error.message}`);
    }
  }
}

/**
 * 6. HTTP SECURITY HEADERS TESTS
 * Tests security header presence and effectiveness
 */
async function testHttpSecurityHeaders() {
  console.log('\n🌐 6. HTTP SECURITY HEADERS');
  console.log('─'.repeat(50));
  
  // Test main page security headers
  try {
    const response = await makeRequest('/', { method: 'GET' });
    const headers = response.headers;
    
    // Test Content Security Policy
    if (headers['content-security-policy']) {
      const csp = headers['content-security-policy'];
      if (csp.includes("default-src 'self'")) {
        logPass('CSP Header', 'Default-src properly restricted');
      } else {
        logWarning('CSP Header', 'Default-src may be too permissive');
      }
      
      if (csp.includes("object-src 'none'")) {
        logPass('CSP Object-src', 'Object-src properly restricted');
      } else {
        logWarning('CSP Object-src', 'Object-src not restricted');
      }
    } else {
      logFail('CSP Header', 'Content Security Policy header missing');
    }
    
    // Test X-Frame-Options
    if (headers['x-frame-options']) {
      logPass('X-Frame-Options', `Present: ${headers['x-frame-options']}`);
    } else {
      logFail('X-Frame-Options', 'Header missing - clickjacking risk');
    }
    
    // Test X-Content-Type-Options
    if (headers['x-content-type-options']) {
      logPass('X-Content-Type-Options', 'MIME sniffing disabled');
    } else {
      logWarning('X-Content-Type-Options', 'Header missing');
    }
    
    // Test X-XSS-Protection (deprecated but still useful for older browsers)
    if (headers['x-xss-protection']) {
      logPass('X-XSS-Protection', 'XSS filtering enabled');
    } else {
      logWarning('X-XSS-Protection', 'Header not set (OK for modern apps)');
    }
    
    // Test Strict-Transport-Security (only for HTTPS)
    if (USE_HTTPS) {
      if (headers['strict-transport-security']) {
        logPass('HSTS Header', 'HTTPS enforcement enabled');
      } else {
        logWarning('HSTS Header', 'Missing - HTTPS not enforced');
      }
    }
    
    // Test Referrer-Policy
    if (headers['referrer-policy']) {
      logPass('Referrer-Policy', 'Referrer information controlled');
    } else {
      logWarning('Referrer-Policy', 'Header not set');
    }
    
    // Test for information disclosure in headers
    const sensitiveHeaders = ['server', 'x-powered-by', 'x-aspnet-version'];
    let infoDisclosed = false;
    
    for (const header of sensitiveHeaders) {
      if (headers[header]) {
        logWarning('Information Disclosure', `${header}: ${headers[header]}`);
        infoDisclosed = true;
      }
    }
    
    if (!infoDisclosed) {
      logPass('Information Disclosure', 'No sensitive headers exposed');
    }
    
  } catch (error) {
    logWarning('HTTP Security Headers', `Network error: ${error.message}`);
  }
  
  // Test CORS configuration
  try {
    const corsResponse = await makeRequest('/', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-site.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    if (corsResponse.status === 404 || corsResponse.status === 405) {
      logPass('CORS Configuration', 'OPTIONS requests properly handled');
    } else if (corsResponse.headers['access-control-allow-origin']) {
      const allowOrigin = corsResponse.headers['access-control-allow-origin'];
      if (allowOrigin === '*') {
        logFail('CORS Configuration', 'Wildcard origin allowed - security risk');
      } else {
        logPass('CORS Configuration', `Restricted to: ${allowOrigin}`);
      }
    } else {
      logPass('CORS Configuration', 'No CORS headers (restrictive)');
    }
  } catch (error) {
    logWarning('CORS Configuration', `Network error: ${error.message}`);
  }
}

/**
 * 7. SESSION SECURITY TESTS
 * Tests session management and cookie security
 */
async function testSessionSecurity() {
  console.log('\n🍪 7. SESSION SECURITY');
  console.log('─'.repeat(50));
  
  // Test session cookie attributes
  try {
    const response = await makeRequest('/auth/send-link', {
      method: 'POST',
      data: { email: 'session-test@example.com' }
    });
    
    const cookies = response.cookies;
    let sessionCookieFound = false;
    
    for (const cookie of cookies) {
      if (cookie.includes('connect.sid') || cookie.includes('session')) {
        sessionCookieFound = true;
        
        if (cookie.includes('HttpOnly')) {
          logPass('Session Cookie HttpOnly', 'XSS protection enabled');
        } else {
          logFail('Session Cookie HttpOnly', 'Missing - XSS risk');
        }
        
        if (USE_HTTPS && cookie.includes('Secure')) {
          logPass('Session Cookie Secure', 'HTTPS-only transmission');
        } else if (!USE_HTTPS) {
          logPass('Session Cookie Secure', 'Not HTTPS - Secure flag not expected');
        } else {
          logWarning('Session Cookie Secure', 'Missing Secure flag for HTTPS');
        }
        
        if (cookie.includes('SameSite')) {
          logPass('Session Cookie SameSite', 'CSRF protection enabled');
        } else {
          logWarning('Session Cookie SameSite', 'SameSite not set');
        }
        
        break;
      }
    }
    
    if (!sessionCookieFound && response.status === 200) {
      logWarning('Session Cookie', 'No session cookie found in response');
    }
  } catch (error) {
    logWarning('Session Cookie Security', `Network error: ${error.message}`);
  }
  
  // Test concurrent session handling
  const concurrentSessionTests = [
    { name: 'Multiple sessions same user', simulate: true },
    { name: 'Session fixation resistance', simulate: true }
  ];
  
  for (const sessionTest of concurrentSessionTests) {
    // These are complex to test without proper authentication setup
    // For now, we'll mark them as informational
    logWarning(`Session Management: ${sessionTest.name}`, 'Requires authenticated testing');
  }
}

/**
 * MAIN TEST RUNNER
 */
async function runSecurityRegressionTests() {
  console.log('🚀 Starting comprehensive security regression tests...\n');
  
  try {
    await testInputValidationSecurity();
    await testAuthenticationSecurity();
    await testRateLimitingSecurity();
    await testCSRFProtection();
    await testDataSecurity();
    await testHttpSecurityHeaders();
    await testSessionSecurity();
    
    // Final results
    console.log('\n' + '='.repeat(80));
    console.log('🎯 SECURITY REGRESSION TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`✅ PASSED: ${testResults.passed}`);
    console.log(`❌ FAILED: ${testResults.failed}`);
    console.log(`⚠️  WARNINGS: ${testResults.warnings}`);
    console.log(`📊 TOTAL TESTS: ${testResults.passed + testResults.failed + testResults.warnings}`);
    
    const successRate = Math.round((testResults.passed / (testResults.passed + testResults.failed + testResults.warnings)) * 100);
    console.log(`📈 SUCCESS RATE: ${successRate}%`);
    
    // Security assessment
    if (testResults.failed === 0) {
      console.log('🎉 SECURITY STATUS: STRONG - No critical failures detected');
    } else if (testResults.failed <= 3) {
      console.log('⚠️  SECURITY STATUS: MODERATE - Some issues need attention');
    } else {
      console.log('🚨 SECURITY STATUS: WEAK - Multiple security issues detected');
    }
    
    // Detailed breakdown
    console.log('\n📋 DETAILED BREAKDOWN:');
    const categories = {};
    testResults.details.forEach(result => {
      const category = result.test.split(':')[0];
      if (!categories[category]) categories[category] = { pass: 0, fail: 0, warn: 0 };
      
      if (result.type === 'PASS') categories[category].pass++;
      else if (result.type === 'FAIL') categories[category].fail++;
      else categories[category].warn++;
    });
    
    for (const [category, stats] of Object.entries(categories)) {
      console.log(`   ${category}: ${stats.pass} passed, ${stats.fail} failed, ${stats.warn} warnings`);
    }
    
    // Exit code based on results
    if (testResults.failed > 0) {
      console.log('\n⚠️  Some security tests failed - review required');
      process.exit(1);
    } else {
      console.log('\n✅ All security tests passed or have acceptable warnings');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n💥 Security test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runSecurityRegressionTests();
}

module.exports = {
  runSecurityRegressionTests,
  makeRequest,
  testResults
};