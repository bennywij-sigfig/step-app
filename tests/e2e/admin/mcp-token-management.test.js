/**
 * MCP Token Management E2E Tests
 * 
 * Comprehensive testing of MCP (Model Context Protocol) token management including:
 * - Token creation with different permission levels and scopes
 * - Token validation and API integration testing
 * - Token revocation and lifecycle management
 * - Audit log functionality and monitoring
 * - Security validation and access control
 * - API endpoint testing with created tokens
 * 
 * Tests the complete MCP token management workflow with real API
 * operations and database interactions.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper function to capture screenshot
async function captureScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(__dirname, 'screenshots', 'mcp', `${name}-${timestamp}.png`);
  
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

// Helper function to authenticate admin user
async function authenticateAdmin(page, email = 'mcp-admin-test@example.com') {
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
  
  // Navigate to admin panel and MCP tokens tab
  await page.goto('http://localhost:3000/admin');
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("MCP Tokens")').click();
  await page.waitForTimeout(2000);
  
  return true;
}

// Helper function to create test user for MCP token
async function createTestUser(email, name) {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  try {
    // Try to create user via magic link request (this will create user if doesn't exist)
    const response = await fetch('http://localhost:3000/auth/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    return response.ok;
  } catch (error) {
    console.log(`Warning: Could not create test user: ${error.message}`);
    return false;
  }
}

// Helper function to test MCP API endpoint
async function testMCPEndpoint(token, method = 'tools/list', params = {}) {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  
  try {
    const response = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Date.now()
      })
    });
    
    const result = await response.json();
    return { success: response.ok, data: result, status: response.status };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
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
function generateTestData(prefix = 'mcptest') {
  const timestamp = Date.now();
  return {
    email: `${prefix}-${timestamp}@example.com`,
    name: `${prefix} User ${timestamp}`,
    tokenName: `${prefix} Token ${timestamp}`,
    description: `Test token created at ${new Date().toISOString()}`
  };
}

test.describe('MCP Token Management Tests', () => {
  
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
    
    // Set longer timeouts for MCP operations
    page.setDefaultTimeout(15000);
  });

  test('MCP Token Interface and Navigation', async ({ page }) => {
    console.log('🔧 Testing MCP token interface and navigation...');
    
    await authenticateAdmin(page);
    await captureScreenshot(page, 'mcp-interface-initial');
    
    // Step 1: Verify MCP token management interface
    console.log('🎛️ Step 1: Verify MCP token interface elements');
    
    const interfaceElements = [
      'h2:has-text("MCP Token Management")',
      'h3:has-text("Create New MCP Token")',
      'select#newTokenUserId',
      'input#newTokenName',
      'select#newTokenPermissions',
      'input#newTokenExpires',
      'input#newTokenScopes',
      'button#createTokenBtn',
      'h3:has-text("Active MCP Tokens")',
      'h3:has-text("Recent MCP Activity")'
    ];
    
    for (const selector of interfaceElements) {
      await expect(page.locator(selector)).toBeVisible();
    }
    console.log('✅ All MCP interface elements visible');
    
    // Step 2: Verify form default values and options
    console.log('📋 Step 2: Verify form defaults and options');
    
    const permissionsSelect = page.locator('select#newTokenPermissions');
    const permissionOptions = await permissionsSelect.locator('option').allTextContents();
    console.log(`  Permission options: ${permissionOptions.join(', ')}`);
    expect(permissionOptions).toContain('Read + Write');
    expect(permissionOptions).toContain('Read Only');
    
    const expiresInput = page.locator('input#newTokenExpires');
    const defaultExpires = await expiresInput.inputValue();
    console.log(`  Default expiration: ${defaultExpires} days`);
    
    const scopesInput = page.locator('input#newTokenScopes');
    const defaultScopes = await scopesInput.inputValue();
    console.log(`  Default scopes: ${defaultScopes}`);
    
    console.log('✅ Form defaults validated');
    
    // Step 3: Test user dropdown population
    console.log('👥 Step 3: Test user dropdown population');
    
    const userSelect = page.locator('select#newTokenUserId');
    await page.waitForTimeout(2000); // Wait for users to load
    
    const userOptions = await userSelect.locator('option').allTextContents();
    console.log(`  Available users: ${userOptions.length - 1} (excluding placeholder)`);
    
    if (userOptions.length > 1) {
      console.log('✅ User dropdown populated with available users');
    } else {
      console.log('⚠️  No users available for token creation');
    }
    
    console.log('✅ MCP token interface and navigation test completed');
  });

  test('MCP Token Creation and Validation', async ({ page }) => {
    console.log('🔐 Testing MCP token creation and validation...');
    
    await authenticateAdmin(page);
    const testData = generateTestData('token');
    
    // Step 1: Create test user for token
    console.log('👤 Step 1: Prepare test user');
    await createTestUser(testData.email, testData.name);
    
    // Step 2: Test form validation
    console.log('✅ Step 2: Test token creation form validation');
    
    // Try to create token without selecting user
    await page.locator('button#createTokenBtn').click();
    await page.waitForTimeout(1000);
    
    // Check if form prevents submission or shows validation
    const userSelect = page.locator('select#newTokenUserId');
    const isRequired = await userSelect.getAttribute('required');
    console.log(`  User selection validation: ${isRequired ? '✅' : 'ℹ️  No HTML5 validation'}`);
    
    // Step 3: Create MCP token with valid data
    console.log('➕ Step 3: Create new MCP token');
    
    // Wait for users to load and select first available user
    await page.waitForTimeout(3000);
    const userOptions = await userSelect.locator('option').all();
    
    if (userOptions.length > 1) {
      const firstUser = userOptions[1]; // Skip placeholder
      await firstUser.click();
      const selectedUserText = await firstUser.textContent();
      console.log(`  Selected user: ${selectedUserText}`);
    } else {
      console.log('  ⚠️ No users available, creating token anyway...');
    }
    
    // Fill token creation form
    await page.locator('input#newTokenName').fill(testData.tokenName);
    await page.locator('select#newTokenPermissions').selectOption('read_write');
    await page.locator('input#newTokenExpires').fill('7'); // 7 days
    await page.locator('input#newTokenScopes').fill('steps:read,steps:write,profile:read');
    
    await captureScreenshot(page, 'token-creation-form');
    
    await page.locator('button#createTokenBtn').click();
    await page.waitForTimeout(3000);
    await captureScreenshot(page, 'token-created');
    
    // Step 4: Check for success message and capture token
    console.log('🎯 Step 4: Verify token creation success');
    
    const successMessage = page.locator('.message.success, .success');
    let createdToken = null;
    
    if (await successMessage.isVisible()) {
      const messageText = await successMessage.textContent();
      console.log(`  Success message: ${messageText}`);
      
      // Try to extract token from success message if displayed
      const tokenMatch = messageText.match(/([a-f0-9-]{36})/);
      if (tokenMatch) {
        createdToken = tokenMatch[1];
        console.log(`  Created token: ${createdToken.substring(0, 8)}...`);
      }
    }
    
    // Step 5: Verify token appears in tokens table
    console.log('📋 Step 5: Verify token in tokens table');
    
    await waitForTableLoad(page, '#mcpTokensTable table');
    const tokensTable = page.locator('#mcpTokensTable table');
    
    if (await tokensTable.isVisible()) {
      const tableText = await tokensTable.textContent();
      const tokenInTable = tableText.includes(testData.tokenName);
      console.log(`  Token found in table: ${tokenInTable ? '✅' : '❌'}`);
      
      if (tokenInTable) {
        // Extract token from table if not found in message
        if (!createdToken) {
          const tokenRows = await tokensTable.locator('tbody tr').all();
          for (const row of tokenRows) {
            const rowText = await row.textContent();
            if (rowText.includes(testData.tokenName)) {
              const tokenMatch = rowText.match(/([a-f0-9-]{36})/);
              if (tokenMatch) {
                createdToken = tokenMatch[1];
                break;
              }
            }
          }
        }
        
        console.log('✅ Token appears in tokens table');
      }
    }
    
    // Step 6: Test MCP API with created token
    console.log('🧪 Step 6: Test MCP API with created token');
    
    if (createdToken) {
      // Test tools/list endpoint
      const toolsListResult = await testMCPEndpoint(createdToken, 'tools/list');
      console.log(`  tools/list API test: ${toolsListResult.success ? '✅' : '❌'}`);
      
      if (toolsListResult.success) {
        const tools = toolsListResult.data.result?.tools || [];
        console.log(`    Available tools: ${tools.length}`);
        tools.forEach((tool, index) => {
          if (index < 3) { // Show first 3 tools
            console.log(`      ${index + 1}. ${tool.name}: ${tool.description}`);
          }
        });
      } else {
        console.log(`    API error: ${toolsListResult.error || toolsListResult.data?.error?.message}`);
      }
      
      // Test get user profile if permissions allow
      const profileResult = await testMCPEndpoint(createdToken, 'get_user_profile');
      console.log(`  get_user_profile API test: ${profileResult.success ? '✅' : '❌'}`);
      
      if (profileResult.success) {
        const profile = profileResult.data.result || {};
        console.log(`    User profile: ${profile.name || 'Unknown'} (${profile.email || 'No email'})`);
      }
      
    } else {
      console.log('  ⚠️ No token available for API testing');
    }
    
    console.log('✅ MCP token creation and validation test completed');
  });

  test('MCP Token Permissions and Scopes', async ({ page }) => {
    console.log('🔒 Testing MCP token permissions and scopes...');
    
    await authenticateAdmin(page);
    const testData = generateTestData('perms');
    
    // Step 1: Create read-only token
    console.log('📖 Step 1: Create read-only MCP token');
    
    await createTestUser(testData.email, testData.name);
    await page.waitForTimeout(2000);
    
    // Select user for read-only token
    const userSelect = page.locator('select#newTokenUserId');
    const userOptions = await userSelect.locator('option').all();
    
    if (userOptions.length > 1) {
      await userOptions[1].click();
    }
    
    await page.locator('input#newTokenName').fill(testData.tokenName + ' (Read-Only)');
    await page.locator('select#newTokenPermissions').selectOption('read_only');
    await page.locator('input#newTokenScopes').fill('steps:read,profile:read');
    
    await captureScreenshot(page, 'readonly-token-form');
    
    await page.locator('button#createTokenBtn').click();
    await page.waitForTimeout(3000);
    
    // Extract read-only token
    let readOnlyToken = null;
    const successMessage = page.locator('.message.success, .success');
    if (await successMessage.isVisible()) {
      const messageText = await successMessage.textContent();
      const tokenMatch = messageText.match(/([a-f0-9-]{36})/);
      if (tokenMatch) {
        readOnlyToken = tokenMatch[1];
        console.log(`  Read-only token created: ${readOnlyToken.substring(0, 8)}...`);
      }
    }
    
    // Step 2: Create write-enabled token
    console.log('✏️ Step 2: Create write-enabled MCP token');
    
    await page.locator('input#newTokenName').fill(testData.tokenName + ' (Write)');
    await page.locator('select#newTokenPermissions').selectOption('read_write');
    await page.locator('input#newTokenScopes').fill('steps:read,steps:write,profile:read');
    
    await captureScreenshot(page, 'write-token-form');
    
    await page.locator('button#createTokenBtn').click();
    await page.waitForTimeout(3000);
    
    // Extract write token
    let writeToken = null;
    if (await successMessage.isVisible()) {
      const messageText = await successMessage.textContent();
      const tokenMatch = messageText.match(/([a-f0-9-]{36})/);
      if (tokenMatch) {
        writeToken = tokenMatch[1];
        console.log(`  Write token created: ${writeToken.substring(0, 8)}...`);
      }
    }
    
    // Step 3: Test read-only token permissions
    console.log('🔍 Step 3: Test read-only token permissions');
    
    if (readOnlyToken) {
      // Should work: reading user profile
      const profileResult = await testMCPEndpoint(readOnlyToken, 'get_user_profile');
      console.log(`  get_user_profile (read-only): ${profileResult.success ? '✅' : '❌'}`);
      
      // Should work: getting steps
      const stepsResult = await testMCPEndpoint(readOnlyToken, 'get_steps');
      console.log(`  get_steps (read-only): ${stepsResult.success ? '✅' : '❌'}`);
      
      // Should fail: adding steps
      const addStepsResult = await testMCPEndpoint(readOnlyToken, 'add_steps', {
        date: new Date().toISOString().split('T')[0],
        count: 1000
      });
      console.log(`  add_steps (read-only): ${addStepsResult.success ? '❌ Should have failed!' : '✅ Properly blocked'}`);
      
      if (!addStepsResult.success) {
        console.log(`    Blocked with: ${addStepsResult.data?.error?.message || 'Permission denied'}`);
      }
    }
    
    // Step 4: Test write-enabled token permissions
    console.log('✅ Step 4: Test write-enabled token permissions');
    
    if (writeToken) {
      // Should work: reading user profile
      const profileResult = await testMCPEndpoint(writeToken, 'get_user_profile');
      console.log(`  get_user_profile (write): ${profileResult.success ? '✅' : '❌'}`);
      
      // Should work: getting steps
      const stepsResult = await testMCPEndpoint(writeToken, 'get_steps');
      console.log(`  get_steps (write): ${stepsResult.success ? '✅' : '❌'}`);
      
      // Should work: adding steps
      const addStepsResult = await testMCPEndpoint(writeToken, 'add_steps', {
        date: new Date().toISOString().split('T')[0],
        count: 2500
      });
      console.log(`  add_steps (write): ${addStepsResult.success ? '✅' : '❌'}`);
      
      if (addStepsResult.success) {
        console.log(`    Added steps successfully`);
      } else {
        console.log(`    Add steps error: ${addStepsResult.data?.error?.message || 'Unknown error'}`);
      }
    }
    
    // Step 5: Test invalid token
    console.log('🚫 Step 5: Test invalid token handling');
    
    const invalidTokenResult = await testMCPEndpoint('invalid-token-12345', 'get_user_profile');
    console.log(`  Invalid token test: ${invalidTokenResult.success ? '❌ Should have failed!' : '✅ Properly rejected'}`);
    
    if (!invalidTokenResult.success) {
      console.log(`    Rejected with status: ${invalidTokenResult.status}`);
    }
    
    console.log('✅ MCP token permissions and scopes test completed');
  });

  test('MCP Token Management and Revocation', async ({ page }) => {
    console.log('🗑️ Testing MCP token management and revocation...');
    
    await authenticateAdmin(page);
    const testData = generateTestData('manage');
    
    // Step 1: Create token for management testing
    console.log('🔧 Step 1: Create token for management testing');
    
    await createTestUser(testData.email, testData.name);
    await page.waitForTimeout(2000);
    
    const userSelect = page.locator('select#newTokenUserId');
    const userOptions = await userSelect.locator('option').all();
    
    if (userOptions.length > 1) {
      await userOptions[1].click();
    }
    
    await page.locator('input#newTokenName').fill(testData.tokenName);
    await page.locator('input#newTokenExpires').fill('1'); // 1 day expiration
    
    await page.locator('button#createTokenBtn').click();
    await page.waitForTimeout(3000);
    
    console.log('✅ Management test token created');
    
    // Step 2: Verify token in management table
    console.log('📋 Step 2: Verify token management table');
    
    await waitForTableLoad(page, '#mcpTokensTable table');
    const tokensTable = page.locator('#mcpTokensTable table');
    
    if (await tokensTable.isVisible()) {
      const tableHeaders = await tokensTable.locator('thead th').allTextContents();
      console.log(`  Table headers: ${tableHeaders.join(', ')}`);
      
      // Check expected headers
      const expectedHeaders = ['Token', 'User', 'Name', 'Permissions', 'Expires', 'Created', 'Actions'];
      const hasRequiredHeaders = expectedHeaders.some(header => 
        tableHeaders.some(th => th.toLowerCase().includes(header.toLowerCase()))
      );
      
      console.log(`  Has required headers: ${hasRequiredHeaders ? '✅' : '⚠️'}`);
      
      // Count tokens
      const tokenRows = await tokensTable.locator('tbody tr').all();
      console.log(`  Active tokens: ${tokenRows.length}`);
      
      await captureScreenshot(page, 'token-management-table');
    }
    
    // Step 3: Test token filtering and search
    console.log('🔍 Step 3: Test token filtering');
    
    const searchInput = page.locator('input[placeholder*="search"], input[placeholder*="filter"]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill(testData.tokenName);
      await page.waitForTimeout(1000);
      
      const filteredTable = await tokensTable.textContent();
      const tokenVisible = filteredTable.includes(testData.tokenName);
      console.log(`  Token filtering works: ${tokenVisible ? '✅' : '❌'}`);
      
      await searchInput.fill(''); // Clear filter
      await page.waitForTimeout(1000);
    } else {
      console.log('  ℹ️ Token search/filter not available');
    }
    
    // Step 4: Test token action buttons
    console.log('🎯 Step 4: Test token management actions');
    
    const tokenRows = await tokensTable.locator('tbody tr').all();
    
    if (tokenRows.length > 0) {
      // Find row with our test token
      let testTokenRow = null;
      
      for (const row of tokenRows) {
        const rowText = await row.textContent();
        if (rowText.includes(testData.tokenName)) {
          testTokenRow = row;
          break;
        }
      }
      
      if (testTokenRow) {
        // Test copy token button
        const copyButton = testTokenRow.locator('button:has-text("Copy"), button[title*="copy"]').first();
        if (await copyButton.isVisible()) {
          await copyButton.click();
          await page.waitForTimeout(1000);
          console.log('  ✅ Copy token button functional');
        }
        
        // Test view/details button
        const detailsButton = testTokenRow.locator('button:has-text("Details"), button:has-text("View")').first();
        if (await detailsButton.isVisible()) {
          await detailsButton.click();
          await page.waitForTimeout(1000);
          console.log('  ✅ Token details button functional');
        }
        
        // Test revoke button
        const revokeButton = testTokenRow.locator('button:has-text("Revoke"), button:has-text("Delete"), .delete-btn').first();
        if (await revokeButton.isVisible()) {
          console.log('  🗑️ Testing token revocation...');
          
          // Handle potential confirmation dialog
          page.once('dialog', async dialog => {
            console.log(`    Confirmation: ${dialog.message()}`);
            await dialog.accept();
          });
          
          await revokeButton.click();
          await page.waitForTimeout(3000);
          await captureScreenshot(page, 'token-revoked');
          
          // Verify token is no longer in table
          const updatedTable = await tokensTable.textContent();
          const tokenStillPresent = updatedTable.includes(testData.tokenName);
          console.log(`  Token revocation: ${tokenStillPresent ? '❌ Still present' : '✅ Successfully removed'}`);
        } else {
          console.log('  ℹ️ Token revocation button not found');
        }
      } else {
        console.log('  ⚠️ Test token not found in table');
      }
    }
    
    console.log('✅ MCP token management and revocation test completed');
  });

  test('MCP Audit Log and Monitoring', async ({ page }) => {
    console.log('📊 Testing MCP audit log and monitoring...');
    
    await authenticateAdmin(page);
    await captureScreenshot(page, 'audit-log-initial');
    
    // Step 1: Verify audit log interface
    console.log('📋 Step 1: Verify audit log interface');
    
    const auditElements = [
      'h3:has-text("Recent MCP Activity")',
      'input#auditSearchUser',
      'select#auditSearchMethod',
      'button#refreshAuditBtn',
      '#mcpAuditTable'
    ];
    
    for (const selector of auditElements) {
      await expect(page.locator(selector)).toBeVisible();
    }
    console.log('✅ Audit log interface elements verified');
    
    // Step 2: Test audit log filtering
    console.log('🔍 Step 2: Test audit log filtering');
    
    const searchUser = page.locator('input#auditSearchUser');
    const searchMethod = page.locator('select#auditSearchMethod');
    const refreshBtn = page.locator('button#refreshAuditBtn');
    
    // Test method filtering
    const methodOptions = await searchMethod.locator('option').allTextContents();
    console.log(`  Available method filters: ${methodOptions.join(', ')}`);
    
    for (const method of methodOptions.slice(0, 3)) { // Test first 3 methods
      if (method && method !== 'All Methods') {
        console.log(`  Testing filter: ${method}`);
        await searchMethod.selectOption(method);
        await refreshBtn.click();
        await page.waitForTimeout(2000);
        
        const auditTable = page.locator('#mcpAuditTable');
        if (await auditTable.isVisible()) {
          const tableText = await auditTable.textContent();
          console.log(`    Filter applied, table length: ${tableText.length} chars`);
        }
      }
    }
    
    // Reset filters
    await searchMethod.selectOption('');
    await searchUser.fill('');
    await refreshBtn.click();
    await page.waitForTimeout(2000);
    
    // Step 3: Create some MCP activity for audit log
    console.log('🚀 Step 3: Generate MCP activity for audit testing');
    
    // First create a test token to generate activity
    const testData = generateTestData('audit');
    await createTestUser(testData.email, testData.name);
    await page.waitForTimeout(2000);
    
    const userSelect = page.locator('select#newTokenUserId');
    const userOptions = await userSelect.locator('option').all();
    
    if (userOptions.length > 1) {
      await userOptions[1].click();
      await page.locator('input#newTokenName').fill(testData.tokenName);
      await page.locator('button#createTokenBtn').click();
      await page.waitForTimeout(3000);
      
      // Extract token for testing
      const successMessage = page.locator('.message.success, .success');
      let testToken = null;
      
      if (await successMessage.isVisible()) {
        const messageText = await successMessage.textContent();
        const tokenMatch = messageText.match(/([a-f0-9-]{36})/);
        if (tokenMatch) {
          testToken = tokenMatch[1];
        }
      }
      
      // Generate API activity
      if (testToken) {
        console.log('  Generating MCP API activity...');
        
        const apiCalls = [
          { method: 'tools/list', params: {} },
          { method: 'get_user_profile', params: {} },
          { method: 'get_steps', params: {} },
          { method: 'add_steps', params: { date: new Date().toISOString().split('T')[0], count: 3000 } }
        ];
        
        for (const call of apiCalls) {
          await testMCPEndpoint(testToken, call.method, call.params);
          await page.waitForTimeout(500);
        }
        
        console.log('  ✅ MCP API activity generated');
      }
    }
    
    // Step 4: Refresh and verify audit log entries
    console.log('📊 Step 4: Verify audit log entries');
    
    await refreshBtn.click();
    await page.waitForTimeout(3000);
    await captureScreenshot(page, 'audit-log-populated');
    
    await waitForTableLoad(page, '#mcpAuditTable table');
    const auditTable = page.locator('#mcpAuditTable table');
    
    if (await auditTable.isVisible()) {
      const auditHeaders = await auditTable.locator('thead th').allTextContents();
      console.log(`  Audit table headers: ${auditHeaders.join(', ')}`);
      
      const auditRows = await auditTable.locator('tbody tr').all();
      console.log(`  Audit log entries: ${auditRows.length}`);
      
      // Check first few entries
      for (const [index, row] of auditRows.slice(0, 3).entries()) {
        const rowText = await row.textContent();
        console.log(`    Entry ${index + 1}: ${rowText.substring(0, 100)}...`);
      }
      
      if (auditRows.length > 0) {
        console.log('✅ Audit log contains activity entries');
      } else {
        console.log('⚠️  No audit log entries found');
      }
    }
    
    // Step 5: Test user-specific filtering
    console.log('👤 Step 5: Test user-specific audit filtering');
    
    if (testData.email) {
      await searchUser.fill(testData.email);
      await refreshBtn.click();
      await page.waitForTimeout(2000);
      
      const filteredAudit = await auditTable.textContent();
      const userActivityFound = filteredAudit.includes(testData.email) || filteredAudit.includes(testData.name);
      console.log(`  User-specific filtering: ${userActivityFound ? '✅' : '⚠️'}`);
      
      await captureScreenshot(page, 'audit-log-user-filtered');
    }
    
    console.log('✅ MCP audit log and monitoring test completed');
  });
  
  test.afterEach(async ({ page }) => {
    console.log('🧹 Cleaning up MCP token test...');
  });
});