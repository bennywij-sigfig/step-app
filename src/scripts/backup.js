#!/usr/bin/env node

/**
 * Database Backup Utility
 * 
 * This script can be run locally or in production to create backups
 * Usage:
 *   node scripts/backup.js                    # Create application backup
 *   node scripts/backup.js --volume-snapshot  # Create volume snapshot
 *   node scripts/backup.js --cleanup          # Cleanup old backups
 */

const { execSync } = require('child_process');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function error(message) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
}

async function createApplicationBackup() {
  try {
    log('🛡️ Creating application-level database backup...');
    
    // For production, run via SSH
    if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) {
      // Use a simpler SSH command approach to avoid quote escaping issues
      const command = 'fly ssh console --command "node -e \\"const db = require(\'./src/database.js\'); db.utils.createBackup().then(r => { console.log(\'✅ Backup created:\', r.path); console.log(\'📊 Size:\', r.size, \'bytes\'); process.exit(0); }).catch(e => { console.error(\'❌ Backup failed:\', e.message); process.exit(1); })\\"';
      execSync(command, { stdio: 'inherit' });
    } else {
      // For local development
      const db = require('../database.js');
      const result = await db.utils.createBackup();
      log(`✅ Local backup created: ${result.path}`);
      log(`📊 Size: ${result.size} bytes`);
    }
  } catch (err) {
    error(`Application backup failed: ${err.message}`);
    process.exit(1);
  }
}

async function createVolumeSnapshot() {
  try {
    log('📸 Creating Fly.io volume snapshot...');
    
    // Get the current volume ID
    const volumesOutput = execSync('fly volumes list --json', { encoding: 'utf8' });
    const volumes = JSON.parse(volumesOutput);
    const dataVolume = volumes.find(v => v.name === 'data' && v.attached_machine_id);
    
    if (!dataVolume) {
      throw new Error('No attached data volume found');
    }
    
    log(`📋 Found volume: ${dataVolume.id} (attached to ${dataVolume.attached_machine_id})`);
    
    // Create snapshot
    const snapshotCommand = `fly volumes snapshots create ${dataVolume.id}`;
    execSync(snapshotCommand, { stdio: 'inherit' });
    
    log('✅ Volume snapshot created successfully');
  } catch (err) {
    error(`Volume snapshot failed: ${err.message}`);
    process.exit(1);
  }
}

async function cleanupOldBackups() {
  try {
    log('🧹 Cleaning up old backups...');
    
    if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) {
      // Use a simpler SSH command approach to avoid quote escaping issues
      const command = 'fly ssh console --command "node -e \\"const db = require(\'./src/database.js\'); db.utils.cleanupOldBackups(10).then(r => { console.log(\'🗑️ Cleaned:\', r.cleaned, \'backups\'); console.log(\'📁 Kept:\', r.kept, \'backups\'); process.exit(0); }).catch(e => { console.error(\'❌ Cleanup failed:\', e.message); process.exit(1); })\\"';
      execSync(command, { stdio: 'inherit' });
    } else {
      const db = require('../database.js');
      const result = await db.utils.cleanupOldBackups(5); // Keep fewer for local
      log(`🗑️ Cleaned: ${result.cleaned} backups`);
      log(`📁 Kept: ${result.kept} backups`);
    }
  } catch (err) {
    error(`Cleanup failed: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Database Backup Utility

Usage:
  node scripts/backup.js [options]

Options:
  --volume-snapshot     Create Fly.io volume snapshot
  --cleanup            Clean up old application backups
  --production         Force production mode (use SSH)
  --help, -h           Show this help

Default: Creates application-level backup
    `);
    process.exit(0);
  }

  try {
    if (args.includes('--volume-snapshot')) {
      await createVolumeSnapshot();
    } else if (args.includes('--cleanup')) {
      await cleanupOldBackups();
    } else {
      // Default: create application backup
      await createApplicationBackup();
    }
    
    log('🎉 Backup operation completed successfully');
  } catch (err) {
    error(`Backup operation failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createApplicationBackup, createVolumeSnapshot, cleanupOldBackups };