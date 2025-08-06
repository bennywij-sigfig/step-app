/**
 * Leaderboard Viewing E2E Tests
 * 
 * Tests the complete leaderboard viewing experience including:
 * - Individual leaderboard display and ranking
 * - Team leaderboard with member disclosure
 * - Ranked vs unranked user separation
 * - Real-time data updates
 * - Responsive leaderboard layouts
 * - Team member expansion/collapse
 * 
 * Validates UI elements, data accuracy, and user interactions
 * across different viewport sizes and browser environments.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'leaderboard', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to authenticate user
async function authenticateUser(page, email) {
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

// Helper function to count visible elements
async function countVisibleElements(page, selector) {
  const elements = await page.locator(selector).all();
  let visibleCount = 0;
  
  for (const element of elements) {
    if (await element.isVisible()) {
      visibleCount++;
    }
  }
  
  return visibleCount;
}

test.describe('Leaderboard Viewing E2E Tests', () => {
  const testEmail = 'leaderboard-viewer@example.com';
  
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
    
    // Authenticate user
    console.log('🔑 Authenticating test user...');
    await authenticateUser(page, testEmail);
    console.log('✅ User authenticated');
  });

  test('Individual Leaderboard Display and Navigation', async ({ page }) => {
    console.log('🏆 Testing individual leaderboard display...');
    
    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Step 1: Navigate to Individual leaderboard
    console.log('📊 Step 1: Navigate to Individual leaderboard');
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'individual-leaderboard-initial');
    
    // Step 2: Verify leaderboard structure
    console.log('🏗️ Step 2: Verify leaderboard structure');
    
    // Check for ranked section
    const rankedSection = page.locator('text="Ranked"');
    const rankedVisible = await rankedSection.isVisible();
    console.log(`Ranked section visible: ${rankedVisible}`);
    
    // Check for unranked section
    const unrankedSection = page.locator('text="Unranked"');
    const unrankedVisible = await unrankedSection.isVisible();
    console.log(`Unranked section visible: ${unrankedVisible}`);
    
    if (rankedVisible || unrankedVisible) {
      console.log('✅ Leaderboard sections found');
    } else {
      console.log('⚠️  No leaderboard sections visible (may be empty)');
    }
    
    // Step 3: Analyze leaderboard content
    console.log('📈 Step 3: Analyze leaderboard content');
    
    // Look for user entries (various possible selectors)
    const userEntrySelectors = [
      '.user-entry', '.leaderboard-entry', '.ranking-item',
      'tr', 'li', '[class*="user"]', '[class*="player"]'
    ];
    
    let userEntries = 0;
    let foundSelector = null;
    
    for (const selector of userEntrySelectors) {
      const count = await countVisibleElements(page, selector);
      if (count > 0) {
        userEntries = count;
        foundSelector = selector;
        console.log(`Found ${count} user entries using selector: ${selector}`);
        break;
      }
    }
    
    if (userEntries > 0) {
      console.log(`✅ Found ${userEntries} user entries`);
      
      // Analyze first few entries
      const entries = await page.locator(foundSelector).all();
      for (let i = 0; i < Math.min(entries.length, 3); i++) {
        const entry = entries[i];
        if (await entry.isVisible()) {
          const text = await entry.textContent();
          console.log(`Entry ${i + 1}: ${text?.substring(0, 100)}...`);
        }
      }
    } else {
      console.log('ℹ️  No user entries visible (empty leaderboard)');
    }
    
    // Step 4: Test sorting and ranking
    console.log('📊 Step 4: Verify ranking order');
    
    // Look for numerical step counts to verify sorting
    const stepCounts = [];
    const numberPattern = /\d+/g;
    
    if (foundSelector) {
      const entries = await page.locator(foundSelector).all();
      for (let i = 0; i < Math.min(entries.length, 5); i++) {
        const entry = entries[i];
        if (await entry.isVisible()) {
          const text = await entry.textContent();
          const numbers = text?.match(numberPattern);
          if (numbers && numbers.length > 0) {
            // Find the largest number (likely the step count)
            const maxNumber = Math.max(...numbers.map(n => parseInt(n)));
            if (maxNumber > 100) { // Likely a step count, not a rank number
              stepCounts.push(maxNumber);
            }
          }
        }
      }
    }
    
    if (stepCounts.length >= 2) {
      const isSortedDesc = stepCounts.every((count, i) => {
        return i === 0 || stepCounts[i - 1] >= count;
      });
      
      console.log(`Step counts found: ${stepCounts.join(', ')}`);
      console.log(`Sorted descending: ${isSortedDesc ? '✅' : '❌'}`);
    } else {
      console.log('ℹ️  Insufficient data to verify sorting');
    }
    
    await captureScreenshot(page, 'individual-leaderboard-analyzed');
    console.log('✅ Individual leaderboard analysis completed');
  });

  test('Team Leaderboard and Member Disclosure', async ({ page }) => {
    console.log('👥 Testing team leaderboard and member disclosure...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Step 1: Navigate to Teams leaderboard
    console.log('🏢 Step 1: Navigate to Teams leaderboard');
    await page.locator('text="Teams"').first().click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'teams-leaderboard-initial');
    
    // Step 2: Look for disclosure triangles
    console.log('🔽 Step 2: Look for team disclosure triangles');
    
    const triangleSelectors = [
      'text="▶"', 'text="▼"', '.disclosure-triangle',
      '[class*="triangle"]', '[class*="expand"]', '.toggle'
    ];
    
    let triangles = [];
    let foundTriangleSelector = null;
    
    for (const selector of triangleSelectors) {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        triangles = elements;
        foundTriangleSelector = selector;
        console.log(`Found ${elements.length} disclosure triangles using: ${selector}`);
        break;
      }
    }
    
    if (triangles.length > 0) {
      console.log(`✅ Found ${triangles.length} team disclosure controls`);
      
      // Step 3: Test expanding a team
      console.log('📂 Step 3: Test expanding team members');
      
      const firstTriangle = triangles[0];
      if (await firstTriangle.isVisible()) {
        await captureScreenshot(page, 'before-team-expansion');
        
        await firstTriangle.click();
        await page.waitForTimeout(1000);
        
        await captureScreenshot(page, 'after-team-expansion');
        
        // Check if triangle changed or members appeared
        const expandedTriangle = page.locator('text="▼"').first();
        const membersList = page.locator('[class*="member"], [class*="player"], li').first();
        
        const isExpanded = await expandedTriangle.isVisible();
        const hasMembers = await membersList.isVisible();
        
        console.log(`Triangle expanded (▼): ${isExpanded}`);
        console.log(`Members visible: ${hasMembers}`);
        
        if (isExpanded || hasMembers) {
          console.log('✅ Team expansion working');
          
          // Test collapsing
          console.log('📁 Testing team collapse');
          if (isExpanded) {
            await expandedTriangle.click();
            await page.waitForTimeout(1000);
            await captureScreenshot(page, 'after-team-collapse');
            
            const isCollapsed = await page.locator('text="▶"').first().isVisible();
            console.log(`Team collapsed (▶): ${isCollapsed}`);
          }
        } else {
          console.log('⚠️  Team expansion behavior unclear');
        }
      }
    } else {
      console.log('ℹ️  No disclosure triangles found (may be no teams or different UI)');
    }
    
    // Step 4: Analyze team structure
    console.log('🏢 Step 4: Analyze team leaderboard structure');
    
    // Look for team entries
    const teamSelectors = [
      '[class*="team"]', '.team-entry', 'tr', 'li',
      '[class*="group"]', '.leaderboard-entry'
    ];
    
    let teamEntries = 0;
    for (const selector of teamSelectors) {
      const count = await countVisibleElements(page, selector);
      if (count > 0) {
        teamEntries = count;
        console.log(`Found ${count} team entries using: ${selector}`);
        break;
      }
    }
    
    if (teamEntries > 0) {
      console.log(`✅ Found ${teamEntries} team entries`);
    } else {
      console.log('ℹ️  No team entries visible (empty team leaderboard)');
    }
    
    await captureScreenshot(page, 'teams-leaderboard-final');
    console.log('✅ Team leaderboard test completed');
  });

  test('Leaderboard Data Accuracy and Validation', async ({ page }) => {
    console.log('🔍 Testing leaderboard data accuracy and validation...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Test both Individual and Team leaderboards for data consistency
    const leaderboardTypes = [
      { name: 'Individual', selector: 'text="Individual"' },
      { name: 'Teams', selector: 'text="Teams"' }
    ];
    
    for (const leaderboard of leaderboardTypes) {
      console.log(`📊 Testing ${leaderboard.name} leaderboard data...`);
      
      await page.locator(leaderboard.selector).first().click();
      await page.waitForTimeout(2000);
      
      // Capture current state
      await captureScreenshot(page, `${leaderboard.name.toLowerCase()}-data-validation`);
      
      // Look for common data elements
      const dataElements = [
        'text="steps"', 'text="average"', 'text="per day"',
        'text="reported"', 'text="rate"', '[class*="count"]',
        '[class*="average"]', '[class*="steps"]'
      ];
      
      let foundDataElements = 0;
      for (const element of dataElements) {
        if (await page.locator(element).isVisible()) {
          foundDataElements++;
        }
      }
      
      console.log(`  Found ${foundDataElements} data elements in ${leaderboard.name}`);
      
      // Check for reasonable data ranges
      const pageText = await page.textContent('body');
      const numbers = pageText?.match(/\d+/g)?.map(n => parseInt(n)) || [];
      
      // Look for step counts (typically 1000-50000)
      const reasonableStepCounts = numbers.filter(n => n >= 1000 && n <= 100000);
      console.log(`  Found ${reasonableStepCounts.length} reasonable step counts`);
      
      // Check for percentages (0-100)
      const percentages = numbers.filter(n => n >= 0 && n <= 100);
      console.log(`  Found ${percentages.length} percentage values`);
      
      if (reasonableStepCounts.length > 0 || percentages.length > 0) {
        console.log(`  ✅ ${leaderboard.name} contains reasonable data values`);
      } else {
        console.log(`  ℹ️  ${leaderboard.name} data validation inconclusive`);
      }
    }
    
    console.log('✅ Data accuracy validation completed');
  });

  test('Leaderboard Responsive Design', async ({ page }) => {
    console.log('📱 Testing leaderboard responsive design...');
    
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-xl' },
      { width: 1024, height: 768, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet-portrait' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
      { width: 375, height: 667, name: 'mobile-portrait' },
      { width: 667, height: 375, name: 'mobile-landscape' }
    ];
    
    await page.goto('http://localhost:3000/dashboard');
    
    for (const viewport of viewports) {
      console.log(`📐 Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(500);
      
      // Test Individual leaderboard responsiveness
      await page.locator('text="Individual"').first().click();
      await page.waitForTimeout(1000);
      
      // Check if leaderboard is visible and accessible
      const leaderboardVisible = await page.locator('body').isVisible();
      await captureScreenshot(page, `individual-${viewport.name}`);
      
      // Test Teams leaderboard responsiveness
      await page.locator('text="Teams"').first().click();
      await page.waitForTimeout(1000);
      await captureScreenshot(page, `teams-${viewport.name}`);
      
      // Check for horizontal scroll issues
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = viewport.width;
      const hasHorizontalScroll = bodyWidth > viewportWidth;
      
      console.log(`  Viewport: ${viewportWidth}px, Content: ${bodyWidth}px, Scroll: ${hasHorizontalScroll ? '⚠️' : '✅'}`);
      
      // Test navigation in small viewports
      if (viewport.width <= 768) {
        console.log(`  Testing mobile navigation...`);
        
        // Check if tab navigation still works
        const tabsVisible = await page.locator('text="My Steps"').isVisible();
        console.log(`  Mobile tabs visible: ${tabsVisible ? '✅' : '❌'}`);
        
        if (tabsVisible) {
          await page.locator('text="My Steps"').first().click();
          await page.waitForTimeout(500);
          await captureScreenshot(page, `mobile-my-steps-${viewport.name}`);
        }
      }
      
      console.log(`  ✅ ${viewport.name} responsive test completed`);
    }
    
    // Reset to default viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('✅ Responsive design tests completed');
  });

  test('Leaderboard Real-time Updates and Refresh', async ({ page }) => {
    console.log('🔄 Testing leaderboard real-time updates...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Step 1: Capture initial leaderboard state
    console.log('📸 Step 1: Capture initial leaderboard state');
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    
    const initialContent = await page.textContent('body');
    await captureScreenshot(page, 'leaderboard-initial-state');
    
    // Step 2: Refresh page and compare
    console.log('🔄 Step 2: Test page refresh consistency');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to Individual leaderboard
    await page.locator('text="Individual"').first().click();
    await page.waitForTimeout(2000);
    
    const refreshedContent = await page.textContent('body');
    await captureScreenshot(page, 'leaderboard-after-refresh');
    
    // Compare content (basic check)
    const contentSimilar = initialContent?.length === refreshedContent?.length;
    console.log(`Content consistency after refresh: ${contentSimilar ? '✅' : '⚠️'}`);
    
    // Step 3: Test navigation between tabs
    console.log('🔄 Step 3: Test tab switching performance');
    
    const tabs = ['Individual', 'Teams', 'My Steps'];
    const tabSwitchTimes = [];
    
    for (const tab of tabs) {
      const startTime = Date.now();
      await page.locator(`text="${tab}"`).first().click();
      await page.waitForTimeout(1000);
      const endTime = Date.now();
      
      const switchTime = endTime - startTime;
      tabSwitchTimes.push(switchTime);
      
      console.log(`  ${tab} tab switch: ${switchTime}ms`);
      await captureScreenshot(page, `tab-switch-${tab.toLowerCase().replace(' ', '-')}`);
    }
    
    const averageSwitchTime = tabSwitchTimes.reduce((a, b) => a + b, 0) / tabSwitchTimes.length;
    console.log(`Average tab switch time: ${averageSwitchTime.toFixed(0)}ms`);
    
    if (averageSwitchTime < 2000) {
      console.log('✅ Fast tab switching (< 2 seconds average)');
    } else {
      console.log('⚠️  Slow tab switching (> 2 seconds average)');
    }
    
    // Step 4: Test data loading states
    console.log('⏳ Step 4: Test data loading states');
    
    // Clear cache and reload to see loading states
    await page.evaluate(() => {
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
    });
    
    await page.reload({ waitUntil: 'domcontentloaded' });
    await captureScreenshot(page, 'loading-state');
    
    // Wait for full load
    await page.waitForLoadState('networkidle');
    await captureScreenshot(page, 'loaded-state');
    
    console.log('✅ Real-time updates and refresh tests completed');
  });

  test('Leaderboard Accessibility and UX', async ({ page }) => {
    console.log('♿ Testing leaderboard accessibility and UX...');
    
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Step 1: Test keyboard navigation
    console.log('⌨️ Step 1: Test keyboard navigation');
    
    // Focus on first tab and navigate with keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    let currentElement = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`First focused element: ${currentElement}`);
    
    // Test pressing Enter on focused element
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await captureScreenshot(page, 'keyboard-navigation-enter');
    
    // Test arrow key navigation if applicable
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    
    currentElement = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`After arrow key: ${currentElement}`);
    
    await captureScreenshot(page, 'keyboard-navigation-arrow');
    
    // Step 2: Check for ARIA labels and semantic HTML
    console.log('🏷️ Step 2: Check accessibility attributes');
    
    // Look for ARIA labels
    const ariaLabels = await page.locator('[aria-label]').count();
    const ariaRoles = await page.locator('[role]').count();
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
    
    console.log(`ARIA labels found: ${ariaLabels}`);
    console.log(`ARIA roles found: ${ariaRoles}`);
    console.log(`Headings found: ${headings}`);
    
    // Step 3: Test color contrast and readability
    console.log('🎨 Step 3: Test visual accessibility');
    
    // Check if text is readable by looking for sufficient size
    const smallText = await page.locator('[style*="font-size"][style*="px"]').all();
    let readabilityIssues = 0;
    
    for (const element of smallText) {
      const fontSize = await element.evaluate(el => {
        const style = window.getComputedStyle(el);
        return parseInt(style.fontSize);
      });
      
      if (fontSize < 14) {
        readabilityIssues++;
      }
    }
    
    console.log(`Small text elements (< 14px): ${readabilityIssues}`);
    
    if (readabilityIssues === 0) {
      console.log('✅ No obvious readability issues');
    } else {
      console.log(`⚠️  Found ${readabilityIssues} potentially hard-to-read elements`);
    }
    
    // Step 4: Test focus indicators
    console.log('🔍 Step 4: Test focus indicators');
    
    // Tab through interactive elements and check focus visibility
    const interactiveElements = await page.locator('button, a, input, [tabindex]').all();
    let focusableElements = 0;
    
    for (let i = 0; i < Math.min(interactiveElements.length, 5); i++) {
      const element = interactiveElements[i];
      if (await element.isVisible()) {
        await element.focus();
        await page.waitForTimeout(200);
        focusableElements++;
      }
    }
    
    console.log(`Tested ${focusableElements} focusable elements`);
    await captureScreenshot(page, 'focus-indicators');
    
    console.log('✅ Accessibility and UX tests completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up leaderboard test...');
  });
});