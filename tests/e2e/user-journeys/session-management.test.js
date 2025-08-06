/**
 * Session Management E2E Tests
 * 
 * Tests comprehensive session management including:
 * - Session persistence across page reloads
 * - Session timeout and expiration handling
 * - Cross-tab session behavior
 * - Logout functionality and cleanup
 * - Session security and validation
 * - Remember me functionality (if applicable)
 * 
 * Validates session state management, security, and user experience
 * across different scenarios and edge cases.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'session', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to get magic link for authentication
async function getMagicLinkForEmail(email, baseURL = 'http://localhost:3000') {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  const response = await fetch(`${baseURL}/dev/get-magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Failed to get magic link: ${response.status}`);
  }

  const data = await response.json();
  return data.magicLink;
}

// Helper function to check if user is authenticated
async function isUserAuthenticated(page) {
  try {
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check for dashboard elements that only appear when authenticated
    const authenticatedElements = [
      'text="My Steps"',
      'text="Individual"',
      'text="Teams"'
    ];
    
    for (const selector of authenticatedElements) {
      if (await page.locator(selector).isVisible()) {
        return true;
      }
    }
    
    // Check if redirected to login
    const currentUrl = page.url();
    const hasEmailInput = await page.locator('input[type="email"]').isVisible();
    
    return !hasEmailInput && !currentUrl.includes('/login');
  } catch (error) {
    console.log(`Authentication check error: ${error.message}`);
    return false;
  }
}

// Helper function to authenticate user
async function authenticateUser(page, email) {
  const magicLink = await getMagicLinkForEmail(email);
  await page.goto(magicLink);
  await page.waitForLoadState('networkidle');
  
  // Verify authentication successful
  const authenticated = await isUserAuthenticated(page);
  if (!authenticated) {
    throw new Error('Authentication failed');
  }
  
  return true;
}

// Helper function to logout user (if logout functionality exists)
async function logoutUser(page) {
  // Look for common logout mechanisms
  const logoutSelectors = [
    'text="Logout"', 'text="Log out"', 'text="Sign out"',
    'button:has-text("Logout")', 'a:has-text("Logout")',
    '[class*="logout"]', '#logout', '.logout-btn'
  ];
  
  for (const selector of logoutSelectors) {
    try {
      if (await page.locator(selector).isVisible()) {
        await page.locator(selector).click();
        await page.waitForTimeout(1000);
        return true;
      }
    } catch (e) {
      // Continue trying other selectors
    }
  }
  
  // If no explicit logout, try clearing cookies/localStorage
  console.log('No logout button found, clearing session data...');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Clear cookies
  const context = page.context();
  await context.clearCookies();
  
  return false; // No explicit logout found
}

test.describe('Session Management E2E Tests', () => {
  const testEmail = 'session-tester@example.com';
  
  test.beforeEach(async ({ page }) => {
    // Set up error logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`❌ Console Error: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      console.log(`❌ Page Error: ${error.message}`);
    });
  });

  test('Session Persistence Across Page Reloads', async ({ page }) => {
    console.log('🔄 Testing session persistence across page reloads...');
    
    // Step 1: Authenticate user
    console.log('🔑 Step 1: Authenticate user');
    await authenticateUser(page, testEmail);
    console.log('✅ User authenticated');
    
    await captureScreenshot(page, 'authenticated-initial');
    
    // Step 2: Test session persistence after page reload
    console.log('🔄 Step 2: Test session persistence after reload');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const stillAuthenticated = await isUserAuthenticated(page);
    console.log(`Session persisted after reload: ${stillAuthenticated ? '✅' : '❌'}`);
    
    await captureScreenshot(page, 'after-page-reload');
    expect(stillAuthenticated).toBe(true);
    
    // Step 3: Test session persistence after navigation
    console.log('🔄 Step 3: Test session persistence after navigation');
    
    const navigationTests = [
      { path: '/', name: 'home' },
      { path: '/dashboard', name: 'dashboard' },
      { path: '/', name: 'home-again' }
    ];
    
    for (const nav of navigationTests) {
      console.log(`  Navigating to ${nav.path}...`);
      await page.goto(`http://localhost:3000${nav.path}`);
      await page.waitForLoadState('networkidle');
      
      const authenticated = await isUserAuthenticated(page);
      console.log(`  Session active at ${nav.path}: ${authenticated ? '✅' : '❌'}`);
      
      await captureScreenshot(page, `navigation-${nav.name}`);
      
      if (!authenticated) {
        console.log(`❌ Session lost during navigation to ${nav.path}`);
        break;
      }
    }
    
    // Step 4: Test session after browser back/forward
    console.log('⬅️ Step 4: Test session with browser navigation');
    
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    const backAuthenticated = await isUserAuthenticated(page);
    console.log(`Session active after back: ${backAuthenticated ? '✅' : '❌'}`);
    
    await page.goForward();
    await page.waitForLoadState('networkidle');
    
    const forwardAuthenticated = await isUserAuthenticated(page);
    console.log(`Session active after forward: ${forwardAuthenticated ? '✅' : '❌'}`);
    
    await captureScreenshot(page, 'browser-navigation-final');
    
    console.log('✅ Session persistence tests completed');
  });

  test('Cross-Tab Session Behavior', async ({ browser }) => {
    console.log('🪟 Testing cross-tab session behavior...');
    
    // Create two browser contexts (tabs)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    try {
      // Step 1: Authenticate in first tab
      console.log('🔑 Step 1: Authenticate in first tab');
      await authenticateUser(page1, testEmail);
      await captureScreenshot(page1, 'tab1-authenticated');
      
      // Step 2: Check authentication status in second tab
      console.log('🔍 Step 2: Check session in second tab');
      const tab2Authenticated = await isUserAuthenticated(page2);
      console.log(`Tab 2 automatically authenticated: ${tab2Authenticated ? '✅' : '❌'}`);
      
      await captureScreenshot(page2, 'tab2-initial-state');
      
      if (!tab2Authenticated) {
        console.log('ℹ️  Second tab not automatically authenticated (expected for session-based auth)');
      }
      
      // Step 3: Test logout in one tab affects other
      console.log('🚪 Step 3: Test logout behavior across tabs');
      
      const logoutSuccessful = await logoutUser(page1);
      console.log(`Explicit logout available: ${logoutSuccessful ? '✅' : '❌'}`);
      
      await page1.waitForTimeout(1000);
      await captureScreenshot(page1, 'tab1-after-logout');
      
      // Check if first tab is logged out
      const tab1StillAuth = await isUserAuthenticated(page1);
      console.log(`Tab 1 logged out: ${!tab1StillAuth ? '✅' : '❌'}`);
      
      // Check second tab status after logout
      await page2.reload();
      await page2.waitForLoadState('networkidle');
      const tab2AfterLogout = await isUserAuthenticated(page2);
      console.log(`Tab 2 after logout: ${!tab2AfterLogout ? '✅ (logged out)' : '⚠️ (still authenticated)'}`);
      
      await captureScreenshot(page2, 'tab2-after-logout');
      
      console.log('✅ Cross-tab session tests completed');
      
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('Session Security and Validation', async ({ page }) => {
    console.log('🛡️ Testing session security and validation...');
    
    // Step 1: Test invalid session handling
    console.log('🚫 Step 1: Test invalid session handling');
    
    // First authenticate normally
    await authenticateUser(page, testEmail);
    await captureScreenshot(page, 'valid-session');
    
    // Step 2: Manipulate session data
    console.log('🔧 Step 2: Test session tampering detection');
    
    // Try to corrupt session data
    await page.evaluate(() => {
      // Attempt to modify localStorage/sessionStorage
      if (localStorage.getItem('sessionData')) {
        localStorage.setItem('sessionData', 'corrupted-data');
      }
      if (sessionStorage.getItem('authToken')) {
        sessionStorage.setItem('authToken', 'invalid-token');
      }
    });
    
    // Reload and check if session is still valid
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const sessionValidAfterTampering = await isUserAuthenticated(page);
    console.log(`Session valid after tampering: ${sessionValidAfterTampering ? '⚠️ (security issue)' : '✅ (protected)'}`);
    
    await captureScreenshot(page, 'after-session-tampering');
    
    // Step 3: Test expired session handling
    console.log('⏰ Step 3: Test session expiration (simulated)');
    
    // Re-authenticate for clean test
    if (!sessionValidAfterTampering) {
      await authenticateUser(page, testEmail);
    }
    
    // Try to simulate expired session by clearing cookies
    const context = page.context();
    await context.clearCookies();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const sessionValidAfterCookieClear = await isUserAuthenticated(page);
    console.log(`Session valid after cookie clear: ${sessionValidAfterCookieClear ? '⚠️ (potential issue)' : '✅ (expired correctly)'}`);
    
    await captureScreenshot(page, 'after-cookie-clear');
    
    // Step 4: Test concurrent session limits (if applicable)
    console.log('👥 Step 4: Test session validation');
    
    // Re-authenticate and test session validation
    await authenticateUser(page, testEmail);
    
    // Check session validation by inspecting cookies/storage
    const sessionData = await page.evaluate(() => {
      return {
        cookies: document.cookie,
        localStorage: Object.keys(localStorage),
        sessionStorage: Object.keys(sessionStorage)
      };
    });
    
    console.log(`Session data present:`, {
      cookies: sessionData.cookies.length > 0,
      localStorage: sessionData.localStorage.length > 0,
      sessionStorage: sessionData.sessionStorage.length > 0
    });
    
    await captureScreenshot(page, 'session-validation-final');
    
    console.log('✅ Session security tests completed');
  });

  test('Session Timeout and Idle Handling', async ({ page }) => {
    console.log('⏰ Testing session timeout and idle handling...');
    
    // Step 1: Authenticate user
    console.log('🔑 Step 1: Authenticate for timeout testing');
    await authenticateUser(page, testEmail);
    
    const initialTime = Date.now();
    await captureScreenshot(page, 'timeout-test-start');
    
    // Step 2: Test idle session behavior
    console.log('😴 Step 2: Test idle session behavior');
    
    // Simulate user activity periodically
    const activityTests = [
      { delay: 1000, activity: 'mouse-move', description: 'Mouse movement' },
      { delay: 2000, activity: 'click', description: 'Click activity' },
      { delay: 1500, activity: 'keyboard', description: 'Keyboard input' }
    ];
    
    for (const test of activityTests) {
      console.log(`  Testing ${test.description} after ${test.delay}ms idle...`);
      
      // Wait for idle period
      await page.waitForTimeout(test.delay);
      
      // Simulate activity
      switch (test.activity) {
        case 'mouse-move':
          await page.mouse.move(100, 100);
          break;
        case 'click':
          await page.mouse.click(500, 300);
          break;
        case 'keyboard':
          await page.keyboard.press('Space');
          break;
      }
      
      // Check session status
      const sessionActive = await isUserAuthenticated(page);
      const elapsedTime = Date.now() - initialTime;
      
      console.log(`  Session active after ${elapsedTime}ms (${test.description}): ${sessionActive ? '✅' : '❌'}`);
      
      await captureScreenshot(page, `activity-${test.activity}-${elapsedTime}`);
      
      if (!sessionActive) {
        console.log(`❌ Session expired during ${test.description} test`);
        break;
      }
    }
    
    // Step 3: Test extended idle period
    console.log('🕐 Step 3: Test extended idle period');
    
    const extendedIdlePeriod = 5000; // 5 seconds (simulating longer idle)
    console.log(`Waiting ${extendedIdlePeriod}ms without activity...`);
    
    await page.waitForTimeout(extendedIdlePeriod);
    
    const sessionAfterIdle = await isUserAuthenticated(page);
    const totalElapsed = Date.now() - initialTime;
    
    console.log(`Session active after ${totalElapsed}ms total idle: ${sessionAfterIdle ? '✅' : '⚠️'}`);
    await captureScreenshot(page, 'after-extended-idle');
    
    // Step 4: Test session refresh behavior
    console.log('🔄 Step 4: Test session refresh behavior');
    
    if (sessionAfterIdle) {
      // Navigate to different pages to test session refresh
      const pages = ['/dashboard', '/', '/dashboard'];
      
      for (const pagePath of pages) {
        await page.goto(`http://localhost:3000${pagePath}`);
        await page.waitForLoadState('networkidle');
        
        const sessionActive = await isUserAuthenticated(page);
        console.log(`  Session active after navigating to ${pagePath}: ${sessionActive ? '✅' : '❌'}`);
        
        if (!sessionActive) break;
      }
    }
    
    await captureScreenshot(page, 'timeout-test-final');
    console.log('✅ Session timeout tests completed');
  });

  test('Session Recovery and Error Handling', async ({ page }) => {
    console.log('🔧 Testing session recovery and error handling...');
    
    // Step 1: Test network interruption simulation
    console.log('🌐 Step 1: Test network interruption handling');
    
    await authenticateUser(page, testEmail);
    await captureScreenshot(page, 'before-network-test');
    
    // Simulate network offline
    await page.context().setOffline(true);
    console.log('📴 Network set to offline');
    
    // Try to navigate while offline
    try {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log('Expected network error while offline');
    }
    
    await captureScreenshot(page, 'offline-state');
    
    // Restore network
    await page.context().setOffline(false);
    console.log('📶 Network restored');
    
    await page.waitForTimeout(1000);
    
    // Test session recovery
    const sessionRecovered = await isUserAuthenticated(page);
    console.log(`Session recovered after network restore: ${sessionRecovered ? '✅' : '❌'}`);
    
    await captureScreenshot(page, 'after-network-recovery');
    
    // Step 2: Test server error handling
    console.log('🚨 Step 2: Test server error handling');
    
    if (sessionRecovered) {
      // Try to access a non-existent endpoint
      await page.goto('http://localhost:3000/non-existent-page');
      await page.waitForLoadState('networkidle');
      
      await captureScreenshot(page, '404-page');
      
      // Navigate back to dashboard
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      
      const sessionAfter404 = await isUserAuthenticated(page);
      console.log(`Session maintained after 404 error: ${sessionAfter404 ? '✅' : '❌'}`);
    }
    
    // Step 3: Test browser refresh during authentication
    console.log('🔄 Step 3: Test refresh during authentication');
    
    // Logout first
    await logoutUser(page);
    
    // Start authentication process
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(testEmail);
      await page.locator('button:has-text("Send Login Link")').click();
      
      // Refresh page during login process
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      await captureScreenshot(page, 'refresh-during-auth');
      
      // Complete authentication
      const magicLink = await getMagicLinkForEmail(testEmail);
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');
      
      const authAfterRefresh = await isUserAuthenticated(page);
      console.log(`Authentication successful after refresh: ${authAfterRefresh ? '✅' : '❌'}`);
    }
    
    await captureScreenshot(page, 'recovery-test-final');
    console.log('✅ Session recovery tests completed');
  });

  test('Session Data Integrity and Storage', async ({ page }) => {
    console.log('💾 Testing session data integrity and storage...');
    
    // Step 1: Authenticate and examine session storage
    console.log('🔍 Step 1: Examine session storage mechanisms');
    
    await authenticateUser(page, testEmail);
    
    // Capture session storage state
    const storageState = await page.evaluate(() => {
      const cookies = document.cookie.split(';').map(c => c.trim());
      const localStorageItems = {};
      const sessionStorageItems = {};
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        localStorageItems[key] = localStorage.getItem(key);
      }
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        sessionStorageItems[key] = sessionStorage.getItem(key);
      }
      
      return {
        cookies,
        localStorage: localStorageItems,
        sessionStorage: sessionStorageItems
      };
    });
    
    console.log('Session storage analysis:');
    console.log(`  Cookies: ${storageState.cookies.length} items`);
    console.log(`  LocalStorage: ${Object.keys(storageState.localStorage).length} items`);
    console.log(`  SessionStorage: ${Object.keys(storageState.sessionStorage).length} items`);
    
    // Step 2: Test storage persistence
    console.log('💾 Step 2: Test storage persistence');
    
    // Add custom data to test persistence
    await page.evaluate(() => {
      localStorage.setItem('test-persistence', 'test-value-' + Date.now());
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const persistedValue = await page.evaluate(() => {
      return localStorage.getItem('test-persistence');
    });
    
    const sessionStillActive = await isUserAuthenticated(page);
    
    console.log(`Custom localStorage persisted: ${persistedValue ? '✅' : '❌'}`);
    console.log(`Session persisted with custom data: ${sessionStillActive ? '✅' : '❌'}`);
    
    // Step 3: Test storage limits and cleanup
    console.log('🧹 Step 3: Test storage cleanup');
    
    // Test localStorage cleanup
    await page.evaluate(() => {
      // Clean up test data
      localStorage.removeItem('test-persistence');
    });
    
    const cleanupSuccessful = await page.evaluate(() => {
      return !localStorage.getItem('test-persistence');
    });
    
    console.log(`Storage cleanup successful: ${cleanupSuccessful ? '✅' : '❌'}`);
    
    // Step 4: Test storage security
    console.log('🔐 Step 4: Test storage security');
    
    // Check for sensitive data exposure
    const sensitiveDataCheck = await page.evaluate(() => {
      const allStorage = {
        ...localStorage,
        ...sessionStorage
      };
      
      const sensitivePatterns = ['password', 'secret', 'private', 'key'];
      const suspiciousItems = [];
      
      for (const [key, value] of Object.entries(allStorage)) {
        const combined = (key + value).toLowerCase();
        for (const pattern of sensitivePatterns) {
          if (combined.includes(pattern)) {
            suspiciousItems.push({ key, pattern });
          }
        }
      }
      
      return suspiciousItems;
    });
    
    if (sensitiveDataCheck.length === 0) {
      console.log('✅ No obvious sensitive data in storage');
    } else {
      console.log(`⚠️  Found ${sensitiveDataCheck.length} potentially sensitive storage items`);
    }
    
    await captureScreenshot(page, 'storage-integrity-final');
    console.log('✅ Session storage integrity tests completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up session management test...');
    
    // Cleanup: try to logout and clear storage
    try {
      await logoutUser(page);
    } catch (e) {
      console.log('Logout cleanup skipped (expected if already logged out)');
    }
  });
});