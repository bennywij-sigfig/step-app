// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e/cross-browser',
  testMatch: ['trotter-viewport-regression.test.js'],
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'PORT=3100 npm start',
    url: 'http://localhost:3100/health',
    reuseExistingServer: true,
    timeout: 30000
  }
});
