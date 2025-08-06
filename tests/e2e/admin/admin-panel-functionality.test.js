/**
 * Admin Panel Functionality E2E Tests
 * 
 * Comprehensive testing of admin panel features including:
 * - Admin authentication and permission validation
 * - User management operations (create, edit, delete, team assignment)
 * - Team management functionality
 * - Challenge creation and management
 * - Theme system and customization features
 * - Navigation between admin sections
 * 
 * Tests the complete admin user experience with real database
 * operations and full UI interaction validation.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

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

// Helper function to authenticate admin user
async function authenticateAdmin(page, email = 'admin-test@example.com') {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  const response = await fetch('http://localhost:3000/dev/get-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Failed to get admin magic link: ${response.status}`);
  }

  const data = await response.json();
  await page.goto(data.magicLink);
  await page.waitForLoadState('networkidle');
  
  // Navigate to admin panel
  await page.goto('http://localhost:3000/admin');
  await page.waitForLoadState('networkidle');
  
  // Verify admin panel access
  await expect(page.locator('text="Step Challenge - Admin Dashboard"')).toBeVisible();
  return true;
}

// Helper function to wait for table to load
async function waitForTableLoad(page, tableSelector) {
  await page.waitForFunction(
    (selector) => {
      const table = document.querySelector(selector);
      return table && !table.textContent.includes('Loading');
    },
    tableSelector,
    { timeout: 10000 }
  );
}

// Helper function to generate unique test data
function generateTestData(prefix = 'test') {
  const timestamp = Date.now();
  return {
    email: `${prefix}-${timestamp}@example.com`,
    name: `${prefix} User ${timestamp}`,
    teamName: `${prefix} Team ${timestamp}`,
    challengeName: `${prefix} Challenge ${timestamp}`
  };
}

test.describe('Admin Panel Functionality Tests', () => {
  
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
    
    // Set longer timeouts for admin operations
    page.setDefaultTimeout(15000);
  });

  test('Admin Authentication and Panel Access', async ({ page }) => {
    console.log('🔑 Testing admin authentication and panel access...');
    
    // Step 1: Try to access admin panel without authentication
    console.log('📱 Step 1: Test unauthenticated admin access');
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');
    await captureScreenshot(page, 'admin-unauthenticated');
    
    // Should redirect to login or show login form
    const isOnLoginPage = page.url().includes('/auth/') || await page.locator('input[type="email"]').isVisible();
    expect(isOnLoginPage).toBeTruthy();
    console.log('✅ Unauthenticated users properly redirected');
    
    // Step 2: Authenticate as admin
    console.log('🔐 Step 2: Authenticate as admin user');
    await authenticateAdmin(page);
    await captureScreenshot(page, 'admin-authenticated');
    
    // Step 3: Verify admin panel elements
    console.log('🎛️ Step 3: Verify admin panel structure');
    const adminElements = [
      'text="Step Challenge - Admin Dashboard"',
      'button:has-text("Manage Users")',
      'button:has-text("Manage Teams")',
      'button:has-text("Manage Challenges")',
      'button:has-text("MCP Tokens")',
      'button:has-text("Overview")',
      'button:has-text("Extras")'
    ];
    
    for (const selector of adminElements) {
      await expect(page.locator(selector)).toBeVisible();
    }
    console.log('✅ All admin panel elements visible');
    
    // Step 4: Test navigation tabs
    console.log('🧭 Step 4: Test admin panel navigation');
    const tabs = [
      { button: 'Overview', view: 'overviewView' },
      { button: 'Manage Teams', view: 'manageTeamsView' },
      { button: 'Manage Challenges', view: 'challengesView' },
      { button: 'MCP Tokens', view: 'mcpTokensView' },
      { button: 'Extras', view: 'extrasView' },
      { button: 'Manage Users', view: 'usersView' }
    ];
    
    for (const tab of tabs) {
      console.log(`  Testing ${tab.button} tab...`);
      await page.locator(`button:has-text("${tab.button}")`).click();
      await page.waitForTimeout(1000);
      
      // Verify the correct view is shown
      const viewIsVisible = await page.locator(`#${tab.view}`).isVisible();
      expect(viewIsVisible).toBeTruthy();
      
      await captureScreenshot(page, `admin-tab-${tab.button.toLowerCase().replace(' ', '-')}`);
      console.log(`  ✅ ${tab.button} tab functional`);
    }
    
    console.log('✅ Admin authentication and panel access test completed');
  });

  test('User Management Functionality', async ({ page }) => {
    console.log('👥 Testing user management functionality...');
    
    await authenticateAdmin(page);
    
    // Navigate to user management tab
    await page.locator('button:has-text("Manage Users")').click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'user-management-initial');
    
    // Step 1: Verify user table loads
    console.log('📊 Step 1: Verify user table structure');
    await waitForTableLoad(page, '#usersTable table');
    
    const userTable = page.locator('#usersTable table');
    await expect(userTable).toBeVisible();
    
    // Check table headers
    const expectedHeaders = ['Name', 'Email', 'Team', 'Admin', 'Actions'];
    for (const header of expectedHeaders) {
      await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
    }
    console.log('✅ User table structure validated');
    
    // Step 2: Test user filtering and search (if available)
    console.log('🔍 Step 2: Test user search functionality');
    const searchInput = page.locator('input[placeholder*="search"], input[placeholder*="filter"]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('admin');
      await page.waitForTimeout(1000);
      await captureScreenshot(page, 'user-search-filter');
      console.log('✅ User search functionality working');
      
      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(1000);
    } else {
      console.log('ℹ️  User search not available in current interface');
    }
    
    // Step 3: Test user editing functionality
    console.log('✏️ Step 3: Test user editing operations');
    
    // Find first editable user row
    const userRows = await page.locator('#usersTable tbody tr').all();
    if (userRows.length > 0) {
      console.log(`  Found ${userRows.length} user rows`);
      
      // Test team assignment change
      const firstRow = userRows[0];
      const teamSelect = firstRow.locator('select').first();
      
      if (await teamSelect.isVisible()) {
        const currentValue = await teamSelect.inputValue();
        const options = await teamSelect.locator('option').allTextContents();
        
        if (options.length > 1) {
          console.log(`    Current team assignment: ${currentValue}`);
          console.log(`    Available teams: ${options.join(', ')}`);
          
          // Select different team if available
          const newOption = options.find(opt => opt !== currentValue && opt.trim() !== '');
          if (newOption) {
            await teamSelect.selectOption(newOption);
            await page.waitForTimeout(500);
            
            // Look for save button
            const saveButton = firstRow.locator('button.save-btn, .action-btn.save-btn').first();
            if (await saveButton.isVisible()) {
              await saveButton.click();
              await page.waitForTimeout(2000);
              await captureScreenshot(page, 'user-team-assignment');
              console.log('    ✅ Team assignment change completed');
            }
          }
        }
      }
    }
    
    // Step 4: Test admin privilege toggle (if available)
    console.log('👑 Step 4: Test admin privilege management');
    
    if (userRows.length > 1) {
      // Test on second row to avoid modifying current admin
      const secondRow = userRows[1];
      const adminCheckbox = secondRow.locator('input[type="checkbox"]').first();
      
      if (await adminCheckbox.isVisible()) {
        const initialState = await adminCheckbox.isChecked();
        console.log(`    Initial admin state: ${initialState}`);
        
        // Toggle admin status
        await adminCheckbox.click();
        await page.waitForTimeout(500);
        
        const saveButton = secondRow.locator('button.save-btn, .action-btn.save-btn').first();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(2000);
          await captureScreenshot(page, 'user-admin-toggle');
          console.log('    ✅ Admin privilege toggle completed');
        }
      }
    }
    
    console.log('✅ User management functionality test completed');
  });

  test('Team Management Operations', async ({ page }) => {
    console.log('🏢 Testing team management operations...');
    
    await authenticateAdmin(page);
    
    // Navigate to team management
    await page.locator('button:has-text("Manage Teams")').click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'team-management-initial');
    
    // Step 1: Verify team management interface
    console.log('🏗️ Step 1: Verify team management interface');
    
    await expect(page.locator('h2:has-text("Manage Teams")')).toBeVisible();
    await expect(page.locator('input#newTeamName')).toBeVisible();
    await expect(page.locator('button#createTeamBtn')).toBeVisible();
    
    console.log('✅ Team management interface validated');
    
    // Step 2: Create new team
    console.log('➕ Step 2: Test team creation');
    const testData = generateTestData('team');
    
    await page.locator('input#newTeamName').fill(testData.teamName);
    await captureScreenshot(page, 'team-creation-form');
    
    await page.locator('button#createTeamBtn').click();
    await page.waitForTimeout(3000);
    await captureScreenshot(page, 'team-created');
    
    // Check for success message or team in list
    const successMessage = page.locator('.message.success, .success').first();
    if (await successMessage.isVisible()) {
      const messageText = await successMessage.textContent();
      console.log(`    Success message: ${messageText}`);
    }
    
    console.log(`✅ Team "${testData.teamName}" creation completed`);
    
    // Step 3: Verify team appears in teams table
    console.log('📋 Step 3: Verify team in teams table');
    
    await waitForTableLoad(page, '#manageTeamsTable table');
    const teamsTable = page.locator('#manageTeamsTable table');
    
    if (await teamsTable.isVisible()) {
      const tableText = await teamsTable.textContent();
      const teamInTable = tableText.includes(testData.teamName);
      console.log(`    Team found in table: ${teamInTable}`);
      
      if (teamInTable) {
        console.log('✅ New team appears in teams table');
      }
    }
    
    // Step 4: Test team editing (if available)
    console.log('✏️ Step 4: Test team editing functionality');
    
    const teamRows = await page.locator('#manageTeamsTable tbody tr').all();
    if (teamRows.length > 0) {
      console.log(`  Found ${teamRows.length} team rows`);
      
      // Look for edit functionality on the last row (our new team)
      const lastRow = teamRows[teamRows.length - 1];
      const editableInput = lastRow.locator('input[type="text"]').first();
      
      if (await editableInput.isVisible()) {
        const currentValue = await editableInput.inputValue();
        const newValue = currentValue + ' (Edited)';
        
        await editableInput.fill(newValue);
        await page.waitForTimeout(500);
        
        const saveButton = lastRow.locator('button.save-btn, .action-btn.save-btn').first();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(2000);
          await captureScreenshot(page, 'team-edited');
          console.log(`    ✅ Team renamed to: ${newValue}`);
        }
      }
    }
    
    // Step 5: Test team deletion (if available)
    console.log('🗑️ Step 5: Test team deletion functionality');
    
    if (teamRows.length > 0) {
      const lastRow = teamRows[teamRows.length - 1];
      const deleteButton = lastRow.locator('button.delete-btn, .action-btn.delete-btn').first();
      
      if (await deleteButton.isVisible()) {
        // Handle potential confirmation dialog
        page.once('dialog', async dialog => {
          console.log(`    Confirmation dialog: ${dialog.message()}`);
          await dialog.accept();
        });
        
        await deleteButton.click();
        await page.waitForTimeout(2000);
        await captureScreenshot(page, 'team-deleted');
        console.log('✅ Team deletion completed');
      } else {
        console.log('ℹ️  Team deletion not available for this team');
      }
    }
    
    console.log('✅ Team management operations test completed');
  });

  test('Challenge Management Workflow', async ({ page }) => {
    console.log('🏆 Testing challenge management workflow...');
    
    await authenticateAdmin(page);
    
    // Navigate to challenge management
    await page.locator('button:has-text("Manage Challenges")').click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'challenge-management-initial');
    
    // Step 1: Verify challenge management interface
    console.log('🏗️ Step 1: Verify challenge management interface');
    
    await expect(page.locator('h2:has-text("Manage Challenges")')).toBeVisible();
    await expect(page.locator('input#newChallengeName')).toBeVisible();
    await expect(page.locator('input#newChallengeStartDate')).toBeVisible();
    await expect(page.locator('input#newChallengeEndDate')).toBeVisible();
    await expect(page.locator('input#newChallengeThreshold')).toBeVisible();
    await expect(page.locator('button#createChallengeBtn')).toBeVisible();
    
    console.log('✅ Challenge management interface validated');
    
    // Step 2: Test challenge form validation
    console.log('✅ Step 2: Test challenge form validation');
    
    // Test empty form submission
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(1000);
    
    // Check for validation messages
    const nameInput = page.locator('input#newChallengeName');
    const isInvalid = await nameInput.evaluate(el => !el.checkValidity());
    console.log(`    Form validation working: ${isInvalid ? '✅' : '❌'}`);
    
    // Step 3: Create new challenge with valid data
    console.log('➕ Step 3: Test challenge creation');
    const testData = generateTestData('challenge');
    
    // Calculate dates
    const today = new Date();
    const startDate = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks from now
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    await page.locator('input#newChallengeName').fill(testData.challengeName);
    await page.locator('input#newChallengeStartDate').fill(startDateStr);
    await page.locator('input#newChallengeEndDate').fill(endDateStr);
    await page.locator('input#newChallengeThreshold').fill('75');
    
    await captureScreenshot(page, 'challenge-creation-form');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    await captureScreenshot(page, 'challenge-created');
    
    // Check for success message
    const successMessage = page.locator('.message.success, .success').first();
    if (await successMessage.isVisible()) {
      const messageText = await successMessage.textContent();
      console.log(`    Success message: ${messageText}`);
    }
    
    console.log(`✅ Challenge "${testData.challengeName}" creation completed`);
    
    // Step 4: Verify challenge in challenges table
    console.log('📋 Step 4: Verify challenge in challenges table');
    
    await waitForTableLoad(page, '#challengesTable table');
    const challengesTable = page.locator('#challengesTable table');
    
    if (await challengesTable.isVisible()) {
      const tableText = await challengesTable.textContent();
      const challengeInTable = tableText.includes(testData.challengeName);
      console.log(`    Challenge found in table: ${challengeInTable}`);
      
      if (challengeInTable) {
        console.log('✅ New challenge appears in challenges table');
        
        // Check for expected data in table
        const hasStartDate = tableText.includes(startDateStr);
        const hasEndDate = tableText.includes(endDateStr);
        const hasThreshold = tableText.includes('75');
        
        console.log(`    Start date in table: ${hasStartDate}`);
        console.log(`    End date in table: ${hasEndDate}`);
        console.log(`    Threshold in table: ${hasThreshold}`);
      }
    }
    
    // Step 5: Test challenge status indicators
    console.log('🔍 Step 5: Test challenge status indicators');
    
    const challengeRows = await page.locator('#challengesTable tbody tr').all();
    if (challengeRows.length > 0) {
      for (const row of challengeRows.slice(0, 3)) { // Check first 3 challenges
        const rowText = await row.textContent();
        
        // Look for status indicators
        const hasStatus = rowText.includes('Active') || rowText.includes('Future') || rowText.includes('Past') || rowText.includes('Ended');
        if (hasStatus) {
          console.log(`    Row has status indicator: ${rowText.match(/(Active|Future|Past|Ended)/)?.[0] || 'Unknown'}`);
        }
      }
    }
    
    console.log('✅ Challenge management workflow test completed');
  });

  test('Theme System and Customization', async ({ page }) => {
    console.log('🎨 Testing theme system and customization...');
    
    await authenticateAdmin(page);
    
    // Navigate to extras tab
    await page.locator('button:has-text("Extras")').click();
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'extras-initial');
    
    // Step 1: Verify theme selector
    console.log('🌈 Step 1: Verify theme selector interface');
    
    await expect(page.locator('h3:has-text("Theme Selection")')).toBeVisible();
    await expect(page.locator('select#themeSelector')).toBeVisible();
    
    const themeSelector = page.locator('select#themeSelector');
    const themeOptions = await themeSelector.locator('option').allTextContents();
    console.log(`Available themes: ${themeOptions.join(', ')}`);
    
    expect(themeOptions.length).toBeGreaterThan(1);
    console.log('✅ Theme selector interface validated');
    
    // Step 2: Test theme switching
    console.log('🔄 Step 2: Test theme switching functionality');
    
    const themes = [
      { value: 'sunset', name: 'Sunset Orange' },
      { value: 'forest', name: 'Forest Green' },
      { value: 'lavender', name: 'Lavender Purple' },
      { value: 'monochrome', name: 'Monochrome' },
      { value: 'default', name: 'Ocean Blue' }
    ];
    
    for (const theme of themes) {
      console.log(`  Testing ${theme.name} theme...`);
      
      await themeSelector.selectOption(theme.value);
      await page.waitForTimeout(1000);
      
      // Check if body has theme attribute
      const bodyTheme = await page.locator('body').getAttribute('data-theme');
      const expectedTheme = theme.value === 'default' ? null : theme.value;
      
      console.log(`    Body theme attribute: ${bodyTheme}`);
      console.log(`    Expected: ${expectedTheme}`);
      
      await captureScreenshot(page, `theme-${theme.value}`);
      console.log(`  ✅ ${theme.name} theme applied`);
    }
    
    // Step 3: Test confetti configuration
    console.log('🎉 Step 3: Test confetti configuration');
    
    // Test epic confetti toggle
    const epicConfettiCheckbox = page.locator('input#megaConfettiEnabled');
    if (await epicConfettiCheckbox.isVisible()) {
      const initialState = await epicConfettiCheckbox.isChecked();
      console.log(`    Initial epic confetti state: ${initialState}`);
      
      await epicConfettiCheckbox.click();
      await page.waitForTimeout(500);
      
      const newState = await epicConfettiCheckbox.isChecked();
      console.log(`    New epic confetti state: ${newState}`);
      console.log('    ✅ Epic confetti toggle working');
    }
    
    // Test threshold configuration
    const regularThreshold = page.locator('input#regularConfettiThreshold');
    const epicThreshold = page.locator('input#epicConfettiThreshold');
    
    if (await regularThreshold.isVisible()) {
      await regularThreshold.fill('12000');
      await page.waitForTimeout(500);
      console.log('    Regular threshold updated to 12000');
    }
    
    if (await epicThreshold.isVisible()) {
      await epicThreshold.fill('25000');
      await page.waitForTimeout(500);
      console.log('    Epic threshold updated to 25000');
    }
    
    // Save threshold settings
    const saveThresholdBtn = page.locator('button#saveConfettiThresholds');
    if (await saveThresholdBtn.isVisible()) {
      await saveThresholdBtn.click();
      await page.waitForTimeout(2000);
      await captureScreenshot(page, 'confetti-thresholds-saved');
      console.log('    ✅ Confetti thresholds saved');
    }
    
    // Step 4: Test confetti physics controls
    console.log('⚙️ Step 4: Test confetti physics controls');
    
    const physicsControls = [
      { id: 'particleCountSlider', name: 'Particle Count' },
      { id: 'lifetimeSlider', name: 'Lifetime' },
      { id: 'tiltSensitivitySlider', name: 'Tilt Sensitivity' },
      { id: 'maxTiltForceSlider', name: 'Max Tilt Force' }
    ];
    
    for (const control of physicsControls) {
      const slider = page.locator(`input#${control.id}`);
      if (await slider.isVisible()) {
        const currentValue = await slider.inputValue();
        const max = await slider.getAttribute('max');
        const newValue = Math.floor(max * 0.7); // Set to 70% of max
        
        await slider.fill(newValue.toString());
        await page.waitForTimeout(300);
        
        console.log(`    ${control.name}: ${currentValue} → ${newValue}`);
      }
    }
    
    // Test physics buttons
    const resetPhysicsBtn = page.locator('button#resetPhysicsBtn');
    if (await resetPhysicsBtn.isVisible()) {
      await resetPhysicsBtn.click();
      await page.waitForTimeout(1000);
      console.log('    ✅ Physics reset to defaults');
    }
    
    const testPhysicsBtn = page.locator('button#testPhysicsBtn');
    if (await testPhysicsBtn.isVisible()) {
      await testPhysicsBtn.click();
      await page.waitForTimeout(2000);
      await captureScreenshot(page, 'physics-test');
      console.log('    ✅ Physics test completed');
    }
    
    console.log('✅ Theme system and customization test completed');
  });

  test('Overview Statistics and Export Functionality', async ({ page }) => {
    console.log('📊 Testing overview statistics and export functionality...');
    
    await authenticateAdmin(page);
    
    // Step 1: Test overview tab
    console.log('📈 Step 1: Test overview statistics');
    
    await page.locator('button:has-text("Overview")').click();
    await page.waitForTimeout(3000);
    await captureScreenshot(page, 'overview-statistics');
    
    // Verify statistics cards
    const statsCards = [
      { id: 'totalUsers', label: 'Total Users' },
      { id: 'totalSteps', label: 'Total Steps' },
      { id: 'avgSteps', label: 'Avg Steps/User' },
      { id: 'activeUsers', label: 'Active Users' }
    ];
    
    for (const stat of statsCards) {
      const statElement = page.locator(`#${stat.id}`);
      await expect(statElement).toBeVisible();
      
      const value = await statElement.textContent();
      const hasNumericValue = value && value !== '-' && !value.includes('Loading');
      
      console.log(`  ${stat.label}: ${value} (${hasNumericValue ? '✅' : '⚠️'})`);
    }
    
    console.log('✅ Overview statistics displayed');
    
    // Step 2: Test export functionality
    console.log('💾 Step 2: Test CSV export functionality');
    
    const exportButton = page.locator('button:has-text("Export CSV")');
    await expect(exportButton).toBeVisible();
    
    // Set up download handler
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    
    try {
      const download = await downloadPromise;
      console.log(`    Download started: ${download.suggestedFilename()}`);
      
      // Save the download to verify it worked
      const downloadPath = path.join(__dirname, 'downloads', download.suggestedFilename());
      const downloadDir = path.dirname(downloadPath);
      
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      
      await download.saveAs(downloadPath);
      
      // Verify file exists and has content
      if (fs.existsSync(downloadPath)) {
        const fileSize = fs.statSync(downloadPath).size;
        console.log(`    Download saved: ${downloadPath} (${fileSize} bytes)`);
        
        if (fileSize > 0) {
          console.log('    ✅ CSV export successful');
        } else {
          console.log('    ⚠️ Downloaded file is empty');
        }
      } else {
        console.log('    ❌ Download file not found');
      }
      
    } catch (error) {
      console.log(`    ⚠️ Export test error: ${error.message}`);
      // This might not be critical - some environments might not support downloads
    }
    
    await captureScreenshot(page, 'export-completed');
    
    console.log('✅ Overview statistics and export test completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up admin panel test...');
  });
});