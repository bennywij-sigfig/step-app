const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MCPAPILoadTester {
  constructor(baseUrl = 'https://step-app-4x-yhw.fly.dev') {
    this.baseUrl = baseUrl;
    this.mcpEndpoint = `${baseUrl}/mcp`;
    this.testTokens = [];
  }

  // Create MCP test tokens for load testing
  async createTestTokens(count = 10) {
    console.log(`🔑 Creating ${count} MCP test tokens for authenticated load testing...`);
    console.log('⚠️  You need to create MCP tokens via the admin panel first.');
    console.log('📋 Please go to: https://step-app-4x-yhw.fly.dev/admin');
    console.log('🔧 Create tokens for test users and save them to mcp-test-tokens.json');
    console.log('');
    console.log('Expected format in mcp-test-tokens.json:');
    console.log(`{
  "tokens": [
    {"token": "your-token-1", "name": "Load Test User 1"},
    {"token": "your-token-2", "name": "Load Test User 2"},
    ...
  ]
}`);
    
    // Check if tokens file exists
    const tokensFile = path.join(__dirname, 'mcp-test-tokens.json');
    if (fs.existsSync(tokensFile)) {
      const tokenData = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
      this.testTokens = tokenData.tokens || [];
      console.log(`✅ Loaded ${this.testTokens.length} existing MCP tokens`);
      return this.testTokens;
    }
    
    throw new Error('Please create MCP tokens via admin panel and save to mcp-test-tokens.json');
  }

  // Make MCP API call
  async makeMCPCall(token, method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    };

    try {
      const response = await axios.post(this.mcpEndpoint, request, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      return {
        success: true,
        data: response.data,
        status: response.status,
        responseTime: response.headers['x-response-time'] || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        responseTime: 0
      };
    }
  }

  // Simulate authenticated user session via MCP API
  async simulateAuthenticatedUser(tokenInfo, userIndex, totalUsers) {
    const userResults = {
      token: tokenInfo.name || `User ${userIndex}`,
      userIndex,
      totalUsers,
      actions: [],
      errors: [],
      totalTime: 0,
      startTime: Date.now()
    };

    try {
      console.log(`👤 User ${userIndex}/${totalUsers} (${tokenInfo.name}): Starting MCP API session...`);

      // 1. Get user profile
      const profileStart = Date.now();
      const profileResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__get_user_profile');
      const profileTime = Date.now() - profileStart;
      
      userResults.actions.push({ 
        action: 'get_user_profile', 
        time: profileTime, 
        success: profileResult.success,
        status: profileResult.status
      });
      
      if (profileResult.success) {
        console.log(`👤 User ${userIndex}: Profile loaded in ${profileTime}ms`);
      } else {
        console.log(`❌ User ${userIndex}: Profile failed - ${profileResult.error}`);
        userResults.errors.push(`Profile error: ${profileResult.error}`);
      }

      // 2. Get current steps
      const stepsStart = Date.now();
      const stepsResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__get_steps');
      const stepsTime = Date.now() - stepsStart;
      
      userResults.actions.push({ 
        action: 'get_steps', 
        time: stepsTime, 
        success: stepsResult.success,
        status: stepsResult.status
      });
      
      if (stepsResult.success) {
        console.log(`👤 User ${userIndex}: Steps data loaded in ${stepsTime}ms`);
      } else {
        console.log(`⚠️  User ${userIndex}: Steps load failed - ${stepsResult.error}`);
        userResults.errors.push(`Steps error: ${stepsResult.error}`);
      }

      // 3. Add new steps (realistic load testing)
      const addStepsStart = Date.now();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const randomSteps = Math.floor(Math.random() * 8000) + 2000; // 2000-10000 steps
      
      const addStepsResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__add_steps', {
        date: today,
        count: randomSteps
      });
      const addStepsTime = Date.now() - addStepsStart;
      
      userResults.actions.push({ 
        action: 'add_steps', 
        time: addStepsTime, 
        success: addStepsResult.success,
        status: addStepsResult.status,
        steps: randomSteps
      });
      
      if (addStepsResult.success) {
        console.log(`👤 User ${userIndex}: Added ${randomSteps} steps in ${addStepsTime}ms`);
      } else {
        console.log(`⚠️  User ${userIndex}: Add steps failed - ${addStepsResult.error}`);
        userResults.errors.push(`Add steps error: ${addStepsResult.error}`);
      }

      // 4. Get updated steps (verify the add worked)
      const verifyStart = Date.now();
      const verifyResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__get_steps', {
        start_date: today,
        end_date: today
      });
      const verifyTime = Date.now() - verifyStart;
      
      userResults.actions.push({ 
        action: 'verify_steps', 
        time: verifyTime, 
        success: verifyResult.success,
        status: verifyResult.status
      });
      
      if (verifyResult.success) {
        console.log(`👤 User ${userIndex}: Steps verified in ${verifyTime}ms`);
      } else {
        console.log(`⚠️  User ${userIndex}: Steps verification failed - ${verifyResult.error}`);
      }

      // 5. Test concurrent profile access (simulates dashboard refresh)
      const refreshStart = Date.now();
      const refreshResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__get_user_profile');
      const refreshTime = Date.now() - refreshStart;
      
      userResults.actions.push({ 
        action: 'profile_refresh', 
        time: refreshTime, 
        success: refreshResult.success,
        status: refreshResult.status
      });
      
      if (refreshResult.success) {
        console.log(`👤 User ${userIndex}: Profile refreshed in ${refreshTime}ms`);
      }

    } catch (error) {
      userResults.errors.push(`General error: ${error.message}`);
      console.log(`❌ User ${userIndex}: Error - ${error.message}`);
    } finally {
      userResults.totalTime = Date.now() - userResults.startTime;
      console.log(`✅ User ${userIndex}: MCP session completed in ${userResults.totalTime}ms`);
      return userResults;
    }
  }

  // Run concurrent authenticated load test
  async runAuthenticatedLoadTest(userCount) {
    await this.createTestTokens(userCount);
    
    if (this.testTokens.length < userCount) {
      throw new Error(`Need ${userCount} MCP tokens but only have ${this.testTokens.length}. Create more via admin panel.`);
    }
    
    console.log(`\n🚀 Starting authenticated MCP API load test with ${userCount} concurrent users...`);
    console.log(`📅 Target: ${this.mcpEndpoint}`);
    
    // Select tokens for this test
    const selectedTokens = this.testTokens.slice(0, userCount);
    
    const promises = selectedTokens.map((tokenInfo, index) => 
      this.simulateAuthenticatedUser(tokenInfo, index + 1, userCount)
    );
    
    const testStart = Date.now();
    const results = await Promise.all(promises);
    const testDuration = Date.now() - testStart;
    
    return {
      userCount,
      duration: testDuration,
      results
    };
  }

  // Analyze results
  analyzeResults(testResults) {
    const { userCount, duration, results } = testResults;
    
    let totalActions = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;
    let successfulUsers = 0;
    const actionStats = {};
    
    results.forEach(userResult => {
      totalErrors += userResult.errors.length;
      
      // Count users who completed successfully (had at least one successful action)
      if (userResult.actions.some(a => a.success)) {
        successfulUsers++;
      }
      
      userResult.actions.forEach(action => {
        totalActions++;
        totalResponseTime += action.time;
        
        if (!actionStats[action.action]) {
          actionStats[action.action] = {
            count: 0,
            totalTime: 0,
            successes: 0,
            failures: 0
          };
        }
        
        actionStats[action.action].count++;
        actionStats[action.action].totalTime += action.time;
        
        if (action.success) {
          actionStats[action.action].successes++;
        } else {
          actionStats[action.action].failures++;
        }
      });
    });

    const report = {
      userCount,
      successfulUsers,
      userSuccessRate: Math.round((successfulUsers / userCount) * 100),
      testDuration: duration,
      totalActions,
      totalErrors,
      avgResponseTime: totalActions > 0 ? Math.round(totalResponseTime / totalActions) : 0,
      successRate: totalActions > 0 ? Math.round(((totalActions - totalErrors) / totalActions) * 100) : 0,
      throughput: Math.round((totalActions / duration) * 1000), // actions per second
      actionBreakdown: {}
    };

    // Calculate per-action statistics
    Object.keys(actionStats).forEach(action => {
      const stats = actionStats[action];
      report.actionBreakdown[action] = {
        count: stats.count,
        avgTime: Math.round(stats.totalTime / stats.count),
        successRate: Math.round((stats.successes / stats.count) * 100)
      };
    });

    return report;
  }

  // Print report
  printReport(report) {
    console.log('\n' + '='.repeat(75));
    console.log(`📊 AUTHENTICATED MCP API LOAD TEST - ${report.userCount} CONCURRENT USERS`);
    console.log('='.repeat(75));
    console.log(`🔐 User Success Rate: ${report.userSuccessRate}% (${report.successfulUsers}/${report.userCount} users)`);
    console.log(`⏱️  Test Duration: ${(report.testDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Total Actions: ${report.totalActions}`);
    console.log(`❌ Total Errors: ${report.totalErrors}`);
    console.log(`⚡ Average Response Time: ${report.avgResponseTime}ms`);
    console.log(`✅ Action Success Rate: ${report.successRate}%`);
    console.log(`🚀 Throughput: ${report.throughput} actions/second`);
    
    console.log('\n📋 Action Breakdown:');
    console.log('-'.repeat(55));
    Object.keys(report.actionBreakdown).forEach(action => {
      const stats = report.actionBreakdown[action];
      console.log(`  ${action.padEnd(20)} | ${stats.count.toString().padStart(3)} calls | ${stats.avgTime.toString().padStart(4)}ms avg | ${stats.successRate.toString().padStart(3)}% success`);
    });
    console.log('='.repeat(75));
  }

  // Save results
  saveResults(report, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `mcp-authenticated-load-test-${report.userCount}users-${timestamp}.json`;
    }
    
    const resultsPath = path.join(__dirname, '..', 'load-test-results', filename);
    
    // Ensure directory exists
    const resultsDir = path.dirname(resultsPath);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
    console.log(`💾 Results saved to: ${resultsPath}`);
    return resultsPath;
  }

  // Cleanup test data (remove test step entries)
  async cleanup() {
    console.log('\n🧹 Cleaning up test step data...');
    
    let cleanedCount = 0;
    const today = new Date().toISOString().split('T')[0];
    
    for (const tokenInfo of this.testTokens) {
      try {
        // Get today's steps
        const stepsResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__get_steps', {
          start_date: today,
          end_date: today
        });
        
        if (stepsResult.success && stepsResult.data.result && stepsResult.data.result.length > 0) {
          // Set steps to 0 to effectively remove test data
          const cleanupResult = await this.makeMCPCall(tokenInfo.token, 'mcp__step-challenge__add_steps', {
            date: today,
            count: 0,
            allow_overwrite: true
          });
          
          if (cleanupResult.success) {
            cleanedCount++;
            console.log(`✓ Cleaned test data for ${tokenInfo.name}`);
          }
        }
      } catch (error) {
        console.log(`⚠️  Could not clean data for ${tokenInfo.name}: ${error.message}`);
      }
    }
    
    console.log(`✅ Cleanup completed - removed test data for ${cleanedCount} users`);
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const userCount = parseInt(args[0]) || 10;
  const baseUrl = args[1] || 'https://step-app-4x-yhw.fly.dev';
  
  const tester = new MCPAPILoadTester(baseUrl);
  
  try {
    const testResults = await tester.runAuthenticatedLoadTest(userCount);
    const report = tester.analyzeResults(testResults);
    tester.printReport(report);
    tester.saveResults(report);
    await tester.cleanup();
  } catch (error) {
    console.error(`❌ Load test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = MCPAPILoadTester;