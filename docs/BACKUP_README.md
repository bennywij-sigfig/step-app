# 🛡️ Database Backup Strategy

This document outlines the comprehensive backup strategy for the Step Challenge App's SQLite database.

## 🎯 Backup Architecture

### **Dual-Layer Protection:**
1. **Fly.io Volume Snapshots** - Infrastructure-level backups
2. **Application-Level Backups** - SQLite-specific backups using `.backup()` API

## 📋 Backup Components  

### **1. Fly.io Volume Snapshots**
- **Automatic**: Daily snapshots with 30-day retention
- **On-demand**: Created before each deployment
- **Location**: Fly.io infrastructure (block-level)
- **Access**: Via `fly volumes snapshots` commands

### **2. Application-Level Backups**
- **Method**: SQLite `.backup()` API (WAL-compatible)
- **Location**: `/data/backups/` directory on volume
- **Retention**: 10 backups (configurable)
- **Format**: Complete SQLite database files

## 🚀 Usage

### **Manual Backup Commands:**
```bash
# Create application backup
npm run backup

# Create volume snapshot  
npm run backup:volume

# Clean up old backups
npm run backup:cleanup
```

### **Deployment with Backup:**
```bash
# Safe deployment (includes pre-deployment backup)
npm run deploy

# Emergency deployment (skip backup)
npm run deploy:skip-backup
```

### **Production Backup Commands:**
```bash
# Create backup via SSH
node src/scripts/backup.js --production

# Create volume snapshot
fly volumes snapshots create vol_rny0lp9ye2nkzz84

# List available snapshots
fly volumes snapshots list vol_rny0lp9ye2nkzz84
```

## 🔄 Restore Procedures

### **From Application Backup:**
```bash
# 1. Access production machine
fly ssh console

# 2. List available backups
ls -la /data/backups/

# 3. Stop application (if needed)
# (Application handles this gracefully)

# 4. Restore database
cp /data/backups/steps-YYYY-MM-DDTHH-MM-SS.db /data/steps.db

# 5. Restart application
# (Automatic via health checks)
```

### **From Volume Snapshot:**
```bash
# 1. Create new volume from snapshot
fly volumes create data_restored --snapshot-id snap_xxxxx --size 1GB

# 2. Scale down current machine
fly scale count 0

# 3. Update machine to use restored volume
# (Complex - see Fly.io docs for volume attachment)

# 4. Scale back up
fly scale count 1
```

## 📊 Monitoring

### **Health Endpoint Backup Status:**
```bash
curl https://step-app-4x-yhw.fly.dev/health | jq .backup
```

**Response includes:**
- `hasBackups`: Boolean indicating backup availability
- `count`: Number of available backups
- `latest.name`: Most recent backup filename
- `latest.created`: Backup creation timestamp
- `latest.age`: Age in milliseconds

### **Manual Backup Status Check:**
```bash
# Via SSH
fly ssh console
ls -la /data/backups/

# Via script
node src/scripts/backup.js --cleanup --production
```

## 🕒 Backup Schedule

### **Automatic Backups:**
- **Volume Snapshots**: Daily (Fly.io managed)
- **Application Backups**: Before each deployment only

### **Recommended Manual Schedule:**
- **Weekly**: Create manual application backup
- **Before major changes**: Manual volume snapshot
- **Monthly**: Test restore procedure

## 🚨 Emergency Procedures

### **Data Corruption:**
1. **Immediate**: Stop accepting writes (scale to 0)
2. **Assess**: Check latest backup via health endpoint
3. **Restore**: Use most recent application backup
4. **Verify**: Test database integrity
5. **Resume**: Scale back to 1 machine

### **Volume Failure:**
1. **Create new volume** from latest snapshot
2. **Attach to new machine** (requires downtime)
3. **Verify data integrity** via health checks
4. **Resume normal operations**

## ⚙️ Configuration

### **Backup Retention:**
- **Volume snapshots**: 30 days (configured in fly.toml)
- **Application backups**: 10 files (configurable in backup.js)

### **Backup Locations:**
- **Volume snapshots**: Fly.io infrastructure 
- **Application backups**: `/data/backups/` on volume
- **Both locations** are included in volume snapshots

## 🧪 Testing

### **Test Backup Creation:**
```bash
# Local testing
npm run backup

# Production testing  
npm run backup:volume
```

### **Test Restore Process:**
```bash
# Create test backup
npm run backup

# Verify backup integrity (manual check)
fly ssh console
sqlite3 /data/backups/steps-*.db "PRAGMA integrity_check;"
```

## 📈 Monitoring Best Practices

1. **Daily**: Check health endpoint backup status
2. **Weekly**: Verify backup creation is working
3. **Monthly**: Test full restore procedure
4. **Before deployments**: Ensure pre-deployment backup succeeds

## 🔗 Related Documentation

- [Fly.io Volumes](https://fly.io/docs/volumes/)
- [Volume Snapshots](https://fly.io/docs/volumes/snapshots/)
- [SQLite Backup API](https://www.sqlite.org/backup.html)

---

*Last updated: July 24, 2025*