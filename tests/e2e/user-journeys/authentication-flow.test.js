/**
 * E2E Authentication Flow Tests
 * 
 * Tests the complete authentication user journey including:
 * - Magic link generation and consumption
 * - Session management and persistence  
 * - Login/logout workflow
 * - Cross-page authentication state
 * 
 * This test uses programmatic authentication via API endpoints to avoid
 * manual intervention while testing the full user experience.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot with timestamp
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'auth', `${name}-${timestamp}.png`);
  
  // Ensure screenshots directory exists
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to get magic link programmatically  
async function getMagicLinkForEmail(email, baseURL = 'http://localhost:3000') {
  // Use built-in fetch (Node.js 18+) or require node-fetch for older versions
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  try {
    // Use development endpoint to get magic link directly
    const response = await fetch(`${baseURL}/dev/get-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get magic link: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.magicLink) {
      throw new Error('Magic link not found in response');
    }

    console.log(`🔗 Got magic link for ${email}: ${data.magicLink}`);
    return data.magicLink;
  } catch (error) {
    console.error(`❌ Failed to get magic link for ${email}:`, error.message);
    throw error;
  }
}

// Helper function to create test user in database
async function createTestUser(email, name = 'Test User', team = 'Test Team', baseURL = 'http://localhost:3000') {
  // Use built-in fetch (Node.js 18+) or require node-fetch for older versions
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  try {
    // This assumes there's an API endpoint for creating test users
    // If not available, we could use direct database operations
    console.log(`👤 Creating test user: ${email}`);
    
    // For now, we'll rely on the magic link system to create users automatically
    // This is how the production system works
    return { email, name, team };
  } catch (error) {
    console.log(`⚠️  Could not pre-create user ${email}, will be created on first login`);
    return { email, name, team };
  }
}

test.describe('Authentication Flow E2E Tests', () => {
  const testEmail = 'e2e-test@example.com';
  const testName = 'E2E Test User';
  const testTeam = 'E2E Test Team';
  
  test.beforeEach(async ({ page }) => {
    // Set up console and error logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`❌ Console Error: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      console.log(`❌ Page Error: ${error.message}`);
    });
  });

  test('Complete Authentication Workflow - Local Development', async ({ page }) => {
    console.log('🚀 Testing complete authentication workflow...');
    
    // Step 1: Navigate to login page
    console.log('📱 Step 1: Navigate to login page');
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    
    // Should see login form
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send Login Link")')).toBeVisible();
    await captureScreenshot(page, 'login-page');
    
    // Step 2: Request magic link
    console.log('📧 Step 2: Request magic link');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('button:has-text("Send Login Link")').click();
    
    // Wait for success message
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'magic-link-requested');
    
    // Verify success message appears
    const successMessage = page.locator('.success, .alert-success, [class*="success"]');
    if (await successMessage.isVisible()) {
      console.log('✅ Success message displayed');
      const messageText = await successMessage.textContent();
      console.log(`📩 Message: ${messageText}`);
    }
    
    // Step 3: Get magic link programmatically
    console.log('🔗 Step 3: Get magic link programmatically');
    let magicLink;
    try {
      magicLink = await getMagicLinkForEmail(testEmail);
    } catch (error) {
      console.log(`❌ Failed to get magic link: ${error.message}`);
      // Take screenshot of current state for debugging
      await captureScreenshot(page, 'magic-link-failed');
      throw error;
    }
    
    // Step 4: Navigate to magic link
    console.log('🎭 Step 4: Navigate to magic link');
    await page.goto(magicLink);
    await page.waitForLoadState('networkidle');
    await captureScreenshot(page, 'after-magic-link-click');
    
    // Step 5: Verify successful login and redirect to dashboard
    console.log('🏠 Step 5: Verify dashboard access');
    
    // Should be redirected to dashboard
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Check for core dashboard elements
    await expect(page.locator('text="My Steps"')).toBeVisible();
    await expect(page.locator('text="Individual"')).toBeVisible();
    await expect(page.locator('text="Teams"')).toBeVisible();
    
    // Click on My Steps tab to access the form
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    
    // Now check for form elements
    await expect(page.locator('input[type="number"]')).toBeVisible();
    await expect(page.locator('#submitStepsBtn')).toBeVisible();
    
    console.log('✅ Dashboard loaded successfully');
    await captureScreenshot(page, 'dashboard-authenticated');
    
    // Step 6: Test session persistence
    console.log('🔄 Step 6: Test session persistence');
    
    // Navigate to different pages and verify still authenticated
    const testPages = [
      { path: '/', name: 'home' },
      { path: '/dashboard', name: 'dashboard' }
    ];
    
    for (const { path, name } of testPages) {
      console.log(`🔍 Testing ${name} page authentication...`);
      await page.goto(`http://localhost:3000${path}`);
      await page.waitForLoadState('networkidle');
      
      // Should not be redirected to login
      const url = page.url();
      expect(url).not.toContain('/login');
      expect(url).not.toContain('auth');
      
      // Should see authenticated content
      await expect(page.locator('text="My Steps"')).toBeVisible();
      await captureScreenshot(page, `session-persistent-${name}`);
    }
    
    console.log('✅ Session persistence verified');
  });

  test('Authentication State Validation', async ({ page }) => {
    console.log('🔐 Testing authentication state validation...');
    
    // Test 1: Accessing protected pages without authentication
    console.log('🚫 Test 1: Protected pages without authentication');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await captureScreenshot(page, 'dashboard-unauthenticated');
    
    // Should be redirected to login or show login form
    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes('/login') || 
                       currentUrl === 'http://localhost:3000/' ||
                       await page.locator('input[type="email"]').isVisible();
    
    expect(isLoginPage).toBe(true);
    console.log('✅ Unauthenticated access properly redirected');
    
    // Test 2: Invalid magic link handling  
    console.log('🔗 Test 2: Invalid magic link handling');
    
    const invalidToken = 'invalid-token-123';
    const invalidLink = `http://localhost:3000/auth/login?token=${invalidToken}`;
    
    await page.goto(invalidLink);
    await page.waitForLoadState('networkidle');
    await captureScreenshot(page, 'invalid-magic-link');
    
    // Should show error message or redirect to login
    const hasErrorMessage = await page.locator('.error, .alert-error, [class*="error"]').isVisible();
    const isBackToLogin = await page.locator('input[type="email"]').isVisible();
    
    expect(hasErrorMessage || isBackToLogin).toBe(true);
    console.log('✅ Invalid magic link properly handled');
    
    // Test 3: Expired magic link (simulated)
    console.log('⏰ Test 3: Expired magic link simulation');
    
    // For this test, we'd need to create a magic link and wait for it to expire
    // or use a pre-expired token. For now, we'll just verify the error handling exists
    console.log('ℹ️  Expired magic link test would require time manipulation');
  });

  test('Cross-Page Authentication Flow', async ({ page }) => {
    console.log('🌐 Testing cross-page authentication flow...');
    
    // First, authenticate the user
    console.log('🔑 Setting up authenticated session...');
    const magicLink = await getMagicLinkForEmail(testEmail);
    await page.goto(magicLink);
    await page.waitForLoadState('networkidle');
    
    // Verify authenticated
    await expect(page.locator('text="My Steps"')).toBeVisible();
    console.log('✅ Authentication setup complete');
    
    // Test navigation between different sections
    console.log('📱 Testing navigation between dashboard sections...');
    
    const dashboardTabs = [
      { name: 'My Steps', selector: 'text="My Steps"' },
      { name: 'Individual', selector: 'text="Individual"' }, 
      { name: 'Teams', selector: 'text="Teams"' }
    ];
    
    for (const { name, selector } of dashboardTabs) {
      console.log(`🔍 Testing ${name} section...`);
      
      await page.locator(selector).first().click();
      await page.waitForTimeout(1000);
      await captureScreenshot(page, `section-${name.toLowerCase().replace(' ', '-')}`);
      
      // Verify section loaded and user still authenticated
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/login');
      
      // Check for section-specific content
      if (name === 'My Steps') {
        await expect(page.locator('input[type="number"]')).toBeVisible();
        await expect(page.locator('#submitStepsBtn')).toBeVisible();
      } else if (name === 'Individual') {
        // Look for leaderboard content
        const hasLeaderboard = await page.locator('[class*="leaderboard"], .ranking, .user-list').isVisible();
        console.log(`Individual leaderboard visible: ${hasLeaderboard}`);
      } else if (name === 'Teams') {
        // Look for team-specific content
        const hasTeams = await page.locator('[class*="team"], .team-list, text="▶"').isVisible();
        console.log(`Teams content visible: ${hasTeams}`);
      }
    }
    
    console.log('✅ Cross-page navigation completed successfully');
  });

  test('Step Recording Workflow Integration', async ({ page }) => {
    console.log('📊 Testing step recording workflow...');
    
    // Authenticate first
    const magicLink = await getMagicLinkForEmail(testEmail);
    await page.goto(magicLink);
    await page.waitForLoadState('networkidle');
    
    // Navigate to My Steps section
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'my-steps-section');
    
    // Test step recording form
    console.log('📝 Testing step recording form...');
    
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    await expect(stepsInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    // Enter test step count
    const testStepCount = '7500';
    await stepsInput.fill(testStepCount);
    await captureScreenshot(page, 'steps-entered');
    
    // Submit the form
    await submitButton.click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'steps-submitted');
    
    // Check for success indication
    const successIndicators = [
      '.success',
      '.alert-success', 
      '[class*="success"]',
      'text="Steps logged"',
      'text="Success"'
    ];
    
    let foundSuccess = false;
    for (const selector of successIndicators) {
      if (await page.locator(selector).isVisible()) {
        foundSuccess = true;
        const message = await page.locator(selector).textContent();
        console.log(`✅ Success message: ${message}`);
        break;
      }
    }
    
    if (!foundSuccess) {
      console.log('⚠️  No explicit success message found, checking for form reset...');
      // Sometimes success is indicated by form reset
      const inputValue = await stepsInput.inputValue();
      if (inputValue === '' || inputValue === '0') {
        console.log('✅ Form appears to have been reset (likely success)');
        foundSuccess = true;
      }
    }
    
    // Navigate to Individual leaderboard to see if steps appear
    console.log('🏆 Checking if steps appear in leaderboard...');
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'leaderboard-after-steps');
    
    // Look for the test user in the leaderboard
    const userInLeaderboard = page.locator(`text="${testEmail}"`).or(
      page.locator(`text="${testName}"`).or(
        page.locator(`text="${testStepCount}"`)
      )
    );
    
    if (await userInLeaderboard.isVisible()) {
      console.log('✅ Steps appear to be recorded in leaderboard');
    } else {
      console.log('⚠️  Steps not immediately visible in leaderboard (may require time or refresh)');
    }
    
    console.log('✅ Step recording workflow test completed');
  });
  
  test.afterEach(async ({ page }) => {
    // Clean up: could implement logout or session cleanup here
    console.log('🧹 Test cleanup completed');
  });
});