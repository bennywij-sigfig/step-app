// Test script for MCP integration
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testMCPIntegration() {
  console.log('🧪 Testing MCP Integration...\n');

  try {
    // Test 1: Check MCP capabilities endpoint
    console.log('1. Testing MCP capabilities discovery...');
    const capabilitiesResponse = await axios.get(`${BASE_URL}/mcp/capabilities`);
    console.log('✅ Capabilities endpoint working');
    console.log('Available tools:', capabilitiesResponse.data.capabilities.tools.map(t => t.name).join(', '));
    console.log('');

    // Test 2: Test invalid JSON-RPC request
    console.log('2. Testing invalid JSON-RPC request...');
    try {
      const invalidResponse = await axios.post(`${BASE_URL}/mcp/rpc`, {
        method: 'test',
        params: {}
      });
      console.log('❌ Should have failed for invalid JSON-RPC format');
    } catch (error) {
      if (error.response && error.response.data.error) {
        console.log('✅ Correctly rejected invalid JSON-RPC format');
        console.log('Error:', error.response.data.error.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    // Test 3: Test missing token
    console.log('3. Testing missing token...');
    try {
      const noTokenResponse = await axios.post(`${BASE_URL}/mcp/rpc`, {
        jsonrpc: '2.0',
        method: 'add_steps',
        params: { date: '2025-01-15', count: 10000 },
        id: 1
      });
      console.log('❌ Should have failed for missing token');
    } catch (error) {
      if (error.response && error.response.data.error) {
        console.log('✅ Correctly rejected request without token');
        console.log('Error:', error.response.data.error.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    // Test 4: Test invalid token
    console.log('4. Testing invalid token...');
    try {
      const invalidTokenResponse = await axios.post(`${BASE_URL}/mcp/rpc`, {
        jsonrpc: '2.0',
        method: 'add_steps',
        params: { 
          token: 'mcp_invalid_token',
          date: '2025-01-15', 
          count: 10000 
        },
        id: 1
      });
      console.log('❌ Should have failed for invalid token');
    } catch (error) {
      if (error.response && error.response.data.error) {
        console.log('✅ Correctly rejected invalid token');
        console.log('Error:', error.response.data.error.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    console.log('🎉 Basic MCP integration tests completed!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Create an MCP token via admin panel');
    console.log('2. Test add_steps with overwrite protection');
    console.log('3. Test audit logging functionality');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Usage example for manual testing
function showUsageExample() {
  console.log('\n📚 MCP Usage Example:\n');
  
  const example = {
    jsonrpc: '2.0',
    id: 1,
    method: 'add_steps',
    params: {
      token: 'mcp_12345678-abcd-...',
      date: '2025-01-15',
      count: 12000,
      allow_overwrite: false
    }
  };

  console.log('POST /mcp/rpc');
  console.log(JSON.stringify(example, null, 2));
  console.log('');

  console.log('Expected response (success):');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    result: {
      success: true,
      message: 'Steps saved for 2025-01-15: 12000',
      date: '2025-01-15',
      count: 12000,
      was_overwrite: false,
      old_count: null
    },
    id: 1
  }, null, 2));
  console.log('');

  console.log('Expected response (overwrite protection):');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Server error',
      data: 'Steps already exist for 2025-01-15 (10000 steps). Set allow_overwrite=true to replace existing data.'
    },
    id: 1
  }, null, 2));
}

if (require.main === module) {
  // Check if server is running
  const isServerRunning = process.argv.includes('--test-server');
  
  if (isServerRunning) {
    testMCPIntegration();
  } else {
    console.log('🔧 MCP Integration Test Script');
    console.log('');
    console.log('To test against running server: node test-mcp.js --test-server');
    console.log('');
    showUsageExample();
  }
}

module.exports = { testMCPIntegration, showUsageExample };