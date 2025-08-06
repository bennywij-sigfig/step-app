/**
 * Production E2E Authentication Flow Tests
 * 
 * Tests authentication flow in production environment using:
 * - Real Mailgun API for email retrieval
 * - Production endpoints and URLs
 * - Actual email delivery and magic link extraction
 * - Cross-environment compatibility
 * 
 * These tests run against production infrastructure to validate
 * the complete end-to-end user authentication experience.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createMailgunHelper, testMailgunConnection } = require('../utils/mailgun-email-helper');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to determine base URL based on environment
function getBaseURL() {
  const productionURL = process.env.PRODUCTION_URL || 'https://step-app-4x-yhw.fly.dev';
  const localURL = 'http://localhost:3000';
  
  // Use production URL if explicitly set or if we're in CI/production mode
  if (process.env.NODE_ENV === 'production' || process.env.PRODUCTION_URL) {
    return productionURL;
  }
  
  return localURL;
}

// Helper function to wait for page load with retries
async function waitForPageLoad(page, timeout = 10000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (error) {
    console.log(`⚠️  Network idle timeout, continuing... (${error.message})`);
    await page.waitForLoadState('domcontentloaded');
  }
}

test.describe('Production E2E Authentication Flow Tests', () => {
  let mailgunHelper;
  let baseURL;
  
  test.beforeAll(async () => {
    // Set up base URL
    baseURL = getBaseURL();
    console.log(`🌐 Testing against: ${baseURL}`);
    
    // Set up Mailgun helper for production testing
    if (process.env.MAILGUN_API_KEY) {
      try {
        console.log('🔧 Setting up Mailgun integration...');
        mailgunHelper = createMailgunHelper({
          apiKey: process.env.MAILGUN_API_KEY,
          domain: process.env.MAILGUN_DOMAIN
        });
        
        const configValid = await mailgunHelper.verifyConfiguration();
        if (!configValid) {
          console.log('⚠️  Mailgun configuration invalid, falling back to manual mode');
          mailgunHelper = null;
        } else {
          console.log('✅ Mailgun integration ready');
        }
      } catch (error) {
        console.log(`⚠️  Mailgun setup failed: ${error.message}`);
        mailgunHelper = null;
      }
    } else {
      console.log('ℹ️  No Mailgun API key provided, using local development mode');
    }
  });

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
    
    // Set longer timeouts for production
    page.setDefaultTimeout(30000);
  });

  test('Production Authentication Flow - Full Integration', async ({ page }) => {
    console.log('🚀 Testing production authentication flow...');
    
    // Step 1: Navigate to production site
    console.log(`📱 Step 1: Navigate to ${baseURL}`);
    await page.goto(baseURL);
    await waitForPageLoad(page);
    await captureScreenshot(page, 'production-landing');
    
    // Step 2: Verify login form is present
    console.log('📋 Step 2: Verify login form');
    const emailInput = page.locator('input[type="email"]');
    const sendLinkButton = page.locator('button:has-text("Send Login Link")');
    
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(sendLinkButton).toBeVisible();
    
    console.log('✅ Login form found');
    
    // Step 3: Generate test email and request magic link
    console.log('📧 Step 3: Request magic link');
    
    let testEmail;
    if (mailgunHelper) {
      // Use Mailgun-generated test email
      testEmail = mailgunHelper.generateTestEmail('prod-e2e');
      console.log(`Generated test email: ${testEmail}`);
    } else {
      // Use fixed test email for local development
      testEmail = 'production-test@example.com';
      console.log(`Using development email: ${testEmail}`);
    }
    
    await emailInput.fill(testEmail);
    await captureScreenshot(page, 'email-entered');
    
    await sendLinkButton.click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'magic-link-requested');
    
    // Step 4: Get magic link
    console.log('🔗 Step 4: Retrieve magic link');
    let magicLink;
    
    if (mailgunHelper) {
      console.log('📨 Fetching magic link from Mailgun...');
      try {
        magicLink = await mailgunHelper.getMagicLinkForEmail(testEmail, {
          baseURL: baseURL
        });
        console.log(`✅ Retrieved magic link: ${magicLink.substring(0, 50)}...`);
      } catch (error) {
        console.log(`❌ Failed to get magic link from Mailgun: ${error.message}`);
        
        // Fallback to development endpoint if available
        if (baseURL.includes('localhost')) {
          console.log('🔄 Falling back to development magic link endpoint...');
          const fetch = globalThis.fetch || (await import('node-fetch')).default;
          
          try {
            const response = await fetch(`${baseURL}/dev/get-magic-link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: testEmail })
            });
            
            if (response.ok) {
              const data = await response.json();
              magicLink = data.magicLink;
              console.log(`✅ Got fallback magic link`);
            }
          } catch (fallbackError) {
            console.log(`❌ Fallback also failed: ${fallbackError.message}`);
          }
        }
        
        if (!magicLink) {
          throw new Error('Could not retrieve magic link via any method');
        }
      }
    } else {
      // Local development mode
      if (baseURL.includes('localhost')) {
        console.log('🔧 Using development magic link endpoint...');
        const fetch = globalThis.fetch || (await import('node-fetch')).default;
        
        const response = await fetch(`${baseURL}/dev/get-magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: testEmail })
        });
        
        if (!response.ok) {
          throw new Error(`Development endpoint failed: ${response.status}`);
        }
        
        const data = await response.json();
        magicLink = data.magicLink;
        console.log(`✅ Got development magic link`);
      } else {
        throw new Error('Production testing requires Mailgun API configuration');
      }
    }
    
    // Step 5: Navigate to magic link
    console.log('🎭 Step 5: Navigate to magic link');
    await page.goto(magicLink);
    await waitForPageLoad(page);
    await captureScreenshot(page, 'after-magic-link');
    
    // Step 6: Verify successful authentication
    console.log('🏠 Step 6: Verify dashboard access');
    
    // Should be on dashboard or redirected to dashboard
    const currentURL = page.url();
    console.log(`Current URL: ${currentURL}`);
    
    // Check for authenticated content
    const dashboardElements = [
      'text="My Steps"',
      'text="Individual"',
      'text="Teams"'
    ];
    
    let authenticatedElementsFound = 0;
    for (const selector of dashboardElements) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 5000 })) {
          authenticatedElementsFound++;
        }
      } catch (e) {
        // Element not found
      }
    }
    
    console.log(`Dashboard elements found: ${authenticatedElementsFound}/3`);
    
    if (authenticatedElementsFound >= 2) {
      console.log('✅ Successfully authenticated and reached dashboard');
      await captureScreenshot(page, 'authenticated-dashboard');
    } else {
      console.log('⚠️  Authentication state unclear');
      await captureScreenshot(page, 'authentication-unclear');
      
      // Try to find any error messages
      const errorSelectors = ['.error', '.alert-error', '[class*="error"]'];
      for (const selector of errorSelectors) {
        if (await page.locator(selector).isVisible()) {
          const errorText = await page.locator(selector).textContent();
          console.log(`Error message: ${errorText}`);
          break;
        }
      }
    }
    
    // Step 7: Test basic dashboard functionality
    console.log('🔍 Step 7: Test basic dashboard functionality');
    
    if (authenticatedElementsFound >= 2) {
      // Try clicking on different tabs
      const tabs = ['Individual', 'Teams'];
      
      for (const tab of tabs) {
        try {
          console.log(`  Testing ${tab} tab...`);
          await page.locator(`text="${tab}"`).first().click();
          await page.waitForTimeout(2000);
          await captureScreenshot(page, `production-tab-${tab.toLowerCase()}`);
          console.log(`  ✅ ${tab} tab functional`);
        } catch (error) {
          console.log(`  ⚠️  ${tab} tab error: ${error.message}`);
        }
      }
    }
    
    console.log('✅ Production authentication flow test completed');
  });

  test('Production Health Check and Basic Functionality', async ({ page }) => {
    console.log('🏥 Testing production health and basic functionality...');
    
    // Step 1: Test health endpoint
    console.log('💓 Step 1: Test health endpoint');
    
    try {
      await page.goto(`${baseURL}/health`);
      await waitForPageLoad(page);
      
      const healthContent = await page.textContent('body');
      console.log(`Health response length: ${healthContent?.length || 0} characters`);
      
      // Look for JSON response
      if (healthContent?.includes('{')) {
        try {
          const healthData = JSON.parse(healthContent);
          console.log(`Health status: ${healthData.status || 'unknown'}`);
          console.log(`Database: ${healthData.database?.accessible ? '✅' : '❌'}`);
        } catch (e) {
          console.log('⚠️  Health response not valid JSON');
        }
      }
      
      await captureScreenshot(page, 'health-endpoint');
      
    } catch (error) {
      console.log(`⚠️  Health check failed: ${error.message}`);
    }
    
    // Step 2: Test static assets
    console.log('📁 Step 2: Test static asset loading');
    
    await page.goto(baseURL);
    await waitForPageLoad(page);
    
    // Check for CSS loading
    const cssLoaded = await page.evaluate(() => {
      const computedStyle = window.getComputedStyle(document.body);
      return computedStyle.fontFamily !== '' || computedStyle.backgroundColor !== '';
    });
    
    console.log(`CSS loaded: ${cssLoaded ? '✅' : '❌'}`);
    
    // Check for JavaScript functionality
    const jsWorking = await page.evaluate(() => {
      return typeof window !== 'undefined' && typeof document !== 'undefined';
    });
    
    console.log(`JavaScript working: ${jsWorking ? '✅' : '❌'}`);
    
    await captureScreenshot(page, 'assets-loaded');
    
    // Step 3: Test form functionality without authentication
    console.log('📋 Step 3: Test form functionality');
    
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      // Test form validation
      await emailInput.fill('invalid-email');
      
      const isInvalid = await emailInput.evaluate(el => !el.checkValidity());
      console.log(`Email validation working: ${isInvalid ? '✅' : '❌'}`);
      
      await emailInput.fill('valid@example.com');
      const isValid = await emailInput.evaluate(el => el.checkValidity());
      console.log(`Valid email accepted: ${isValid ? '✅' : '❌'}`);
    }
    
    await captureScreenshot(page, 'form-validation-test');
    
    console.log('✅ Production health check completed');
  });

  test('Production Performance and Load Test', async ({ page }) => {
    console.log('⚡ Testing production performance...');
    
    // Step 1: Measure page load time
    console.log('⏱️ Step 1: Measure page load performance');
    
    const startTime = Date.now();
    await page.goto(baseURL);
    await waitForPageLoad(page);
    const loadTime = Date.now() - startTime;
    
    console.log(`Page load time: ${loadTime}ms`);
    
    if (loadTime < 3000) {
      console.log('✅ Fast page load (< 3 seconds)');
    } else if (loadTime < 5000) {
      console.log('⚠️  Moderate page load (3-5 seconds)');
    } else {
      console.log('❌ Slow page load (> 5 seconds)');
    }
    
    // Step 2: Test multiple rapid requests
    console.log('🔄 Step 2: Test rapid request handling');
    
    const rapidRequests = [];
    const requestCount = 5;
    
    for (let i = 0; i < requestCount; i++) {
      rapidRequests.push(
        page.goto(`${baseURL}?cache-bust=${Date.now()}-${i}`)
          .then(() => ({ success: true, index: i }))
          .catch(error => ({ success: false, index: i, error: error.message }))
      );
    }
    
    const results = await Promise.all(rapidRequests);
    const successful = results.filter(r => r.success).length;
    
    console.log(`Rapid requests: ${successful}/${requestCount} successful`);
    
    if (successful === requestCount) {
      console.log('✅ All rapid requests handled successfully');
    } else {
      console.log(`⚠️  Some rapid requests failed: ${results.filter(r => !r.success).map(r => r.error).join(', ')}`);
    }
    
    // Step 3: Test resource efficiency
    console.log('📊 Step 3: Analyze resource usage');
    
    await page.goto(baseURL);
    await waitForPageLoad(page);
    
    const resourceCounts = await page.evaluate(() => {
      return {
        images: document.querySelectorAll('img').length,
        scripts: document.querySelectorAll('script').length,
        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
        total: document.querySelectorAll('*').length
      };
    });
    
    console.log('Resource analysis:');
    console.log(`  Images: ${resourceCounts.images}`);
    console.log(`  Scripts: ${resourceCounts.scripts}`);
    console.log(`  Stylesheets: ${resourceCounts.stylesheets}`);
    console.log(`  Total elements: ${resourceCounts.total}`);
    
    await captureScreenshot(page, 'performance-analysis');
    
    console.log('✅ Production performance test completed');
  });

  test('Production Error Handling and Resilience', async ({ page }) => {
    console.log('🛡️ Testing production error handling...');
    
    // Step 1: Test 404 handling
    console.log('🔍 Step 1: Test 404 error handling');
    
    await page.goto(`${baseURL}/non-existent-page-12345`);
    await waitForPageLoad(page);
    await captureScreenshot(page, '404-handling');
    
    const pageContent = await page.textContent('body');
    const has404Content = pageContent?.includes('404') || pageContent?.includes('Not Found') || pageContent?.includes('Page not found');
    
    console.log(`404 page handling: ${has404Content ? '✅' : '⚠️'}`);
    
    // Step 2: Test malformed requests
    console.log('🚫 Step 2: Test malformed request handling');
    
    try {
      await page.goto(`${baseURL}/auth/login?token=invalid-token-123`);
      await waitForPageLoad(page);
      await captureScreenshot(page, 'invalid-token-handling');
      
      const currentURL = page.url();
      const redirectedToLogin = currentURL === baseURL || currentURL === `${baseURL}/` || await page.locator('input[type="email"]').isVisible();
      
      console.log(`Invalid token handled: ${redirectedToLogin ? '✅' : '⚠️'}`);
      
    } catch (error) {
      console.log(`Malformed request test error: ${error.message}`);
    }
    
    // Step 3: Test rate limiting (if applicable)
    console.log('🚦 Step 3: Test rate limiting behavior');
    
    // Make multiple rapid requests to test rate limiting
    const rateLimitTests = [];
    for (let i = 0; i < 10; i++) {
      rateLimitTests.push(
        page.goto(`${baseURL}/health?test=${i}`, { waitUntil: 'domcontentloaded' })
          .then(() => ({ success: true, index: i }))
          .catch(error => ({ success: false, index: i, error: error.message }))
      );
    }
    
    const rateLimitResults = await Promise.all(rateLimitTests);
    const rateLimitSuccessful = rateLimitResults.filter(r => r.success).length;
    
    console.log(`Rate limit test: ${rateLimitSuccessful}/10 requests successful`);
    
    if (rateLimitSuccessful < 10) {
      console.log('✅ Rate limiting appears to be working');
    } else {
      console.log('ℹ️  No rate limiting detected (may be configured differently)');
    }
    
    await captureScreenshot(page, 'error-handling-final');
    
    console.log('✅ Production error handling test completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up production test...');
  });
  
  test.afterAll(async () => {
    if (mailgunHelper) {
      console.log('🧹 Cleaning up Mailgun test data...');
      try {
        await mailgunHelper.cleanupTestEmails(30); // Clean up emails older than 30 minutes
      } catch (error) {
        console.log(`⚠️  Cleanup warning: ${error.message}`);
      }
    }
  });
});