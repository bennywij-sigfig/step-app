// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.test.js'],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    // Desktop Browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        permissions: ['notifications'],
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        permissions: ['notifications'],
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        permissions: ['notifications'],
      },
    },

    // Mobile Browsers
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        permissions: ['notifications'],
      },
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        permissions: ['notifications'],
      },
    },

    // Tablet Browsers
    {
      name: 'tablet-chrome',
      use: {
        ...devices['iPad Pro'],
        permissions: ['notifications'],
      },
    },

    // High DPI Testing
    {
      name: 'high-dpi',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        permissions: ['notifications'],
      },
    },

    // Slow Network Testing
    {
      name: 'slow-network',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        connectionType: 'Slow 3G',
        permissions: ['notifications'],
      },
    },

    // Production Testing Project
    {
      name: 'production',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PRODUCTION_URL || 'https://step-app-4x-yhw.fly.dev',
        viewport: { width: 1280, height: 720 },
        permissions: ['notifications'],
      },
      testMatch: ['e2e/production/**/*.test.js'],
    },
  ],

  webServer: {
    command: 'echo "Server should already be running on localhost:3000"',
    port: 3000,
    reuseExistingServer: true,
    timeout: 10000,
  },

  // Global test configuration
  globalTeardown: require.resolve('./tests/e2e/utils/global-teardown.js'),
});