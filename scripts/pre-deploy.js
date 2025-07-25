#!/usr/bin/env node

/**
 * Pre-Deployment Backup Script
 * 
 * Automatically creates backups before deployment to prevent data loss
 * Called by: npm run deploy
 */

const { execSync } = require('child_process');
const path = require('path');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function error(message) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
}

async function preDeployBackup() {
  log('🚀 Starting pre-deployment backup process...');
  
  try {
    // Step 1: Create volume snapshot
    log('📸 Creating volume snapshot...');
    const volumesOutput = execSync('fly volumes list --json', { encoding: 'utf8' });
    const volumes = JSON.parse(volumesOutput);
    const dataVolume = volumes.find(v => v.name === 'data' && v.attached_machine_id);
    
    if (dataVolume) {
      execSync(`fly volumes snapshots create ${dataVolume.id}`, { stdio: 'inherit' });
      log('✅ Volume snapshot created');
    } else {
      log('⚠️ No attached data volume found, skipping volume snapshot');
    }
    
    // Step 2: Create application-level backup
    log('🛡️ Creating application backup...');
    const backupScript = path.join(__dirname, 'backup.js');
    execSync(`node "${backupScript}" --production`, { stdio: 'inherit' });
    log('✅ Application backup created');
    
    // Step 3: Clean up old backups
    log('🧹 Cleaning up old backups...');
    execSync(`node "${backupScript}" --cleanup --production`, { stdio: 'inherit' });
    log('✅ Old backups cleaned up');
    
    log('🎉 Pre-deployment backup completed successfully');
    
  } catch (err) {
    error(`Pre-deployment backup failed: ${err.message}`);
    error('❌ DEPLOYMENT ABORTED - Fix backup issues before deploying');
    process.exit(1);
  }
}

// Only run if called directly (not imported)
if (require.main === module) {
  preDeployBackup();
}

module.exports = { preDeployBackup };