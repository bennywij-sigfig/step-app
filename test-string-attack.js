#!/usr/bin/env node

/**
 * Test string injection attack against the steps endpoint
 */

const https = require('https');

const BASE_URL = 'https://step-app-4x-yhw.fly.dev';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Script/1.0'
      }
    };
    
    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = postData.length;
    }
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ 
            status: res.statusCode, 
            body: parsed, 
            headers: res.headers,
            cookies: res.headers['set-cookie'] || []
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            body: body, 
            headers: res.headers,
            cookies: res.headers['set-cookie'] || []
          });
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

async function testStringInjection() {
  console.log('🧪 Testing String Injection Attack: "AAAAA"');
  console.log('=' .repeat(50));
  
  // Test 1: Try direct API call without auth (should fail with 401)
  console.log('\n1. Testing without authentication...');
  const noAuthTest = await makeRequest('/api/steps', 'POST', {
    date: '2025-07-28',
    count: 'AAAAA',
    csrfToken: 'fake-token'
  });
  
  console.log(`   Status: ${noAuthTest.status}`);
  console.log(`   Response: ${JSON.stringify(noAuthTest.body)}`);
  
  if (noAuthTest.status === 401) {
    console.log('   ✅ Correctly rejected - authentication required');
  } else {
    console.log('   ❌ Unexpected - should require authentication');
  }
  
  // Test 2: Try to access dashboard (might have demo mode)
  console.log('\n2. Testing dashboard access...');
  const dashboardTest = await makeRequest('/dashboard', 'GET');
  console.log(`   Status: ${dashboardTest.status}`);
  
  if (dashboardTest.status === 200) {
    console.log('   ✅ Dashboard accessible - might have demo mode');
    
    // Test 3: Try API call from potential demo session
    console.log('\n3. Testing API with potential demo session...');
    const demoApiTest = await makeRequest('/api/steps', 'POST', {
      date: '2025-07-28',
      count: 'AAAAA',
      csrfToken: 'demo-token'
    });
    
    console.log(`   Status: ${demoApiTest.status}`);
    console.log(`   Response: ${JSON.stringify(demoApiTest.body)}`);
    
    if (demoApiTest.status === 400 && demoApiTest.body.error && 
        demoApiTest.body.error.includes('must be a valid number')) {
      console.log('   🎉 SUCCESS: String "AAAAA" was correctly rejected!');
      console.log('   📋 Validation working: Input validation caught the attack');
    } else if (demoApiTest.status === 401 || demoApiTest.status === 403) {
      console.log('   ✅ Auth protection working (CSRF or session required)');
    } else {
      console.log('   ❌ Unexpected response - needs investigation');
    }
    
  } else {
    console.log('   ℹ️  Dashboard requires authentication');
  }
  
  // Test 4: Other malicious payloads
  console.log('\n4. Testing other malicious payloads...');
  
  const maliciousTests = [
    { name: 'Object injection', payload: { malicious: 'data' } },
    { name: 'Array injection', payload: [1, 2, 3] },
    { name: 'SQL injection', payload: "1'; DROP TABLE steps; --" },
    { name: 'Boolean injection', payload: true },
    { name: 'Null injection', payload: null }
  ];
  
  for (const test of maliciousTests) {
    console.log(`\n   Testing ${test.name}...`);
    const response = await makeRequest('/api/steps', 'POST', {
      date: '2025-07-28',
      count: test.payload,
      csrfToken: 'test-token'
    });
    
    console.log(`   Status: ${response.status} | Response: ${JSON.stringify(response.body)}`);
    
    if (response.status === 400 && response.body.error) {
      console.log(`   ✅ Blocked: ${response.body.error}`);
    } else if (response.status === 401 || response.status === 403) {
      console.log(`   ✅ Auth protection active`);
    } else {
      console.log(`   ⚠️  Unexpected: ${response.status}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 String injection test complete!');
  console.log('\nThe validation should block string "AAAAA" with:');
  console.log('   Expected error: "Step count must be a valid number"');
}

// Run the test
testStringInjection().catch(console.error);