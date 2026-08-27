#!/usr/bin/env node

/**
 * Pre-Deployment Backup Script
 * 
 * Automatically creates backups before deployment to prevent data loss
 * Called by: npm run deploy
 */

const { execSync } = require('child_process');
const path = require('path');
const { createAttachedVolumeSnapshot } = require('./fly-volume-snapshot');

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
    const { volume, snapshot } = await createAttachedVolumeSnapshot();
    log(`✅ Volume snapshot ${snapshot.id} created for attached volume ${volume.name} (${volume.id})`);
    
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