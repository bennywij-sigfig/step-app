const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class AuthenticatedLoadTester {
  constructor(baseUrl = 'https://step-app-4x-yhw.fly.dev', sessionsFile = 'test-sessions.json') {
    this.baseUrl = baseUrl;
    this.sessionsFile = path.join(__dirname, sessionsFile);
    this.sessions = [];
    this.results = {
      userCounts: [],
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      testDuration: 0,
      userResults: []
    };
    this.cleanupOnExit = true; // Auto-cleanup by default
    this.testUserIds = new Set(); // Track created test user IDs
  }

  // Load authenticated sessions
  loadSessions() {
    if (!fs.existsSync(this.sessionsFile)) {
      throw new Error(`Sessions file not found: ${this.sessionsFile}. Run create-test-users.js first.`);
    }
    
    const sessionData = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf8'));
    this.sessions = sessionData.sessions;
    
    console.log(`📋 Loaded ${this.sessions.length} authenticated sessions`);
    console.log(`🕒 Sessions created: ${sessionData.created}`);
    
    return this.sessions;
  }

  // Simulate authenticated user journey
  async simulateAuthenticatedUser(sessionInfo, userIndex, totalUsers) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const userResults = {
      email: sessionInfo.email,
      userId: sessionInfo.userId,
      userIndex,
      totalUsers,
      actions: [],
      errors: [],
      totalTime: 0,
      startTime: Date.now()
    };

    try {
      console.log(`👤 User ${userIndex}/${totalUsers} (${sessionInfo.email}): Starting authenticated journey...`);

      // Set session cookie to authenticate
      await context.addCookies([{
        name: 'connect.sid',
        value: sessionInfo.sessionCookie.split('=')[1], // Extract value after 'connect.sid='
        domain: new URL(this.baseUrl).hostname,
        path: '/',
        httpOnly: true,
        secure: this.baseUrl.startsWith('https'),
        sameSite: 'Lax'
      }]);

      // 1. Access dashboard directly (authenticated)
      const dashStart = Date.now();
      await page.goto(`${this.baseUrl}/dashboard`, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      
      // Verify we're actually authenticated (not redirected to login)
      const currentUrl = page.url();
      const isAuthenticated = currentUrl.includes('/dashboard');
      
      const dashTime = Date.now() - dashStart;
      userResults.actions.push({ 
        action: 'dashboard_access', 
        time: dashTime, 
        success: isAuthenticated 
      });
      
      if (!isAuthenticated) {
        console.log(`❌ User ${userIndex}: Authentication failed - redirected to login`);
        userResults.errors.push('Authentication failed - redirected to login');
        userResults.totalTime = Date.now() - userResults.startTime;
        return userResults;
      }

      console.log(`👤 User ${userIndex}: Dashboard accessed (authenticated) in ${dashTime}ms`);

      // 2. Get CSRF token for API calls
      let csrfToken = sessionInfo.csrfToken;
      try {
        const csrfResponse = await page.request.get(`${this.baseUrl}/api/csrf-token`);
        if (csrfResponse.ok()) {
          const csrfData = await csrfResponse.json();
          csrfToken = csrfData.csrfToken;
        }
      } catch (error) {
        console.log(`⚠️  User ${userIndex}: Could not fetch CSRF token, using stored one`);
      }

      // 3. Navigate through dashboard tabs
      const tabs = ['Individual', 'Teams', 'My Steps'];
      for (const tabName of tabs) {
        try {
          const tabStart = Date.now();
          const tabElement = page.locator(`text="${tabName}"`).first();
          
          if (await tabElement.isVisible({ timeout: 5000 })) {
            await tabElement.click();
            await page.waitForTimeout(1000); // Wait for content to load
            
            const tabTime = Date.now() - tabStart;
            userResults.actions.push({ 
              action: `view_${tabName.toLowerCase().replace(' ', '_')}_tab`, 
              time: tabTime, 
              success: true 
            });
            console.log(`👤 User ${userIndex}: Viewed ${tabName} tab in ${tabTime}ms`);
            
            // Special handling for My Steps tab - interact with form
            if (tabName === 'My Steps') {
              await this.interactWithStepsForm(page, userIndex, userResults, csrfToken);
            }
            
            // Special handling for Teams tab - expand team details
            if (tabName === 'Teams') {
              await this.interactWithTeamsTab(page, userIndex, userResults);
            }
          }
        } catch (error) {
          userResults.errors.push(`Tab navigation error (${tabName}): ${error.message}`);
          console.log(`❌ User ${userIndex}: Tab error (${tabName}): ${error.message}`);
        }
      }

      // 4. Test API endpoints directly
      await this.testApiEndpoints(page, userIndex, userResults, csrfToken);

    } catch (error) {
      userResults.errors.push(`General error: ${error.message}`);
      console.log(`❌ User ${userIndex}: Error - ${error.message}`);
    } finally {
      userResults.totalTime = Date.now() - userResults.startTime;
      await browser.close();
      console.log(`✅ User ${userIndex}: Authenticated journey completed in ${userResults.totalTime}ms`);
      return userResults;
    }
  }

  // Interact with steps form
  async interactWithStepsForm(page, userIndex, userResults, csrfToken) {
    try {
      const stepsStart = Date.now();
      
      // Look for steps input and submit button
      const stepsInput = page.locator('input[type="number"]').first();
      const submitButton = page.locator('button:has-text("Log Steps")').first();
      
      if (await stepsInput.isVisible({ timeout: 5000 }) && await submitButton.isVisible({ timeout: 5000 })) {
        const randomSteps = Math.floor(Math.random() * 10000) + 1000; // 1000-11000 steps
        await stepsInput.fill(randomSteps.toString());
        await submitButton.click();
        
        // Wait for response
        await page.waitForTimeout(2000);
        
        const stepsTime = Date.now() - stepsStart;
        userResults.actions.push({ 
          action: 'submit_steps', 
          time: stepsTime, 
          success: true,
          steps: randomSteps
        });
        console.log(`👤 User ${userIndex}: Submitted ${randomSteps} steps in ${stepsTime}ms`);
      }
    } catch (error) {
      userResults.errors.push(`Steps form interaction error: ${error.message}`);
    }
  }

  // Interact with teams tab (expand team details)
  async interactWithTeamsTab(page, userIndex, userResults) {
    try {
      const teamsStart = Date.now();
      
      // Look for disclosure triangles (▶ symbols)
      const triangles = page.locator('text="▶"');
      const triangleCount = await triangles.count();
      
      if (triangleCount > 0) {
        // Click the first triangle to expand team details
        await triangles.first().click();
        await page.waitForTimeout(1000);
        
        // Check if it expanded (triangle changed to ▼)
        const expandedTriangle = page.locator('text="▼"').first();
        const expanded = await expandedTriangle.isVisible({ timeout: 2000 });
        
        const teamsTime = Date.now() - teamsStart;
        userResults.actions.push({ 
          action: 'expand_team_details', 
          time: teamsTime, 
          success: expanded
        });
        
        if (expanded) {
          console.log(`👤 User ${userIndex}: Expanded team details in ${teamsTime}ms`);
        }
      }
    } catch (error) {
      userResults.errors.push(`Teams interaction error: ${error.message}`);
    }
  }

  // Test API endpoints directly
  async testApiEndpoints(page, userIndex, userResults, csrfToken) {
    const apiTests = [
      { endpoint: '/api/user', method: 'GET', name: 'get_user_profile' },
      { endpoint: '/api/steps', method: 'GET', name: 'get_user_steps' },
      { endpoint: '/api/leaderboard/individual', method: 'GET', name: 'get_individual_leaderboard' },
      { endpoint: '/api/leaderboard/teams', method: 'GET', name: 'get_teams_leaderboard' }
    ];

    for (const test of apiTests) {
      try {
        const apiStart = Date.now();
        
        const response = await page.request.get(`${this.baseUrl}${test.endpoint}`, {
          headers: {
            'X-CSRF-Token': csrfToken
          }
        });
        
        const apiTime = Date.now() - apiStart;
        const success = response.ok();
        
        userResults.actions.push({ 
          action: test.name, 
          time: apiTime, 
          success: success,
          statusCode: response.status()
        });
        
        if (success) {
          console.log(`👤 User ${userIndex}: API ${test.name} succeeded in ${apiTime}ms`);
        } else {
          console.log(`⚠️  User ${userIndex}: API ${test.name} failed (${response.status()}) in ${apiTime}ms`);
        }
        
      } catch (error) {
        userResults.errors.push(`API test error (${test.name}): ${error.message}`);
      }
    }
  }

  // Run concurrent authenticated users
  async runConcurrentUsers(userCount) {
    this.loadSessions();
    
    if (userCount > this.sessions.length) {
      throw new Error(`Requested ${userCount} users but only ${this.sessions.length} sessions available. Create more test users first.`);
    }
    
    console.log(`\n🚀 Starting authenticated load test with ${userCount} concurrent users...`);
    
    // Select random sessions for this test
    const selectedSessions = this.sessions
      .slice(0, userCount) // Take first N sessions
      .map((session, index) => ({ ...session, originalIndex: index }));
    
    const promises = selectedSessions.map((sessionInfo, index) => 
      this.simulateAuthenticatedUser(sessionInfo, index + 1, userCount)
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

  // Analyze and report results (same as original load test)
  analyzeResults(testResults) {
    const { userCount, duration, results } = testResults;
    
    let totalActions = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;
    let authenticatedUsers = 0;
    const actionStats = {};
    
    results.forEach(userResult => {
      totalErrors += userResult.errors.length;
      
      // Check if user was successfully authenticated
      const dashboardAccess = userResult.actions.find(a => a.action === 'dashboard_access');
      if (dashboardAccess && dashboardAccess.success) {
        authenticatedUsers++;
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
      authenticatedUsers,
      authenticationRate: Math.round((authenticatedUsers / userCount) * 100),
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

  // Print detailed report
  printReport(report) {
    console.log('\n' + '='.repeat(70));
    console.log(`📊 AUTHENTICATED LOAD TEST RESULTS - ${report.userCount} CONCURRENT USERS`);
    console.log('='.repeat(70));
    console.log(`🔐 Authentication Rate: ${report.authenticationRate}% (${report.authenticatedUsers}/${report.userCount} users)`);
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

  // Save results to file
  saveResults(report, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `authenticated-load-test-${report.userCount}users-${timestamp}.json`;
    }
    
    const resultsPath = path.join(__dirname, 'load-test-results', filename);
    
    // Ensure directory exists
    const resultsDir = path.dirname(resultsPath);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
    console.log(`💾 Results saved to: ${resultsPath}`);
    return resultsPath;
  }

  // Cleanup test data
  async cleanup() {
    if (!this.cleanupOnExit) {
      console.log('🚫 Cleanup disabled - test data will remain');
      return;
    }

    console.log('\n🧹 Cleaning up test data...');
    
    try {
      const TestUserGenerator = require('./create-test-users');
      const generator = new TestUserGenerator();
      await generator.cleanupTestUsers();
      generator.close();
      
      // Remove sessions file
      if (fs.existsSync(this.sessionsFile)) {
        fs.unlinkSync(this.sessionsFile);
        console.log('✅ Removed test sessions file');
      }
      
      console.log('✅ Test cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  }

  // Set cleanup behavior
  setCleanup(enabled) {
    this.cleanupOnExit = enabled;
    return this;
  }

  // Run full test suite
  async runTestSuite() {
    const userCounts = [10, 20, 40];
    const allResults = [];
    
    this.loadSessions();
    const maxUsers = Math.min(this.sessions.length, Math.max(...userCounts));
    
    console.log('🎯 Starting comprehensive authenticated load test suite...');
    console.log(`📅 Target: ${this.baseUrl}`);
    console.log(`👥 Available sessions: ${this.sessions.length}`);
    console.log(`👥 User counts: ${userCounts.filter(c => c <= maxUsers).join(', ')}`);
    
    for (const userCount of userCounts) {
      if (userCount > this.sessions.length) {
        console.log(`⚠️  Skipping ${userCount} users - only ${this.sessions.length} sessions available`);
        continue;
      }
      
      console.log(`\n${'='.repeat(25)} ${userCount} AUTHENTICATED USERS ${'='.repeat(25)}`);
      
      const testResults = await this.runConcurrentUsers(userCount);
      const report = this.analyzeResults(testResults);
      
      this.printReport(report);
      this.saveResults(report);
      
      allResults.push(report);
      
      // Wait 30 seconds between tests to let server recover
      if (userCount !== userCounts[userCounts.length - 1]) {
        console.log('\n⏳ Waiting 30 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    // Summary comparison
    if (allResults.length > 0) {
      console.log('\n' + '='.repeat(90));
      console.log('📊 AUTHENTICATED LOAD TEST SUMMARY');
      console.log('='.repeat(90));
      console.log('Users | Auth% | Duration | Actions | Errors | Avg Time | Success | Throughput');
      console.log('-'.repeat(90));
      
      allResults.forEach(report => {
        console.log(`${report.userCount.toString().padStart(5)} | ${report.authenticationRate.toString().padStart(4)}% | ${(report.testDuration/1000).toFixed(1).padStart(8)} | ${report.totalActions.toString().padStart(7)} | ${report.totalErrors.toString().padStart(6)} | ${report.avgResponseTime.toString().padStart(8)} | ${report.successRate.toString().padStart(7)}% | ${report.throughput.toString().padStart(10)}/s`);
      });
      
      console.log('='.repeat(90));
    }
    console.log('✅ Authenticated load test suite completed!');
    
    // Cleanup test data
    await this.cleanup();
    
    return allResults;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const userCount = args[0] ? parseInt(args[0]) : null;
  const baseUrl = args[1] || 'https://step-app-4x-yhw.fly.dev';
  
  const tester = new AuthenticatedLoadTester(baseUrl);
  
  try {
    if (userCount) {
      // Single test with specified user count
      console.log(`🎯 Running single authenticated load test with ${userCount} users`);
      const testResults = await tester.runConcurrentUsers(userCount);
      const report = tester.analyzeResults(testResults);
      tester.printReport(report);
      tester.saveResults(report);
      
      // Cleanup after single test
      await tester.cleanup();
    } else {
      // Full test suite
      await tester.runTestSuite();
    }
  } catch (error) {
    console.error(`❌ Load test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = AuthenticatedLoadTester;