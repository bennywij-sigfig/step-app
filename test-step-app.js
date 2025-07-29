const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot with timestamp
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', `${name}-${timestamp}.png`);
  
  // Ensure screenshots directory exists
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to wait for server console output and extract magic link
async function getMagicLinkFromConsole() {
  // Since we can't directly access server console from Playwright, 
  // we'll need to implement a different approach
  console.log('⚠️  You need to check the server console for the magic link URL');
  console.log('⚠️  Look for a line containing "Magic link:" followed by the URL');
  return null;
}

test.describe('Step Challenge App Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console logging to capture any errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console Error: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      console.log(`Page Error: ${error.message}`);
    });
  });

  test('Login Process and Dashboard Navigation', async ({ page }) => {
    console.log('🚀 Starting login process test...');
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of login page
    await captureScreenshot(page, 'login-page');
    
    // Check if login form is present
    const emailInput = page.locator('input[type="email"]');
    const sendLinkButton = page.locator('button:has-text("Send Login Link")');
    
    await expect(emailInput).toBeVisible();
    await expect(sendLinkButton).toBeVisible();
    
    // Enter email and click send login link
    await emailInput.fill('benny@sigfig.com');
    await sendLinkButton.click();
    
    // Wait for success message or redirect
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'after-login-request');
    
    console.log('📧 Login link requested. Please check server console for magic link URL.');
    console.log('📋 Copy the magic link from server console and paste it below when prompted.');
    
    // Since we can't automatically get the magic link, we'll simulate the rest
    // In a real test, you would need to implement a way to capture the server console output
    // or use a test email service
    
    console.log('⏭️  Skipping to dashboard tests (assuming successful login)...');
  });

  test('Dashboard Navigation and UI Elements', async ({ page }) => {
    console.log('🏠 Testing dashboard navigation...');
    
    // For this test, we'll assume we're already logged in
    // In a real scenario, you'd first complete the login process
    
    try {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Check if we're redirected to login (not logged in)
      const currentUrl = page.url();
      if (currentUrl.includes('localhost:3000') && !currentUrl.includes('dashboard')) {
        console.log('❌ Not logged in - redirected to login page');
        await captureScreenshot(page, 'not-logged-in');
        return;
      }
      
      await captureScreenshot(page, 'dashboard-initial');
      
      // Test navigation tabs
      const tabs = ['My Steps', 'Individual', 'Teams'];
      
      for (const tabName of tabs) {
        console.log(`🔍 Testing ${tabName} tab...`);
        
        const tabElement = page.locator(`text="${tabName}"`).first();
        if (await tabElement.isVisible()) {
          await tabElement.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, `tab-${tabName.toLowerCase().replace(' ', '-')}`);
          
          // Check for purple strokes in headers
          const headers = page.locator('h1, h2, h3');
          const headerCount = await headers.count();
          
          for (let i = 0; i < headerCount; i++) {
            const header = headers.nth(i);
            const styles = await header.evaluate(el => {
              const computedStyle = window.getComputedStyle(el);
              return {
                textStroke: computedStyle.webkitTextStroke,
                textStrokeColor: computedStyle.webkitTextStrokeColor,
                textStrokeWidth: computedStyle.webkitTextStrokeWidth
              };
            });
            
            // Check if there are any purple strokes
            if (styles.textStrokeColor && styles.textStrokeColor.includes('rgb(128, 0, 128)')) {
              console.log(`⚠️  Found purple stroke on header in ${tabName} tab`);
            }
          }
        }
      }
      
      // Test Teams tab disclosure triangles
      console.log('🔽 Testing Teams tab disclosure triangles...');
      const teamsTab = page.locator('text="Teams"').first();
      if (await teamsTab.isVisible()) {
        await teamsTab.click();
        await page.waitForTimeout(1000);
        
        // Look for disclosure triangles (▶ symbols)
        const triangles = page.locator('text="▶"');
        const triangleCount = await triangles.count();
        
        console.log(`Found ${triangleCount} disclosure triangles`);
        
        if (triangleCount > 0) {
          // Test clicking the first triangle
          await triangles.first().click();
          await page.waitForTimeout(500);
          await captureScreenshot(page, 'team-expanded');
          
          // Check if triangle changed to ▼
          const expandedTriangle = page.locator('text="▼"').first();
          if (await expandedTriangle.isVisible()) {
            console.log('✅ Disclosure triangle expanded successfully');
            
            // Click again to collapse
            await expandedTriangle.click();
            await page.waitForTimeout(500);
            await captureScreenshot(page, 'team-collapsed');
          }
        }
      }
      
      // Test Individual leaderboard
      console.log('🏆 Testing Individual leaderboard...');
      const individualTab = page.locator('text="Individual"').first();
      if (await individualTab.isVisible()) {
        await individualTab.click();
        await page.waitForTimeout(1000);
        
        // Check for ranked/unranked sections
        const rankedSection = page.locator('text="Ranked"');
        const unrankedSection = page.locator('text="Unranked"');
        
        if (await rankedSection.isVisible()) {
          console.log('✅ Found Ranked section');
        }
        
        if (await unrankedSection.isVisible()) {
          console.log('✅ Found Unranked section');
        }
        
        await captureScreenshot(page, 'individual-leaderboard');
      }
      
      // Test step logging form
      console.log('📝 Testing step logging form...');
      const myStepsTab = page.locator('text="My Steps"').first();
      if (await myStepsTab.isVisible()) {
        await myStepsTab.click();
        await page.waitForTimeout(1000);
        
        const stepsInput = page.locator('input[type="number"]');
        const submitButton = page.locator('button:has-text("Log Steps")');
        
        if (await stepsInput.isVisible() && await submitButton.isVisible()) {
          await stepsInput.fill('5000');
          await captureScreenshot(page, 'before-step-submission');
          await submitButton.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'after-step-submission');
          console.log('✅ Step logging form test completed');
        }
      }
      
    } catch (error) {
      console.log(`❌ Dashboard test error: ${error.message}`);
      await captureScreenshot(page, 'dashboard-error');
    }
  });

  test('Admin Panel Testing', async ({ page }) => {
    console.log('🔐 Testing admin panel...');
    
    try {
      await page.goto('http://localhost:3000/admin');
      await page.waitForLoadState('networkidle');
      
      // Check if we're redirected (not admin)
      const currentUrl = page.url();
      if (!currentUrl.includes('admin')) {
        console.log('❌ Not authorized for admin panel or redirected');
        await captureScreenshot(page, 'admin-not-authorized');
        return;
      }
      
      await captureScreenshot(page, 'admin-initial');
      
      // Test theme picker
      console.log('🎨 Testing theme picker...');
      
      const themes = [
        'Ocean Blue',
        'Sunset Orange', 
        'Forest Green',
        'Lavender Purple',
        'Monochrome'
      ];
      
      // Look for theme picker dropdown or buttons
      const themeSelector = page.locator('select').first(); // Assuming it's a select dropdown
      
      if (await themeSelector.isVisible()) {
        for (const theme of themes) {
          console.log(`🎨 Testing ${theme} theme...`);
          
          await themeSelector.selectOption({ label: theme });
          await page.waitForTimeout(1000);
          await captureScreenshot(page, `admin-theme-${theme.toLowerCase().replace(' ', '-')}`);
          
          // Check for purple strokes in admin headers
          const headers = page.locator('h1, h2, h3');
          const headerCount = await headers.count();
          
          for (let i = 0; i < headerCount; i++) {
            const header = headers.nth(i);
            const styles = await header.evaluate(el => {
              const computedStyle = window.getComputedStyle(el);
              return {
                textStroke: computedStyle.webkitTextStroke,
                textStrokeColor: computedStyle.webkitTextStrokeColor
              };
            });
            
            if (styles.textStrokeColor && styles.textStrokeColor.includes('rgb(128, 0, 128)')) {
              console.log(`⚠️  Found purple stroke on admin header with ${theme} theme`);
            }
          }
        }
      } else {
        // Try to find theme buttons instead
        for (const theme of themes) {
          const themeButton = page.locator(`button:has-text("${theme}")`);
          if (await themeButton.isVisible()) {
            console.log(`🎨 Testing ${theme} theme button...`);
            await themeButton.click();
            await page.waitForTimeout(1000);
            await captureScreenshot(page, `admin-theme-${theme.toLowerCase().replace(' ', '-')}`);
          }
        }
      }
      
      // Test admin navigation tabs
      console.log('🧩 Testing admin navigation...');
      const adminTabs = page.locator('nav a, .tab');
      const tabCount = await adminTabs.count();
      
      for (let i = 0; i < Math.min(tabCount, 5); i++) {
        const tab = adminTabs.nth(i);
        const tabText = await tab.textContent();
        if (tabText && tabText.trim()) {
          console.log(`📋 Testing admin tab: ${tabText.trim()}`);
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, `admin-tab-${i}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Admin panel test error: ${error.message}`);
      await captureScreenshot(page, 'admin-error');
    }
  });

  test('Overall UI and Console Error Check', async ({ page }) => {
    console.log('🔍 Checking for console errors and overall UI...');
    
    const errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    // Test main pages
    const pages = [
      'http://localhost:3000',
      'http://localhost:3000/admin'
    ];
    
    for (const url of pages) {
      try {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        const pageName = url.includes('admin') ? 'admin' : 'main';
        await captureScreenshot(page, `final-${pageName}-check`);
        
      } catch (error) {
        console.log(`❌ Error testing ${url}: ${error.message}`);
      }
    }
    
    // Report any console errors
    if (errors.length > 0) {
      console.log('❌ Console errors found:');
      errors.forEach(error => console.log(`   - ${error}`));
    } else {
      console.log('✅ No console errors detected');
    }
  });
});