/**
 * Global Test Teardown
 * 
 * Cleanup operations that run after all tests complete:
 * - Clean up test screenshots and artifacts
 * - Clear test databases
 * - Reset browser state
 * - Generate test reports
 */

const fs = require('fs');
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Running global test teardown...');
  
  try {
    // Clean up old screenshots (older than 24 hours)
    const screenshotsDir = path.join(__dirname, '..', 'user-journeys', 'screenshots');
    if (fs.existsSync(screenshotsDir)) {
      await cleanupOldScreenshots(screenshotsDir, 24 * 60 * 60 * 1000); // 24 hours
    }
    
    // Clean up test databases
    const testDbDir = path.join(__dirname, '..', '..', 'test-databases');
    if (fs.existsSync(testDbDir)) {
      await cleanupOldFiles(testDbDir, '.db', 1 * 60 * 60 * 1000); // 1 hour
    }
    
    console.log('✅ Global teardown completed successfully');
  } catch (error) {
    console.log(`⚠️  Global teardown warning: ${error.message}`);
  }
}

async function cleanupOldScreenshots(dir, maxAge) {
  const files = fs.readdirSync(dir, { recursive: true });
  let cleaned = 0;
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile() && file.endsWith('.png')) {
        const age = Date.now() - stats.mtime.getTime();
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      // Skip files that can't be accessed
    }
  }
  
  if (cleaned > 0) {
    console.log(`  Cleaned up ${cleaned} old screenshots`);
  }
}

async function cleanupOldFiles(dir, extension, maxAge) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir);
  let cleaned = 0;
  
  for (const file of files) {
    if (file.endsWith(extension)) {
      const filePath = path.join(dir, file);
      
      try {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtime.getTime();
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }
  }
  
  if (cleaned > 0) {
    console.log(`  Cleaned up ${cleaned} old ${extension} files`);
  }
}

module.exports = globalTeardown;