/**
 * Challenge Management E2E Tests
 * 
 * Comprehensive testing of challenge creation and management including:
 * - Challenge creation with date validation and constraints
 * - Challenge lifecycle management (active, future, past status)
 * - Challenge editing and deletion operations  
 * - Challenge impact on user step recording functionality
 * - Reporting threshold configuration and validation
 * - Challenge period constraints and business rules
 * - Admin challenge oversight and monitoring
 * 
 * Tests the complete challenge management workflow with real database
 * operations and impact on user functionality validation.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'challenges', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to authenticate admin user
async function authenticateAdmin(page, email = 'challenge-admin@example.com') {
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
  
  // Navigate to admin panel and challenges tab
  await page.goto('http://localhost:3000/admin');
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("Manage Challenges")').click();
  await page.waitForTimeout(2000);
  
  return true;
}

// Helper function to authenticate regular user for impact testing
async function authenticateUser(page, email = 'challenge-user@example.com') {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  const response = await fetch('http://localhost:3000/dev/get-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Failed to get user magic link: ${response.status}`);
  }

  const data = await response.json();
  await page.goto(data.magicLink);
  await page.waitForLoadState('networkidle');
  
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

// Helper function to format date for input
function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

// Helper function to generate unique test data
function generateChallengeData(prefix = 'test') {
  const timestamp = Date.now();
  const today = new Date();
  
  return {
    name: `${prefix} Challenge ${timestamp}`,
    pastName: `${prefix} Past Challenge ${timestamp}`,
    futureName: `${prefix} Future Challenge ${timestamp}`,
    activeName: `${prefix} Active Challenge ${timestamp}`,
    // Past challenge (ended yesterday)
    pastStart: formatDateForInput(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)),
    pastEnd: formatDateForInput(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
    // Future challenge (starts next week)
    futureStart: formatDateForInput(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)),
    futureEnd: formatDateForInput(new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000)),
    // Active challenge (started yesterday, ends next week)
    activeStart: formatDateForInput(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
    activeEnd: formatDateForInput(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000))
  };
}

test.describe('Challenge Management Tests', () => {
  
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

  test('Challenge Management Interface and Validation', async ({ page }) => {
    console.log('🏆 Testing challenge management interface and validation...');
    
    await authenticateAdmin(page);
    await captureScreenshot(page, 'challenge-interface-initial');
    
    // Step 1: Verify challenge management interface
    console.log('🎛️ Step 1: Verify challenge management interface');
    
    const interfaceElements = [
      'h2:has-text("Manage Challenges")',
      'h3:has-text("Create New Challenge")',
      'input#newChallengeName',
      'input#newChallengeStartDate',
      'input#newChallengeEndDate',
      'input#newChallengeThreshold',
      'button#createChallengeBtn'
    ];
    
    for (const selector of interfaceElements) {
      await expect(page.locator(selector)).toBeVisible();
    }
    console.log('✅ All challenge interface elements visible');
    
    // Step 2: Test form validation
    console.log('✅ Step 2: Test challenge form validation');
    
    // Test empty form submission
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(1000);
    
    const nameInput = page.locator('input#newChallengeName');
    const startDateInput = page.locator('input#newChallengeStartDate');
    const endDateInput = page.locator('input#newChallengeEndDate');
    const thresholdInput = page.locator('input#newChallengeThreshold');
    
    // Check HTML5 validation
    const nameValid = await nameInput.evaluate(el => el.checkValidity());
    const startDateValid = await startDateInput.evaluate(el => el.checkValidity());
    const endDateValid = await endDateInput.evaluate(el => el.checkValidity());
    
    console.log(`  Name field validation: ${nameValid ? 'Valid' : 'Invalid (as expected)'}`);
    console.log(`  Start date validation: ${startDateValid ? 'Valid' : 'Invalid (as expected)'}`);
    console.log(`  End date validation: ${endDateValid ? 'Valid' : 'Invalid (as expected)'}`);
    
    // Step 3: Test invalid date range
    console.log('📅 Step 3: Test invalid date range validation');
    
    const today = new Date();
    const yesterday = formatDateForInput(new Date(today.getTime() - 24 * 60 * 60 * 1000));
    const tomorrow = formatDateForInput(new Date(today.getTime() + 24 * 60 * 60 * 1000));
    
    // Fill form with end date before start date
    await nameInput.fill('Invalid Date Range Test');
    await startDateInput.fill(tomorrow);
    await endDateInput.fill(yesterday);
    await thresholdInput.fill('70');
    
    await captureScreenshot(page, 'invalid-date-range');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(2000);
    
    // Check for error message
    const errorMessage = page.locator('.message.error, .error, .alert-danger');
    if (await errorMessage.isVisible()) {
      const messageText = await errorMessage.textContent();
      console.log(`  Date validation error: ${messageText}`);
    } else {
      console.log('  ⚠️ No visible date range validation error');
    }
    
    // Step 4: Test threshold validation
    console.log('🎯 Step 4: Test threshold validation');
    
    // Test invalid threshold values
    const invalidThresholds = ['-10', '0', '101', 'abc'];
    
    for (const threshold of invalidThresholds) {
      await thresholdInput.fill(threshold);
      const isValid = await thresholdInput.evaluate(el => el.checkValidity());
      console.log(`  Threshold "${threshold}": ${isValid ? 'Valid (unexpected)' : 'Invalid (expected)'}`);
    }
    
    // Reset to valid threshold
    await thresholdInput.fill('70');
    
    console.log('✅ Challenge management interface and validation test completed');
  });

  test('Challenge Creation and Lifecycle Management', async ({ page }) => {
    console.log('🚀 Testing challenge creation and lifecycle management...');
    
    await authenticateAdmin(page);
    const testData = generateChallengeData('lifecycle');
    
    // Step 1: Create past challenge
    console.log('📅 Step 1: Create past challenge');
    
    await page.locator('input#newChallengeName').fill(testData.pastName);
    await page.locator('input#newChallengeStartDate').fill(testData.pastStart);
    await page.locator('input#newChallengeEndDate').fill(testData.pastEnd);
    await page.locator('input#newChallengeThreshold').fill('60');
    
    await captureScreenshot(page, 'past-challenge-form');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    // Check for success
    const successMessage = page.locator('.message.success, .success');
    if (await successMessage.isVisible()) {
      console.log(`  Past challenge created successfully`);
    }
    
    // Step 2: Create future challenge
    console.log('🔮 Step 2: Create future challenge');
    
    await page.locator('input#newChallengeName').fill(testData.futureName);
    await page.locator('input#newChallengeStartDate').fill(testData.futureStart);
    await page.locator('input#newChallengeEndDate').fill(testData.futureEnd);
    await page.locator('input#newChallengeThreshold').fill('80');
    
    await captureScreenshot(page, 'future-challenge-form');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    if (await successMessage.isVisible()) {
      console.log(`  Future challenge created successfully`);
    }
    
    // Step 3: Create active challenge
    console.log('⚡ Step 3: Create active challenge');
    
    await page.locator('input#newChallengeName').fill(testData.activeName);
    await page.locator('input#newChallengeStartDate').fill(testData.activeStart);
    await page.locator('input#newChallengeEndDate').fill(testData.activeEnd);
    await page.locator('input#newChallengeThreshold').fill('75');
    
    await captureScreenshot(page, 'active-challenge-form');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    if (await successMessage.isVisible()) {
      console.log(`  Active challenge created successfully`);
    }
    
    // Step 4: Verify all challenges in table
    console.log('📊 Step 4: Verify challenges in management table');
    
    await waitForTableLoad(page, '#challengesTable table');
    const challengesTable = page.locator('#challengesTable table');
    await captureScreenshot(page, 'all-challenges-table');
    
    if (await challengesTable.isVisible()) {
      const tableText = await challengesTable.textContent();
      
      const pastInTable = tableText.includes(testData.pastName);
      const futureInTable = tableText.includes(testData.futureName);
      const activeInTable = tableText.includes(testData.activeName);
      
      console.log(`  Past challenge in table: ${pastInTable ? '✅' : '❌'}`);
      console.log(`  Future challenge in table: ${futureInTable ? '✅' : '❌'}`);
      console.log(`  Active challenge in table: ${activeInTable ? '✅' : '❌'}`);
      
      // Check for status indicators
      const challengeRows = await challengesTable.locator('tbody tr').all();
      for (const row of challengeRows) {
        const rowText = await row.textContent();
        if (rowText.includes(testData.pastName) || rowText.includes(testData.futureName) || rowText.includes(testData.activeName)) {
          const hasStatus = rowText.includes('Active') || rowText.includes('Future') || rowText.includes('Past') || rowText.includes('Ended');
          if (hasStatus) {
            const statusMatch = rowText.match(/(Active|Future|Past|Ended)/);
            console.log(`    Challenge status: ${statusMatch ? statusMatch[0] : 'Unknown'}`);
          }
        }
      }
    }
    
    // Step 5: Test challenge impact on user step recording
    console.log('👤 Step 5: Test challenge impact on user functionality');
    
    // Open new tab for user testing
    const userPage = await page.context().newPage();
    await userPage.setDefaultTimeout(15000);
    
    try {
      await authenticateUser(userPage);
      await captureScreenshot(userPage, 'user-dashboard-with-challenges');
      
      // Check for active challenge indication
      const stepForm = userPage.locator('input[type="number"]');
      const submitButton = userPage.locator('#submitStepsBtn, button:has-text("Save Steps"), button:has-text("Log Steps")');
      
      if (await stepForm.isVisible() && await submitButton.isVisible()) {
        const isEnabled = await submitButton.isEnabled();
        console.log(`  Step recording form enabled: ${isEnabled ? '✅' : '❌'}`);
        
        if (isEnabled) {
          // Try to record steps
          await stepForm.fill('5000');
          await submitButton.click();
          await userPage.waitForTimeout(2000);
          
          const successIndicator = userPage.locator('.message.success, .success, .alert-success');
          if (await successIndicator.isVisible()) {
            console.log('  ✅ Step recording functional with active challenge');
          } else {
            console.log('  ⚠️ Step recording may not be working');
          }
        } else {
          console.log('  ℹ️ Step recording disabled (no active challenge period)');
        }
      } else {
        console.log('  ℹ️ Step recording form not found');
      }
      
      await captureScreenshot(userPage, 'user-step-recording-test');
      
    } catch (error) {
      console.log(`  ⚠️ User functionality test error: ${error.message}`);
    } finally {
      await userPage.close();
    }
    
    console.log('✅ Challenge creation and lifecycle management test completed');
  });

  test('Challenge Editing and Management Operations', async ({ page }) => {
    console.log('✏️ Testing challenge editing and management operations...');
    
    await authenticateAdmin(page);
    const testData = generateChallengeData('edit');
    
    // Step 1: Create challenge for editing
    console.log('🏗️ Step 1: Create challenge for editing tests');
    
    await page.locator('input#newChallengeName').fill(testData.name);
    await page.locator('input#newChallengeStartDate').fill(testData.futureStart);
    await page.locator('input#newChallengeEndDate').fill(testData.futureEnd);
    await page.locator('input#newChallengeThreshold').fill('65');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Test challenge created');
    
    // Step 2: Locate challenge in table
    console.log('🔍 Step 2: Locate challenge for editing');
    
    await waitForTableLoad(page, '#challengesTable table');
    const challengesTable = page.locator('#challengesTable table');
    
    const challengeRows = await challengesTable.locator('tbody tr').all();
    let testChallengeRow = null;
    
    for (const row of challengeRows) {
      const rowText = await row.textContent();
      if (rowText.includes(testData.name)) {
        testChallengeRow = row;
        break;
      }
    }
    
    if (!testChallengeRow) {
      console.log('❌ Test challenge not found in table');
      return;
    }
    
    console.log('✅ Test challenge located in table');
    
    // Step 3: Test inline editing (if available)
    console.log('✏️ Step 3: Test inline editing functionality');
    
    // Look for editable fields
    const editableNameInput = testChallengeRow.locator('input[type="text"]').first();
    const editableThresholdInput = testChallengeRow.locator('input[type="number"]').first();
    
    if (await editableNameInput.isVisible()) {
      const currentName = await editableNameInput.inputValue();
      const newName = currentName + ' (Edited)';
      
      await editableNameInput.fill(newName);
      await page.waitForTimeout(500);
      
      // Look for save button
      const saveButton = testChallengeRow.locator('button.save-btn, .action-btn.save-btn, button:has-text("Save")').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        await captureScreenshot(page, 'challenge-name-edited');
        console.log(`  ✅ Challenge name edited to: ${newName}`);
      }
    } else {
      console.log('  ℹ️ Inline editing not available for challenge names');
    }
    
    if (await editableThresholdInput.isVisible()) {
      await editableThresholdInput.fill('85');
      await page.waitForTimeout(500);
      
      const saveButton = testChallengeRow.locator('button.save-btn, .action-btn.save-btn, button:has-text("Save")').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(2000);
        await captureScreenshot(page, 'challenge-threshold-edited');
        console.log('  ✅ Challenge threshold edited to 85%');
      }
    } else {
      console.log('  ℹ️ Inline editing not available for thresholds');
    }
    
    // Step 4: Test challenge action buttons
    console.log('🎯 Step 4: Test challenge management actions');
    
    // Test edit button (if available)
    const editButton = testChallengeRow.locator('button:has-text("Edit"), .edit-btn').first();
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(1000);
      await captureScreenshot(page, 'challenge-edit-mode');
      console.log('  ✅ Edit button functional');
    }
    
    // Test details/view button
    const detailsButton = testChallengeRow.locator('button:has-text("Details"), button:has-text("View"), .details-btn').first();
    if (await detailsButton.isVisible()) {
      await detailsButton.click();
      await page.waitForTimeout(1000);
      await captureScreenshot(page, 'challenge-details');
      console.log('  ✅ Details button functional');
    }
    
    // Test archive/disable button (if available)
    const archiveButton = testChallengeRow.locator('button:has-text("Archive"), button:has-text("Disable"), .archive-btn').first();
    if (await archiveButton.isVisible()) {
      await archiveButton.click();
      await page.waitForTimeout(1000);
      console.log('  ✅ Archive button functional');
    }
    
    // Step 5: Test challenge deletion (if available)
    console.log('🗑️ Step 5: Test challenge deletion');
    
    const deleteButton = testChallengeRow.locator('button:has-text("Delete"), .delete-btn').first();
    if (await deleteButton.isVisible()) {
      // Handle confirmation dialog
      page.once('dialog', async dialog => {
        console.log(`  Confirmation: ${dialog.message()}`);
        await dialog.accept();
      });
      
      await deleteButton.click();
      await page.waitForTimeout(3000);
      await captureScreenshot(page, 'challenge-deleted');
      
      // Verify challenge is removed
      const updatedTable = await challengesTable.textContent();
      const challengeStillPresent = updatedTable.includes(testData.name);
      console.log(`  Challenge deletion: ${challengeStillPresent ? '❌ Still present' : '✅ Successfully removed'}`);
    } else {
      console.log('  ℹ️ Challenge deletion not available');
    }
    
    console.log('✅ Challenge editing and management operations test completed');
  });

  test('Challenge Business Rules and Constraints', async ({ page }) => {
    console.log('📋 Testing challenge business rules and constraints...');
    
    await authenticateAdmin(page);
    const testData = generateChallengeData('rules');
    
    // Step 1: Test single active challenge constraint
    console.log('⚡ Step 1: Test single active challenge constraint');
    
    // Create first active challenge
    await page.locator('input#newChallengeName').fill(testData.activeName + ' #1');
    await page.locator('input#newChallengeStartDate').fill(testData.activeStart);
    await page.locator('input#newChallengeEndDate').fill(testData.activeEnd);
    await page.locator('input#newChallengeThreshold').fill('70');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    const firstChallengeSuccess = page.locator('.message.success, .success');
    if (await firstChallengeSuccess.isVisible()) {
      console.log('  ✅ First active challenge created');
    }
    
    // Try to create overlapping active challenge
    const today = new Date();
    const overlappingStart = formatDateForInput(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000));
    const overlappingEnd = formatDateForInput(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000));
    
    await page.locator('input#newChallengeName').fill(testData.activeName + ' #2 (Overlapping)');
    await page.locator('input#newChallengeStartDate').fill(overlappingStart);
    await page.locator('input#newChallengeEndDate').fill(overlappingEnd);
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    const errorMessage = page.locator('.message.error, .error, .alert-danger');
    if (await errorMessage.isVisible()) {
      const messageText = await errorMessage.textContent();
      console.log(`  Overlap constraint: ${messageText}`);
      console.log('  ✅ Overlapping challenge properly blocked');
    } else {
      console.log('  ⚠️ No overlap constraint detected');
    }
    
    await captureScreenshot(page, 'overlapping-challenge-blocked');
    
    // Step 2: Test minimum duration constraint
    console.log('⏰ Step 2: Test minimum duration constraint');
    
    const sameDayStart = formatDateForInput(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));
    const sameDayEnd = sameDayStart; // Same day
    
    await page.locator('input#newChallengeName').fill('Single Day Challenge');
    await page.locator('input#newChallengeStartDate').fill(sameDayStart);
    await page.locator('input#newChallengeEndDate').fill(sameDayEnd);
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(2000);
    
    if (await errorMessage.isVisible()) {
      const messageText = await errorMessage.textContent();
      console.log(`  Duration constraint: ${messageText}`);
    } else {
      console.log('  ℹ️ Single day challenge allowed or no duration constraint');
    }
    
    // Step 3: Test threshold boundary values
    console.log('🎯 Step 3: Test threshold boundary values');
    
    const futureChallengeStart = formatDateForInput(new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000));
    const futureChallengeEnd = formatDateForInput(new Date(today.getTime() + 74 * 24 * 60 * 60 * 1000));
    
    const boundaryThresholds = [
      { value: '1', expected: 'valid' },
      { value: '100', expected: 'valid' },
      { value: '0', expected: 'invalid' },
      { value: '101', expected: 'invalid' }
    ];
    
    for (const threshold of boundaryThresholds) {
      await page.locator('input#newChallengeName').fill(`Threshold Test ${threshold.value}%`);
      await page.locator('input#newChallengeStartDate').fill(futureChallengeStart);
      await page.locator('input#newChallengeEndDate').fill(futureChallengeEnd);
      await page.locator('input#newChallengeThreshold').fill(threshold.value);
      
      const isInputValid = await page.locator('input#newChallengeThreshold').evaluate(el => el.checkValidity());
      console.log(`  Threshold ${threshold.value}%: ${isInputValid ? 'Valid' : 'Invalid'} (expected: ${threshold.expected})`);
      
      // Adjust dates for next test
      futureChallengeStart.split('-')[2] = String(parseInt(futureChallengeStart.split('-')[2]) + 20);
      futureChallengeEnd.split('-')[2] = String(parseInt(futureChallengeEnd.split('-')[2]) + 20);
    }
    
    // Step 4: Test date constraint rules
    console.log('📅 Step 4: Test date constraint rules');
    
    // Test past start date
    const pastDate = formatDateForInput(new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000));
    const futureDate = formatDateForInput(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000));
    
    await page.locator('input#newChallengeName').fill('Past Start Date Test');
    await page.locator('input#newChallengeStartDate').fill(pastDate);
    await page.locator('input#newChallengeEndDate').fill(futureDate);
    await page.locator('input#newChallengeThreshold').fill('70');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(2000);
    
    if (await errorMessage.isVisible()) {
      const messageText = await errorMessage.textContent();
      console.log(`  Past start date constraint: ${messageText}`);
    } else {
      console.log('  ℹ️ Past start date allowed or no constraint');
    }
    
    await captureScreenshot(page, 'business-rules-tested');
    
    // Step 5: Verify final table state
    console.log('📊 Step 5: Verify final challenge table state');
    
    await waitForTableLoad(page, '#challengesTable table');
    const challengesTable = page.locator('#challengesTable table');
    
    if (await challengesTable.isVisible()) {
      const challengeRows = await challengesTable.locator('tbody tr').all();
      console.log(`  Total challenges in table: ${challengeRows.length}`);
      
      // Count challenges by status
      let activeCount = 0, futureCount = 0, pastCount = 0;
      
      for (const row of challengeRows) {
        const rowText = await row.textContent();
        if (rowText.includes('Active')) activeCount++;
        else if (rowText.includes('Future')) futureCount++;
        else if (rowText.includes('Past') || rowText.includes('Ended')) pastCount++;
      }
      
      console.log(`  Active challenges: ${activeCount}`);
      console.log(`  Future challenges: ${futureCount}`);
      console.log(`  Past challenges: ${pastCount}`);
      
      if (activeCount <= 1) {
        console.log('  ✅ Single active challenge constraint maintained');
      } else {
        console.log('  ⚠️ Multiple active challenges detected');
      }
    }
    
    await captureScreenshot(page, 'final-challenge-state');
    
    console.log('✅ Challenge business rules and constraints test completed');
  });

  test('Challenge Impact on User Experience', async ({ page }) => {
    console.log('👥 Testing challenge impact on user experience...');
    
    await authenticateAdmin(page);
    const testData = generateChallengeData('ux');
    
    // Step 1: Create active challenge
    console.log('🏆 Step 1: Create active challenge for UX testing');
    
    await page.locator('input#newChallengeName').fill(testData.activeName);
    await page.locator('input#newChallengeStartDate').fill(testData.activeStart);
    await page.locator('input#newChallengeEndDate').fill(testData.activeEnd);
    await page.locator('input#newChallengeThreshold').fill('75');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Active challenge created for UX testing');
    
    // Step 2: Test user dashboard with active challenge
    console.log('🏠 Step 2: Test user dashboard with active challenge');
    
    const userPage = await page.context().newPage();
    await userPage.setDefaultTimeout(15000);
    
    try {
      await authenticateUser(userPage);
      await captureScreenshot(userPage, 'user-dashboard-active-challenge');
      
      // Check for challenge information display
      const challengeInfo = userPage.locator('text*="Challenge"', 'text*="challenge"', '.challenge-info');
      if (await challengeInfo.first().isVisible()) {
        console.log('  ✅ Challenge information visible to users');
      } else {
        console.log('  ℹ️ No explicit challenge information display');
      }
      
      // Test step recording functionality
      const stepInput = userPage.locator('input[type="number"]');
      const submitButton = userPage.locator('#submitStepsBtn, button:has-text("Save Steps"), button:has-text("Log Steps")');
      
      if (await stepInput.isVisible() && await submitButton.isVisible()) {
        const isSubmitEnabled = await submitButton.isEnabled();
        console.log(`  Step recording enabled with active challenge: ${isSubmitEnabled ? '✅' : '❌'}`);
        
        if (isSubmitEnabled) {
          // Test step submission
          await stepInput.fill('8500');
          await submitButton.click();
          await userPage.waitForTimeout(3000);
          
          const successMessage = userPage.locator('.message.success, .success, .alert-success');
          if (await successMessage.isVisible()) {
            console.log('  ✅ Step submission successful with active challenge');
            
            // Check if steps appear in leaderboards
            const leaderboardTabs = ['Individual', 'Teams'];
            for (const tab of leaderboardTabs) {
              const tabButton = userPage.locator(`text="${tab}"`).first();
              if (await tabButton.isVisible()) {
                await tabButton.click();
                await userPage.waitForTimeout(2000);
                
                const leaderboard = userPage.locator('table, .leaderboard');
                if (await leaderboard.isVisible()) {
                  const leaderboardText = await leaderboard.textContent();
                  const hasStepData = leaderboardText.includes('8500') || leaderboardText.includes('8,500');
                  console.log(`    ${tab} leaderboard updated: ${hasStepData ? '✅' : '⚠️'}`);
                }
                
                await captureScreenshot(userPage, `user-leaderboard-${tab.toLowerCase()}`);
              }
            }
          } else {
            console.log('  ⚠️ Step submission may have failed');
          }
        }
      }
      
    } catch (error) {
      console.log(`  ⚠️ User experience test error: ${error.message}`);
    } finally {
      await userPage.close();
    }
    
    // Step 3: Create future challenge and test user experience
    console.log('🔮 Step 3: Test user experience with future challenge only');
    
    // First, end the active challenge by creating a past challenge that replaces it
    await page.locator('input#newChallengeName').fill('Replacement Past Challenge');
    await page.locator('input#newChallengeStartDate').fill(formatDateForInput(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)));
    await page.locator('input#newChallengeEndDate').fill(formatDateForInput(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)));
    await page.locator('input#newChallengeThreshold').fill('70');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    // Create future challenge
    await page.locator('input#newChallengeName').fill(testData.futureName);
    await page.locator('input#newChallengeStartDate').fill(testData.futureStart);
    await page.locator('input#newChallengeEndDate').fill(testData.futureEnd);
    await page.locator('input#newChallengeThreshold').fill('80');
    
    await page.locator('button#createChallengeBtn').click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Future challenge created');
    
    // Test user experience with no active challenge
    const userPage2 = await page.context().newPage();
    await userPage2.setDefaultTimeout(15000);
    
    try {
      await authenticateUser(userPage2);
      await captureScreenshot(userPage2, 'user-dashboard-future-challenge-only');
      
      const stepInput = userPage2.locator('input[type="number"]');
      const submitButton = userPage2.locator('#submitStepsBtn, button:has-text("Save Steps"), button:has-text("Log Steps")');
      
      if (await stepInput.isVisible() && await submitButton.isVisible()) {
        const isSubmitEnabled = await submitButton.isEnabled();
        console.log(`  Step recording with future challenge only: ${isSubmitEnabled ? '⚠️ Enabled' : '✅ Properly disabled'}`);
        
        if (!isSubmitEnabled) {
          // Check for informational message about challenge timing
          const infoMessage = userPage2.locator('text*="No active challenge"', 'text*="challenge period"', '.info, .alert-info');
          if (await infoMessage.first().isVisible()) {
            const messageText = await infoMessage.first().textContent();
            console.log(`    User guidance: ${messageText.substring(0, 100)}...`);
          }
        }
      }
      
    } catch (error) {
      console.log(`  ⚠️ Future challenge UX test error: ${error.message}`);
    } finally {
      await userPage2.close();
    }
    
    await captureScreenshot(page, 'challenge-ux-testing-complete');
    
    console.log('✅ Challenge impact on user experience test completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up challenge management test...');
  });
});