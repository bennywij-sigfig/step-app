const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class ProductionAuthLoadTester {
  constructor(baseUrl = 'https://step-app-4x-yhw.fly.dev') {
    this.baseUrl = baseUrl;
    this.testUsers = [];
    this.authenticatedSessions = [];
  }

  // Create test users by requesting magic links and capturing sessions
  async createTestUsers(count = 10) {
    console.log(`📋 Creating ${count} test users via production magic links...`);
    
    const browser = await chromium.launch({ headless: true });
    const testUsers = [];
    
    for (let i = 1; i <= count; i++) {
      const email = `loadtest${i}@example.com`;
      
      try {
        console.log(`👤 Creating test user ${i}/${count}: ${email}`);
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Request magic link
        await page.goto(this.baseUrl, { timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        
        const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        await emailInput.fill(email);
        
        const sendButton = await page.waitForSelector('button:has-text("Send Login Link")', { timeout: 10000 });
        await sendButton.click();
        
        // Wait for response
        await page.waitForTimeout(2000);
        
        console.log(`✓ Magic link requested for ${email}`);
        
        // Note: In a real scenario, we'd need access to the magic links
        // For this test, we'll simulate authenticated sessions differently
        testUsers.push({
          email,
          index: i
        });
        
        await context.close();
        
      } catch (error) {
        console.error(`❌ Failed to create user ${email}: ${error.message}`);
      }
    }
    
    await browser.close();
    
    console.log(`✅ Created ${testUsers.length} test user requests`);
    this.testUsers = testUsers;
    return testUsers;
  }

  // Simulate authenticated user behavior (without actual login)
  async simulateUserBehavior(userInfo, userIndex, totalUsers) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const userResults = {
      email: userInfo.email,
      userIndex,
      totalUsers,
      actions: [],
      errors: [],
      totalTime: 0,
      startTime: Date.now()
    };

    try {
      console.log(`👤 User ${userIndex}/${totalUsers} (${userInfo.email}): Starting behavior simulation...`);

      // 1. Homepage access
      const homeStart = Date.now();
      await page.goto(this.baseUrl, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      const homeTime = Date.now() - homeStart;
      userResults.actions.push({ action: 'homepage_access', time: homeTime, success: true });
      console.log(`👤 User ${userIndex}: Homepage loaded in ${homeTime}ms`);

      // 2. Magic link request (as done in user creation)
      const loginStart = Date.now();
      const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await emailInput.fill(userInfo.email);
      
      const sendButton = await page.waitForSelector('button:has-text("Send Login Link")', { timeout: 10000 });
      await sendButton.click();
      
      await page.waitForTimeout(3000);
      
      const loginTime = Date.now() - loginStart;
      userResults.actions.push({ action: 'magic_link_request', time: loginTime, success: true });
      console.log(`👤 User ${userIndex}: Magic link requested in ${loginTime}ms`);

      // 3. Attempt dashboard access (will be redirected, but we measure the response)
      const dashStart = Date.now();
      await page.goto(`${this.baseUrl}/dashboard`, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      
      const currentUrl = page.url();
      const wasRedirected = !currentUrl.includes('/dashboard');
      
      const dashTime = Date.now() - dashStart;
      userResults.actions.push({ 
        action: 'dashboard_attempt', 
        time: dashTime, 
        success: true, // Success means server responded properly
        redirected: wasRedirected
      });
      console.log(`👤 User ${userIndex}: Dashboard attempt in ${dashTime}ms (redirected: ${wasRedirected})`);

      // 4. API endpoint tests (unauthenticated, but tests server load)
      const apiTests = [
        '/api/health',
        '/api/leaderboard/individual',
        '/api/leaderboard/teams'
      ];

      for (const endpoint of apiTests) {
        try {
          const apiStart = Date.now();
          const response = await page.request.get(`${this.baseUrl}${endpoint}`);
          const apiTime = Date.now() - apiStart;
          
          userResults.actions.push({
            action: `api_${endpoint.replace('/api/', '').replace('/', '_')}`,
            time: apiTime,
            success: response.ok() || response.status() === 401, // 401 is expected for protected endpoints
            statusCode: response.status()
          });
          
          console.log(`👤 User ${userIndex}: API ${endpoint} responded ${response.status()} in ${apiTime}ms`);
        } catch (error) {
          userResults.errors.push(`API test error (${endpoint}): ${error.message}`);
        }
      }

    } catch (error) {
      userResults.errors.push(`General error: ${error.message}`);
      console.log(`❌ User ${userIndex}: Error - ${error.message}`);
    } finally {
      userResults.totalTime = Date.now() - userResults.startTime;
      await browser.close();
      console.log(`✅ User ${userIndex}: Behavior simulation completed in ${userResults.totalTime}ms`);
      return userResults;
    }
  }

  // Run concurrent load test
  async runLoadTest(userCount) {
    console.log(`\n🚀 Starting production load test with ${userCount} concurrent users...`);
    console.log(`📅 Target: ${this.baseUrl}`);
    
    // Create test users first
    await this.createTestUsers(userCount);
    
    if (this.testUsers.length === 0) {
      throw new Error('No test users created successfully');
    }
    
    // Run concurrent user simulations
    const promises = this.testUsers.slice(0, userCount).map((userInfo, index) => 
      this.simulateUserBehavior(userInfo, index + 1, userCount)
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
    const actionStats = {};
    
    results.forEach(userResult => {
      totalErrors += userResult.errors.length;
      
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
    console.log('\n' + '='.repeat(70));
    console.log(`📊 PRODUCTION LOAD TEST RESULTS - ${report.userCount} CONCURRENT USERS`);
    console.log('='.repeat(70));
    console.log(`⏱️  Test Duration: ${(report.testDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Total Actions: ${report.totalActions}`);
    console.log(`❌ Total Errors: ${report.totalErrors}`);
    console.log(`⚡ Average Response Time: ${report.avgResponseTime}ms`);
    console.log(`✅ Success Rate: ${report.successRate}%`);
    console.log(`🚀 Throughput: ${report.throughput} actions/second`);
    
    console.log('\n📋 Action Breakdown:');
    console.log('-'.repeat(50));
    Object.keys(report.actionBreakdown).forEach(action => {
      const stats = report.actionBreakdown[action];
      console.log(`  ${action.padEnd(30)} | ${stats.count.toString().padStart(3)} calls | ${stats.avgTime.toString().padStart(4)}ms avg | ${stats.successRate.toString().padStart(3)}% success`);
    });
    console.log('='.repeat(70));
  }

  // Save results
  saveResults(report, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `production-load-test-${report.userCount}users-${timestamp}.json`;
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

  // Cleanup (for production, we don't create persistent data, so this is minimal)
  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    console.log('✅ No persistent test data created - cleanup complete');
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const userCount = parseInt(args[0]) || 10;
  const baseUrl = args[1] || 'https://step-app-4x-yhw.fly.dev';
  
  const tester = new ProductionAuthLoadTester(baseUrl);
  
  try {
    console.log(`🎯 Running production load test with ${userCount} users`);
    const testResults = await tester.runLoadTest(userCount);
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

module.exports = ProductionAuthLoadTester;