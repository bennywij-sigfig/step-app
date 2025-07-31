const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class LoadTester {
  constructor(baseUrl = 'https://step-app-4x-yhw.fly.dev') {
    this.baseUrl = baseUrl;
    this.results = {
      userCounts: [],
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      testDuration: 0,
      userResults: []
    };
    this.startTime = null;
  }

  // Generate test emails
  generateTestEmails(count) {
    const emails = [];
    for (let i = 1; i <= count; i++) {
      emails.push(`loadtest${i}@example.com`);
    }
    return emails;
  }

  // Simulate a single user journey
  async simulateUser(email, userIndex, totalUsers) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const userResults = {
      email,
      userIndex,
      totalUsers,
      actions: [],
      errors: [],
      totalTime: 0,
      startTime: Date.now()
    };

    try {
      console.log(`👤 User ${userIndex}/${totalUsers} (${email}): Starting journey...`);

      // 1. Navigate to homepage
      const homeStart = Date.now();
      await page.goto(this.baseUrl, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      const homeTime = Date.now() - homeStart;
      userResults.actions.push({ action: 'homepage', time: homeTime, success: true });
      console.log(`👤 User ${userIndex}: Homepage loaded in ${homeTime}ms`);

      // 2. Request magic link
      const loginStart = Date.now();
      const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await emailInput.fill(email);
      
      const sendButton = await page.waitForSelector('button:has-text("Send Login Link")', { timeout: 10000 });
      await sendButton.click();
      
      // Wait for feedback (success message or redirect)
      await Promise.race([
        page.waitForSelector('.success', { timeout: 5000 }).catch(() => null),
        page.waitForTimeout(3000)
      ]);
      
      const loginTime = Date.now() - loginStart;
      userResults.actions.push({ action: 'magic_link_request', time: loginTime, success: true });
      console.log(`👤 User ${userIndex}: Magic link requested in ${loginTime}ms`);

      // 3. Simulate clicking magic link (create authenticated session)
      // In a real load test, you'd need actual magic links, but we'll simulate with direct dashboard access
      const dashStart = Date.now();
      
      // Try to access dashboard directly (simulating magic link click)
      await page.goto(`${this.baseUrl}/dashboard`, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      
      // Check if we're actually on dashboard or redirected to login
      const currentUrl = page.url();
      const dashboardAccess = currentUrl.includes('/dashboard');
      
      const dashTime = Date.now() - dashStart;
      userResults.actions.push({ 
        action: 'dashboard_access', 
        time: dashTime, 
        success: dashboardAccess 
      });
      
      if (!dashboardAccess) {
        console.log(`👤 User ${userIndex}: Redirected to login (expected for load test)`);
        userResults.totalTime = Date.now() - userResults.startTime;
        return userResults;
      }

      console.log(`👤 User ${userIndex}: Dashboard accessed in ${dashTime}ms`);

      // 4. Navigate through tabs (simulate leaderboard viewing)
      const tabs = ['Individual', 'Teams'];
      for (const tabName of tabs) {
        try {
          const tabStart = Date.now();
          const tabElement = page.locator(`text="${tabName}"`).first();
          
          if (await tabElement.isVisible({ timeout: 5000 })) {
            await tabElement.click();
            await page.waitForTimeout(1000); // Wait for content to load
            
            const tabTime = Date.now() - tabStart;
            userResults.actions.push({ 
              action: `view_${tabName.toLowerCase()}_leaderboard`, 
              time: tabTime, 
              success: true 
            });
            console.log(`👤 User ${userIndex}: Viewed ${tabName} tab in ${tabTime}ms`);
          }
        } catch (error) {
          userResults.errors.push(`Tab navigation error (${tabName}): ${error.message}`);
        }
      }

      // 5. Submit steps (if possible)
      try {
        const stepsStart = Date.now();
        
        // Go to My Steps tab
        const myStepsTab = page.locator('text="My Steps"').first();
        if (await myStepsTab.isVisible({ timeout: 5000 })) {
          await myStepsTab.click();
          await page.waitForTimeout(1000);
          
          // Fill and submit steps
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
        }
      } catch (error) {
        userResults.errors.push(`Steps submission error: ${error.message}`);
      }

    } catch (error) {
      userResults.errors.push(`General error: ${error.message}`);
      console.log(`❌ User ${userIndex}: Error - ${error.message}`);
    } finally {
      userResults.totalTime = Date.now() - userResults.startTime;
      await browser.close();
      console.log(`✅ User ${userIndex}: Journey completed in ${userResults.totalTime}ms`);
      return userResults;
    }
  }

  // Run concurrent users
  async runConcurrentUsers(userCount) {
    console.log(`\n🚀 Starting load test with ${userCount} concurrent users...`);
    const emails = this.generateTestEmails(userCount);
    const promises = emails.map((email, index) => 
      this.simulateUser(email, index + 1, userCount)
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

  // Analyze and report results
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

  // Print detailed report
  printReport(report) {
    console.log('\n' + '='.repeat(60));
    console.log(`📊 LOAD TEST RESULTS - ${report.userCount} CONCURRENT USERS`);
    console.log('='.repeat(60));
    console.log(`⏱️  Test Duration: ${(report.testDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Total Actions: ${report.totalActions}`);
    console.log(`❌ Total Errors: ${report.totalErrors}`);
    console.log(`⚡ Average Response Time: ${report.avgResponseTime}ms`);
    console.log(`✅ Success Rate: ${report.successRate}%`);
    console.log(`🚀 Throughput: ${report.throughput} actions/second`);
    
    console.log('\n📋 Action Breakdown:');
    console.log('-'.repeat(40));
    Object.keys(report.actionBreakdown).forEach(action => {
      const stats = report.actionBreakdown[action];
      console.log(`  ${action.padEnd(25)} | ${stats.count.toString().padStart(3)} calls | ${stats.avgTime.toString().padStart(4)}ms avg | ${stats.successRate.toString().padStart(3)}% success`);
    });
    console.log('='.repeat(60));
  }

  // Save results to file
  saveResults(report, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `load-test-results-${report.userCount}users-${timestamp}.json`;
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

  // Run full test suite
  async runTestSuite() {
    const userCounts = [10, 20, 40];
    const allResults = [];
    
    console.log('🎯 Starting comprehensive load test suite...');
    console.log(`📅 Target: ${this.baseUrl}`);
    console.log(`👥 User counts: ${userCounts.join(', ')}`);
    
    for (const userCount of userCounts) {
      console.log(`\n${'='.repeat(20)} ${userCount} USERS ${'='.repeat(20)}`);
      
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
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY COMPARISON');
    console.log('='.repeat(80));
    console.log('Users | Duration | Actions | Errors | Avg Time | Success | Throughput');
    console.log('-'.repeat(80));
    
    allResults.forEach(report => {
      console.log(`${report.userCount.toString().padStart(5)} | ${(report.testDuration/1000).toFixed(1).padStart(8)} | ${report.totalActions.toString().padStart(7)} | ${report.totalErrors.toString().padStart(6)} | ${report.avgResponseTime.toString().padStart(8)} | ${report.successRate.toString().padStart(7)}% | ${report.throughput.toString().padStart(10)}/s`);
    });
    
    console.log('='.repeat(80));
    console.log('✅ Load test suite completed!');
    
    return allResults;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const userCount = args[0] ? parseInt(args[0]) : null;
  const baseUrl = args[1] || 'https://step-app-4x-yhw.fly.dev';
  
  const tester = new LoadTester(baseUrl);
  
  if (userCount) {
    // Single test with specified user count
    console.log(`🎯 Running single load test with ${userCount} users`);
    const testResults = await tester.runConcurrentUsers(userCount);
    const report = tester.analyzeResults(testResults);
    tester.printReport(report);
    tester.saveResults(report);
  } else {
    // Full test suite
    await tester.runTestSuite();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = LoadTester;