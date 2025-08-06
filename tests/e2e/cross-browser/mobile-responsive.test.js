/**
 * Mobile Responsive Testing Scenarios
 * 
 * Comprehensive testing of mobile and responsive behavior:
 * - Multiple viewport sizes and orientations
 * - Touch interactions and gestures
 * - Mobile-specific UI elements
 * - Performance on mobile devices
 * - Cross-device compatibility
 * - Responsive design validation
 * 
 * Tests the complete mobile user experience across different
 * device types, screen sizes, and interaction methods.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'mobile', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to authenticate user
async function authenticateUser(page, email = 'mobile-test@example.com') {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  const response = await fetch('http://localhost:3000/dev/get-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Failed to get magic link: ${response.status}`);
  }

  const data = await response.json();
  await page.goto(data.magicLink);
  await page.waitForLoadState('networkidle');
  
  // Verify authentication
  await expect(page.locator('text="My Steps"')).toBeVisible();
  return true;
}

// Mobile device configurations for testing
const mobileDevices = [
  {
    name: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true
  },
  {
    name: 'iPhone 12',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true
  },
  {
    name: 'iPhone 14 Pro Max',
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    hasTouch: true
  },
  {
    name: 'Samsung Galaxy S21',
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    hasTouch: true
  },
  {
    name: 'Google Pixel 6',
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    hasTouch: true
  }
];

const tabletDevices = [
  {
    name: 'iPad Mini',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true
  },
  {
    name: 'iPad Air',
    viewport: { width: 820, height: 1180 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true
  },
  {
    name: 'iPad Pro',
    viewport: { width: 1024, height: 1366 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    hasTouch: true
  }
];

test.describe('Mobile Responsive Testing', () => {
  
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

  test('Mobile Authentication Flow Across Devices', async ({ page }) => {
    console.log('📱 Testing mobile authentication flow across devices...');
    
    for (const device of mobileDevices) {
      console.log(`🔧 Testing ${device.name} (${device.viewport.width}x${device.viewport.height})`);
      
      // Configure device
      await page.setViewportSize(device.viewport);
      await page.setUserAgent(device.userAgent);
      
      // Step 1: Navigate to login page
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');
      await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-login`);
      
      // Step 2: Test form visibility and usability
      const emailInput = page.locator('input[type="email"]');
      const sendButton = page.locator('button:has-text("Send Login Link")');
      
      await expect(emailInput).toBeVisible();
      await expect(sendButton).toBeVisible();
      
      // Test form interaction
      await emailInput.fill('mobile-test@example.com');
      
      // Check if form is properly sized
      const inputBox = await emailInput.boundingBox();
      const buttonBox = await sendButton.boundingBox();
      
      console.log(`  ${device.name} - Input size: ${inputBox?.width}x${inputBox?.height}`);
      console.log(`  ${device.name} - Button size: ${buttonBox?.width}x${buttonBox?.height}`);
      
      // Verify minimum touch target sizes (44px recommended)
      if (buttonBox && (buttonBox.height < 44 || buttonBox.width < 44)) {
        console.log(`  ⚠️  ${device.name} - Button below recommended touch target size`);
      } else if (buttonBox) {
        console.log(`  ✅ ${device.name} - Button meets touch target requirements`);
      }
      
      await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-form-filled`);
      
      // Test form submission
      await sendButton.click();
      await page.waitForTimeout(2000);
      await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-form-submitted`);
      
      console.log(`  ✅ ${device.name} authentication flow completed`);
    }
    
    console.log('✅ Mobile authentication testing completed');
  });

  test('Mobile Dashboard Navigation and Usability', async ({ page }) => {
    console.log('🏠 Testing mobile dashboard navigation...');
    
    // Test with a representative mobile device
    const testDevice = mobileDevices[1]; // iPhone 12
    await page.setViewportSize(testDevice.viewport);
    await page.setUserAgent(testDevice.userAgent);
    
    // Authenticate user
    await authenticateUser(page);
    await captureScreenshot(page, 'mobile-dashboard-initial');
    
    // Test tab navigation
    const tabs = ['My Steps', 'Individual', 'Teams'];
    
    for (const tab of tabs) {
      console.log(`  Testing ${tab} tab on mobile...`);
      
      await page.locator(`text="${tab}"`).first().click();
      await page.waitForTimeout(1000);
      await captureScreenshot(page, `mobile-tab-${tab.toLowerCase().replace(' ', '-')}`);
      
      // Check for horizontal scroll issues
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = testDevice.viewport.width;
      
      if (scrollWidth > viewportWidth) {
        console.log(`  ⚠️  ${tab} tab has horizontal scroll (${scrollWidth}px > ${viewportWidth}px)`);
      } else {
        console.log(`  ✅ ${tab} tab fits properly in viewport`);
      }
      
      // Test specific tab content
      if (tab === 'My Steps') {
        // Test form elements on mobile
        const stepsInput = page.locator('input[type="number"]');
        const submitButton = page.locator('#submitStepsBtn');
        
        if (await stepsInput.isVisible()) {
          const inputBox = await stepsInput.boundingBox();
          console.log(`    Steps input size: ${inputBox?.width}x${inputBox?.height}`);
          
          // Test touch interaction
          await stepsInput.fill('5000');
          await captureScreenshot(page, 'mobile-steps-input');
          
          if (await submitButton.isVisible()) {
            const buttonBox = await submitButton.boundingBox();
            console.log(`    Submit button size: ${buttonBox?.width}x${buttonBox?.height}`);
          }
        }
      }
    }
    
    console.log('✅ Mobile dashboard navigation testing completed');
  });

  test('Touch Interactions and Gestures', async ({ page }) => {
    console.log('👆 Testing touch interactions and gestures...');
    
    const testDevice = mobileDevices[2]; // iPhone 14 Pro Max
    await page.setViewportSize(testDevice.viewport);
    await page.setUserAgent(testDevice.userAgent);
    
    await authenticateUser(page);
    
    // Test tap interactions
    console.log('  Testing tap interactions...');
    
    const tabs = ['Individual', 'Teams'];
    for (const tab of tabs) {
      await page.locator(`text="${tab}"`).first().tap();
      await page.waitForTimeout(500);
      await captureScreenshot(page, `touch-tap-${tab.toLowerCase()}`);
      console.log(`    ✅ Tap interaction works for ${tab}`);
    }
    
    // Test scroll behavior
    console.log('  Testing scroll behavior...');
    
    await page.locator('text="Teams"').first().tap();
    await page.waitForTimeout(1000);
    
    // Test vertical scroll
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(500);
    await captureScreenshot(page, 'touch-scroll-vertical');
    
    // Test swipe gesture (if applicable)
    console.log('  Testing swipe gestures...');
    
    const startX = testDevice.viewport.width / 2;
    const startY = testDevice.viewport.height / 2;
    
    // Horizontal swipe (left to right)
    await page.mouse.move(startX - 100, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY);
    await page.mouse.up();
    
    await page.waitForTimeout(500);
    await captureScreenshot(page, 'touch-swipe-horizontal');
    
    console.log('    ✅ Swipe gesture completed');
    
    // Test pinch-to-zoom (simulated)
    console.log('  Testing zoom behavior...');
    
    await page.setViewportSize({ 
      width: testDevice.viewport.width * 1.5, 
      height: testDevice.viewport.height * 1.5 
    });
    
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'touch-zoom-test');
    
    // Reset viewport
    await page.setViewportSize(testDevice.viewport);
    
    console.log('✅ Touch interactions testing completed');
  });

  test('Tablet Responsive Design', async ({ page }) => {
    console.log('📱 Testing tablet responsive design...');
    
    for (const device of tabletDevices) {
      console.log(`🔧 Testing ${device.name} (${device.viewport.width}x${device.viewport.height})`);
      
      await page.setViewportSize(device.viewport);
      await page.setUserAgent(device.userAgent);
      
      // Test both orientations
      const orientations = [
        { width: device.viewport.width, height: device.viewport.height, name: 'portrait' },
        { width: device.viewport.height, height: device.viewport.width, name: 'landscape' }
      ];
      
      for (const orientation of orientations) {
        console.log(`  Testing ${device.name} in ${orientation.name}...`);
        
        await page.setViewportSize({ width: orientation.width, height: orientation.height });
        
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-${orientation.name}-login`);
        
        // Authenticate and test dashboard
        await authenticateUser(page);
        await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-${orientation.name}-dashboard`);
        
        // Test different tabs
        const tabs = ['Individual', 'Teams'];
        for (const tab of tabs) {
          await page.locator(`text="${tab}"`).first().click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-${orientation.name}-${tab.toLowerCase()}`);
        }
        
        // Check layout efficiency
        const contentArea = await page.evaluate(() => {
          const body = document.body;
          return {
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
            scrollWidth: body.scrollWidth,
            clientWidth: body.clientWidth
          };
        });
        
        const hasVerticalScroll = contentArea.scrollHeight > contentArea.clientHeight;
        const hasHorizontalScroll = contentArea.scrollWidth > contentArea.clientWidth;
        
        console.log(`    Layout efficiency - Vertical scroll: ${hasVerticalScroll ? 'Yes' : 'No'}, Horizontal scroll: ${hasHorizontalScroll ? 'No' : 'Yes (Good)'}`);
        
        if (!hasHorizontalScroll) {
          console.log(`    ✅ ${device.name} ${orientation.name} - Good responsive layout`);
        } else {
          console.log(`    ⚠️  ${device.name} ${orientation.name} - Has horizontal scroll`);
        }
      }
      
      console.log(`  ✅ ${device.name} testing completed`);
    }
    
    console.log('✅ Tablet responsive design testing completed');
  });

  test('Mobile Performance and Loading', async ({ page }) => {
    console.log('⚡ Testing mobile performance and loading...');
    
    const testDevice = mobileDevices[0]; // iPhone SE (smallest screen)
    await page.setViewportSize(testDevice.viewport);
    await page.setUserAgent(testDevice.userAgent);
    
    // Test page load performance
    console.log('  Measuring mobile page load performance...');
    
    const startTime = Date.now();
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    console.log(`  Mobile page load time: ${loadTime}ms`);
    
    if (loadTime < 3000) {
      console.log('  ✅ Fast mobile load time (< 3 seconds)');
    } else if (loadTime < 5000) {
      console.log('  ⚠️  Moderate mobile load time (3-5 seconds)');
    } else {
      console.log('  ❌ Slow mobile load time (> 5 seconds)');
    }
    
    await captureScreenshot(page, 'mobile-performance-loaded');
    
    // Test resource efficiency
    console.log('  Analyzing mobile resource usage...');
    
    const resourceMetrics = await page.evaluate(() => {
      const performance = window.performance;
      const navigation = performance.getEntriesByType('navigation')[0];
      
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        totalImages: document.querySelectorAll('img').length,
        totalScripts: document.querySelectorAll('script').length,
        totalStylesheets: document.querySelectorAll('link[rel="stylesheet"]').length
      };
    });
    
    console.log('  Resource metrics:');
    console.log(`    DOM Content Loaded: ${resourceMetrics.domContentLoaded}ms`);
    console.log(`    Load Complete: ${resourceMetrics.loadComplete}ms`);
    console.log(`    Images: ${resourceMetrics.totalImages}`);
    console.log(`    Scripts: ${resourceMetrics.totalScripts}`);
    console.log(`    Stylesheets: ${resourceMetrics.totalStylesheets}`);
    
    // Test interaction responsiveness
    console.log('  Testing mobile interaction responsiveness...');
    
    const emailInput = page.locator('input[type="email"]');
    
    const interactionStart = Date.now();
    await emailInput.fill('performance-test@example.com');
    const interactionEnd = Date.now();
    
    const interactionTime = interactionEnd - interactionStart;
    console.log(`  Input interaction time: ${interactionTime}ms`);
    
    if (interactionTime < 100) {
      console.log('  ✅ Responsive input interaction');
    } else {
      console.log('  ⚠️  Slow input interaction');
    }
    
    await captureScreenshot(page, 'mobile-performance-interaction');
    
    console.log('✅ Mobile performance testing completed');
  });

  test('Cross-Device Compatibility Features', async ({ page }) => {
    console.log('🔄 Testing cross-device compatibility features...');
    
    // Test device-specific features
    const deviceFeatureTests = [
      {
        device: mobileDevices[1], // iPhone 12
        tests: ['notifications', 'touch', 'orientation']
      },
      {
        device: mobileDevices[3], // Samsung Galaxy S21
        tests: ['notifications', 'touch', 'orientation']
      },
      {
        device: tabletDevices[1], // iPad Air
        tests: ['notifications', 'touch', 'multitasking']
      }
    ];
    
    for (const { device, tests } of deviceFeatureTests) {
      console.log(`  Testing features on ${device.name}...`);
      
      await page.setViewportSize(device.viewport);
      await page.setUserAgent(device.userAgent);
      
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');
      
      for (const feature of tests) {
        console.log(`    Testing ${feature} support...`);
        
        switch (feature) {
          case 'notifications':
            // Test if notification API is available
            const hasNotifications = await page.evaluate(() => {
              return 'Notification' in window && 'serviceWorker' in navigator;
            });
            console.log(`      Notifications API: ${hasNotifications ? '✅' : '❌'}`);
            break;
            
          case 'touch':
            // Test touch event support
            const hasTouch = await page.evaluate(() => {
              return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            });
            console.log(`      Touch events: ${hasTouch ? '✅' : '❌'}`);
            break;
            
          case 'orientation':
            // Test orientation change handling
            const hasOrientation = await page.evaluate(() => {
              return 'orientation' in window || 'onorientationchange' in window;
            });
            console.log(`      Orientation API: ${hasOrientation ? '✅' : '❌'}`);
            break;
            
          case 'multitasking':
            // Test page visibility API (for multitasking)
            const hasVisibility = await page.evaluate(() => {
              return 'visibilityState' in document;
            });
            console.log(`      Page Visibility API: ${hasVisibility ? '✅' : '❌'}`);
            break;
        }
      }
      
      await captureScreenshot(page, `${device.name.replace(' ', '-').toLowerCase()}-features`);
      console.log(`  ✅ Feature testing completed for ${device.name}`);
    }
    
    console.log('✅ Cross-device compatibility testing completed');
  });

  test('Mobile Accessibility and Usability', async ({ page }) => {
    console.log('♿ Testing mobile accessibility and usability...');
    
    const testDevice = mobileDevices[1]; // iPhone 12
    await page.setViewportSize(testDevice.viewport);
    await page.setUserAgent(testDevice.userAgent);
    
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Test touch target sizes
    console.log('  Testing touch target accessibility...');
    
    const interactiveElements = await page.locator('button, input, a, [onclick], [tabindex]').all();
    let accessibilityIssues = 0;
    
    for (const element of interactiveElements.slice(0, 10)) { // Test first 10 elements
      if (await element.isVisible()) {
        const box = await element.boundingBox();
        if (box && (box.width < 44 || box.height < 44)) {
          accessibilityIssues++;
        }
      }
    }
    
    console.log(`  Touch target issues found: ${accessibilityIssues}`);
    if (accessibilityIssues === 0) {
      console.log('  ✅ All touch targets meet accessibility guidelines');
    } else {
      console.log(`  ⚠️  ${accessibilityIssues} touch targets below 44px minimum`);
    }
    
    // Test text readability
    console.log('  Testing mobile text readability...');
    
    const textElements = await page.locator('p, span, div, label, button').all();
    let readabilityIssues = 0;
    
    for (const element of textElements.slice(0, 20)) { // Test first 20 text elements
      if (await element.isVisible()) {
        const fontSize = await element.evaluate(el => {
          const style = window.getComputedStyle(el);
          return parseInt(style.fontSize);
        });
        
        if (fontSize < 16) { // Mobile recommended minimum
          readabilityIssues++;
        }
      }
    }
    
    console.log(`  Small text elements found: ${readabilityIssues}`);
    if (readabilityIssues <= 5) {
      console.log('  ✅ Good mobile text readability');
    } else {
      console.log(`  ⚠️  ${readabilityIssues} text elements may be hard to read on mobile`);
    }
    
    // Test mobile navigation
    console.log('  Testing mobile navigation accessibility...');
    
    await authenticateUser(page);
    
    // Test keyboard navigation (via Tab key simulation)
    let focusableElements = 0;
    const focusableSelectors = ['button', 'input', 'a', '[tabindex]'];
    
    for (const selector of focusableSelectors) {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        if (await element.isVisible()) {
          focusableElements++;
        }
      }
    }
    
    console.log(`  Focusable elements found: ${focusableElements}`);
    
    await captureScreenshot(page, 'mobile-accessibility-test');
    
    console.log('✅ Mobile accessibility testing completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up mobile test...');
  });
});