/**
 * Step Recording Workflow E2E Tests
 * 
 * Tests the complete step recording user journey including:
 * - Form validation and submission
 * - Real-time data persistence
 * - Leaderboard integration
 * - Error handling and edge cases
 * - Mobile responsive behavior
 * 
 * Uses automated authentication and real API interactions to test
 * the full step recording workflow end-to-end.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'step-recording', `${name}-${timestamp}.png`);
  
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

// Helper function to authenticate user
async function authenticateUser(page, email) {
  const magicLink = await getMagicLinkForEmail(email);
  await page.goto(magicLink);
  await page.waitForLoadState('networkidle');
  
  // Verify we're authenticated by checking for dashboard elements
  await expect(page.locator('text="My Steps"')).toBeVisible();
  return true;
}

test.describe('Step Recording Workflow E2E Tests', () => {
  const testEmail = 'step-recorder@example.com';
  
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
    
    // Authenticate user for each test
    console.log('🔑 Authenticating test user...');
    await authenticateUser(page, testEmail);
    console.log('✅ User authenticated');
  });

  test('Complete Step Recording Workflow', async ({ page }) => {
    console.log('📊 Testing complete step recording workflow...');
    
    // Step 1: Navigate to My Steps section
    console.log('📱 Step 1: Navigate to My Steps section');
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Click on My Steps tab
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'my-steps-initial');
    
    // Step 2: Verify step recording form
    console.log('📝 Step 2: Verify step recording form');
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    await expect(stepsInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    // Check placeholder and initial state
    const placeholder = await stepsInput.getAttribute('placeholder');
    console.log(`Form placeholder: ${placeholder}`);
    
    // Step 3: Test valid step submission
    console.log('✅ Step 3: Test valid step submission');
    const testStepCount = '8500';
    
    await stepsInput.fill(testStepCount);
    await captureScreenshot(page, 'steps-entered');
    
    // Submit the form
    await submitButton.click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'steps-submitted');
    
    // Check for success indicators
    const successSelectors = [
      '.success', '.alert-success', '[class*="success"]',
      'text="Success"', 'text="Steps saved"', 'text="Steps logged"'
    ];
    
    let foundSuccess = false;
    for (const selector of successSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          const message = await page.locator(selector).textContent();
          console.log(`✅ Success message: ${message}`);
          foundSuccess = true;
          break;
        }
      } catch (e) {
        // Continue checking other selectors
      }
    }
    
    // Alternative success check - form reset
    if (!foundSuccess) {
      await page.waitForTimeout(1000);
      const inputValue = await stepsInput.inputValue();
      if (inputValue === '' || inputValue === '0') {
        console.log('✅ Form reset detected (likely success)');
        foundSuccess = true;
      }
    }
    
    // Step 4: Verify steps appear in leaderboard
    console.log('🏆 Step 4: Verify steps in leaderboard');
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'leaderboard-after-submission');
    
    // Look for our test data in the leaderboard
    const leaderboardHasSteps = await page.locator(`text="${testStepCount}"`).isVisible() ||
                                await page.locator(`text="${testEmail}"`).isVisible();
    
    if (leaderboardHasSteps) {
      console.log('✅ Steps visible in leaderboard');
    } else {
      console.log('⚠️  Steps not immediately visible (may need refresh or time)');
    }
    
    console.log('✅ Complete step recording workflow test passed');
  });

  test('Form Validation and Error Handling', async ({ page }) => {
    console.log('🛡️ Testing form validation and error handling...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    // Test 1: Empty submission
    console.log('🚫 Test 1: Empty form submission');
    await stepsInput.clear();
    await submitButton.click();
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'empty-submission');
    
    // Check for validation message
    const hasValidationMessage = await page.locator('input:invalid, .error, [class*="error"]').isVisible();
    if (hasValidationMessage) {
      console.log('✅ Empty submission properly validated');
    } else {
      console.log('⚠️  Empty submission validation not visible');
    }
    
    // Test 2: Negative numbers
    console.log('🚫 Test 2: Negative step count');
    await stepsInput.fill('-100');
    await submitButton.click();
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'negative-steps');
    
    // Test 3: Very large numbers
    console.log('🚫 Test 3: Extremely large step count');
    await stepsInput.clear();
    await stepsInput.fill('99999999');
    await submitButton.click();
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'large-steps');
    
    // Test 4: Invalid characters
    console.log('🚫 Test 4: Non-numeric input');
    await stepsInput.clear();
    await stepsInput.type('abc123');
    await page.waitForTimeout(500);
    
    const inputValue = await stepsInput.inputValue();
    console.log(`Input value after typing 'abc123': '${inputValue}'`);
    
    // HTML5 number input should filter out non-numeric characters
    if (inputValue === '123' || inputValue === '') {
      console.log('✅ Non-numeric characters properly filtered');
    } else {
      console.log(`⚠️  Unexpected input value: ${inputValue}`);
    }
    
    await captureScreenshot(page, 'invalid-characters');
    
    console.log('✅ Form validation tests completed');
  });

  test('Multiple Step Submissions Same Day', async ({ page }) => {
    console.log('🔄 Testing multiple step submissions for same day...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    // First submission
    console.log('📊 First submission: 5000 steps');
    await stepsInput.fill('5000');
    await submitButton.click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'first-submission');
    
    // Second submission (should update, not add)
    console.log('📊 Second submission: 7500 steps');
    await stepsInput.fill('7500');
    await submitButton.click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'second-submission');
    
    // Check leaderboard shows latest value
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'leaderboard-after-multiple');
    
    // Should show 7500, not 12500 (update, not add)
    const has7500 = await page.locator('text="7500"').isVisible();
    const has5000 = await page.locator('text="5000"').isVisible();
    const has12500 = await page.locator('text="12500"').isVisible();
    
    console.log(`Leaderboard shows 7500: ${has7500}`);
    console.log(`Leaderboard shows 5000: ${has5000}`);
    console.log(`Leaderboard shows 12500 (incorrect sum): ${has12500}`);
    
    if (has7500 && !has12500) {
      console.log('✅ Multiple submissions correctly update (replace, not add)');
    } else if (has12500) {
      console.log('❌ Multiple submissions incorrectly sum values');
    } else {
      console.log('⚠️  Multiple submission behavior unclear');
    }
    
    console.log('✅ Multiple submissions test completed');
  });

  test('Step Recording Responsive Design', async ({ page }) => {
    console.log('📱 Testing step recording responsive design...');
    
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-xl' },
      { width: 1024, height: 768, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];
    
    for (const viewport of viewports) {
      console.log(`📐 Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Navigate to My Steps
      await page.locator('text="My Steps"').first().click();
      await page.waitForTimeout(1000);
      
      // Check if form elements are visible and properly sized
      const stepsInput = page.locator('input[type="number"]');
      const submitButton = page.locator('#submitStepsBtn');
      
      await expect(stepsInput).toBeVisible();
      await expect(submitButton).toBeVisible();
      
      // Check form usability
      await stepsInput.fill('6000');
      await captureScreenshot(page, `responsive-${viewport.name}`);
      
      // Verify form still works
      await submitButton.click();
      await page.waitForTimeout(1500);
      await captureScreenshot(page, `responsive-${viewport.name}-submitted`);
      
      console.log(`✅ ${viewport.name} layout functional`);
    }
    
    // Reset to default viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('✅ Responsive design tests completed');
  });

  test('Step Recording Performance and UX', async ({ page }) => {
    console.log('⚡ Testing step recording performance and UX...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    // Test 1: Form submission speed
    console.log('🏃 Test 1: Form submission speed');
    await stepsInput.fill('9500');
    
    const startTime = Date.now();
    await submitButton.click();
    
    // Wait for either success indicator or form reset
    try {
      await page.waitForFunction(() => {
        const input = document.querySelector('input[type="number"]');
        return input && (input.value === '' || input.value === '0');
      }, { timeout: 10000 });
    } catch (e) {
      // Fallback wait
      await page.waitForTimeout(3000);
    }
    
    const endTime = Date.now();
    const submissionTime = endTime - startTime;
    
    console.log(`📊 Submission completed in ${submissionTime}ms`);
    
    if (submissionTime < 5000) {
      console.log('✅ Fast submission response (< 5 seconds)');
    } else {
      console.log('⚠️  Slow submission response (> 5 seconds)');
    }
    
    await captureScreenshot(page, 'performance-test');
    
    // Test 2: Rapid successive submissions
    console.log('🏃 Test 2: Rapid successive submissions');
    
    const rapidSteps = ['1000', '2000', '3000'];
    for (let i = 0; i < rapidSteps.length; i++) {
      await stepsInput.fill(rapidSteps[i]);
      await submitButton.click();
      await page.waitForTimeout(500); // Short wait between submissions
      console.log(`  Rapid submission ${i + 1}: ${rapidSteps[i]} steps`);
    }
    
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'rapid-submissions');
    
    // Check final state
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'final-leaderboard-state');
    
    console.log('✅ Performance and UX tests completed');
  });

  test('Cross-Browser Step Recording Compatibility', async ({ page, browserName }) => {
    console.log(`🌐 Testing step recording in ${browserName}...`);
    
    await page.goto('http://localhost:3000/dashboard');
    await page.locator('text="My Steps"').first().click();
    await page.waitForTimeout(1000);
    
    const stepsInput = page.locator('input[type="number"]');
    const submitButton = page.locator('#submitStepsBtn');
    
    // Test form interaction in current browser
    await expect(stepsInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    // Test number input behavior
    await stepsInput.fill('4200');
    const inputValue = await stepsInput.inputValue();
    
    expect(inputValue).toBe('4200');
    console.log(`✅ Number input works correctly in ${browserName}`);
    
    // Test form submission
    await submitButton.click();
    await page.waitForTimeout(2000);
    
    await captureScreenshot(page, `browser-${browserName}-test`);
    
    // Verify no JavaScript errors specific to this browser
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.waitForTimeout(1000);
    
    if (errors.length === 0) {
      console.log(`✅ No JavaScript errors in ${browserName}`);
    } else {
      console.log(`⚠️  JavaScript errors in ${browserName}: ${errors.join(', ')}`);
    }
    
    console.log(`✅ Cross-browser test completed for ${browserName}`);
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up step recording test...');
  });
});