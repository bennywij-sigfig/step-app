# Step Challenge App - Fly.io Deployment Guide

## Overview
This document provides comprehensive instructions for deploying the Step Challenge App to Fly.io, including setup, configuration, and operational procedures.

> **📍 Current Status:** This app is **already deployed and running** at https://step-app-4x-yhw.fly.dev/ with all environment variables configured as Fly.io secrets (SESSION_SECRET, NODE_ENV, Mailgun credentials). This guide is for reference and future deployments.

## Prerequisites

### 1. Install Fly CLI
```bash
# macOS
brew install flyctl

# Linux/WSL
curl -L https://fly.io/install.sh | sh

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Create Fly.io Account
```bash
fly auth signup  # Create account
# or
fly auth login   # Login to existing account
```

### 3. Environment Setup
- Node.js 18+ installed locally
- Git repository access
- Mailgun account with API key

## Current Deployment Configuration

### App Details
- **App Name**: `step-app-4x-yhw`
- **Primary Region**: `ord` (Chicago)
- **URL**: https://step-app-4x-yhw.fly.dev
- **Machine Type**: 1GB RAM, 1 shared CPU

### Persistent Storage
- **Volume Name**: `data`
- **Size**: 1GB
- **Mount Point**: `/data`
- **Purpose**: SQLite databases (steps.db, sessions.db)

## Step-by-Step Deployment

### 1. Clone and Setup Repository
```bash
git clone <repository-url>
cd step-app-expt
npm install
```

### 2. Initialize Fly App (if deploying fresh)
```bash
# Create new app
fly apps create step-app-new-name

# Or use existing configuration
fly deploy
```

### 3. Create Persistent Volume
```bash
# Create volume for database persistence
fly volumes create data --region ord --size 1
```

### 4. Configure Environment Variables
```bash
# Generate a secure session secret (run this locally first)
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# Set production environment variables
fly secrets set NODE_ENV=production
fly secrets set SESSION_SECRET="your-64-character-hex-string-from-above"
fly secrets set MAILGUN_API_KEY="your-mailgun-api-key"
fly secrets set MAILGUN_DOMAIN="your-domain.com"
fly secrets set FROM_EMAIL="noreply@your-domain.com"

# Verify secrets are set
fly secrets list
```

### 5. Deploy Application
```bash
fly deploy
```

### 6. Verify Deployment
```bash
# Check app status
fly status

# View logs
fly logs

# Open in browser
fly open
```

## Configuration Files Deep Dive

### fly.toml Configuration
```toml
app = 'step-app-4x-yhw'
primary_region = 'ord'

[build]
# Uses Dockerfile if present, otherwise Node.js buildpack

[[mounts]]
  source = 'data'           # Volume name
  destination = '/data'     # Mount path in container

[http_service]
  internal_port = 3000      # App listening port
  force_https = true        # Redirect HTTP to HTTPS
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1  # Always keep 1 machine running

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

### Database Configuration
- **SQLite Location**: `/data/steps.db` (production), `./steps.db` (development)
- **Session Store**: `/data/sessions.db` (production), `./sessions.db` (development)
- **Persistence**: Achieved via mounted volume at `/data`

### Security Configuration
- **Proxy Trust**: Enabled for Fly.io (`app.set('trust proxy', 1)`)
- **Secure Cookies**: Enabled in production with HTTPS
- **Session Security**: 24-hour expiry, httpOnly, sameSite: 'lax'

## Environment Variables Reference

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `SESSION_SECRET` | Yes | Session encryption | Random 32+ char string |
| `MAILGUN_API_KEY` | Yes | Email service | `key-abc123...` |
| `MAILGUN_DOMAIN` | Yes | Email domain | `your-company.com` |
| `FROM_EMAIL` | Yes | Sender email | `noreply@your-company.com` |
| `PORT` | No | Server port | `3000` (default) |

## Operational Procedures

### Updating the Application

#### 1. Standard Deployment
```bash
# Deploy current code
fly deploy

# Deploy with custom image tag
fly deploy --image-label "v2.1.0"
```

#### 2. Zero-Downtime Deployment
```bash
# Create new machine, then swap
fly deploy --strategy=rolling
```

### Rolling Back Deployments

#### 1. List Recent Releases
```bash
fly releases
```

#### 2. Rollback to Previous Version
```bash
# Rollback to previous release
fly releases rollback

# Rollback to specific version
fly releases rollback --version 14
```

### Scaling Operations

#### 1. Vertical Scaling (Machine Resources)
```bash
# Update fly.toml and redeploy
fly deploy

# Or scale directly
fly scale memory 2048  # 2GB RAM
fly scale count 2      # 2 machines
```

#### 2. Horizontal Scaling (Multiple Machines)
```bash
# Add more machines in same region
fly scale count 2

# Add machines in different regions
fly scale count 1 --region ord
fly scale count 1 --region dfw
```

### Database Management

#### 1. Database Backup
```bash
# SSH into machine
fly ssh console

# Backup database
cd /data
cp steps.db steps-backup-$(date +%Y%m%d).db
cp sessions.db sessions-backup-$(date +%Y%m%d).db
```

#### 2. Database Access
```bash
# Access via SSH
fly ssh console

# Navigate to data directory
cd /data

# Open SQLite
sqlite3 steps.db
```

#### 3. Volume Management
```bash
# List volumes
fly volumes list

# Extend volume size
fly volumes extend <volume_id> --size 2

# Create snapshot
fly volumes snapshots create <volume_id>
```

### Monitoring and Logging

#### 1. View Logs
```bash
# Real-time logs
fly logs

# Historical logs (last 100 lines)
fly logs -n

# Filter by machine
fly logs --machine <machine_id>
```

#### 2. Machine Health
```bash
# Check status
fly status

# Machine details
fly machine list

# SSH access for debugging
fly ssh console
```

#### 3. Metrics Dashboard
- Visit: https://fly.io/apps/step-app-4x-yhw/monitoring
- Monitor CPU, memory, request volume
- Set up alerts for anomalies

## Troubleshooting Guide

### Common Issues

#### 1. App Won't Start
```bash
# Check logs for errors
fly logs

# Common causes:
# - Missing environment variables
# - Database connection issues
# - Port binding problems
```

#### 2. Database Connection Errors
```bash
# Verify volume is mounted
fly ssh console
ls -la /data/

# Check database permissions
cd /data
sqlite3 steps.db ".tables"
```

#### 3. Session Issues
```bash
# Clear session database
fly ssh console
cd /data
rm sessions.db
# App will recreate on restart
```

#### 4. SSL/HTTPS Problems
```bash
# Verify force_https setting in fly.toml
# Check certificate status
fly certs list
```

### Performance Issues

#### 1. Slow Response Times
- Check machine resources: `fly status`
- Scale up memory: `fly scale memory 2048`
- Add more machines: `fly scale count 2`

#### 2. Database Performance
- SQLite limitations with high concurrency
- Consider PostgreSQL for >200 concurrent users
- Monitor disk I/O on volume

#### 3. Memory Issues
```bash
# Monitor memory usage
fly ssh console
top

# Check for memory leaks in Node.js
node --max-old-space-size=768 server.js
```

## Cost Optimization

### 1. Machine Auto-Scaling
```toml
# In fly.toml
[http_service]
  auto_stop_machines = 'stop'    # Stop when no traffic
  auto_start_machines = true     # Start on demand
  min_machines_running = 0       # Scale to zero
```

### 2. Resource Right-Sizing
- Start with 512MB RAM, scale up as needed
- Use shared CPU for cost savings
- Monitor usage patterns to optimize

### 3. Volume Management
- Start with 1GB, extend only when needed
- Regular cleanup of old backups
- Snapshot important data for cheaper long-term storage

## Security Considerations

### 1. Environment Variables
- Use `fly secrets` for sensitive data
- Never commit secrets to repository
- Rotate secrets regularly

### 2. Network Security
- Fly.io provides DDoS protection
- Use Fly's private networking for multi-app setups
- Consider rate limiting middleware

### 3. Application Security
- Keep dependencies updated: `npm audit`
- Use HTTPS redirects (configured)
- Implement proper session management (configured)

## Testing Deployment

### 1. Pre-Deployment Tests
```bash
# Local testing
npm start
curl http://localhost:3000/api/health

# Environment variable check
node -e "console.log(process.env.SESSION_SECRET ? 'SET' : 'NOT SET')"
```

### 2. Post-Deployment Verification
```bash
# Health check
curl https://step-app-4x-yhw.fly.dev/api/health

# Database connectivity
curl -X POST https://step-app-4x-yhw.fly.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@company.com"}'
```

### 3. Load Testing
```bash
# Simple load test
curl -w "@curl-format.txt" -s -o /dev/null \
  https://step-app-4x-yhw.fly.dev/
```

## Performance Baselines

### Expected Response Times
- **Static files**: <100ms
- **API endpoints**: <300ms
- **Database queries**: <50ms
- **Email sending**: 1-3 seconds

### Resource Usage
- **Memory**: ~100-200MB baseline
- **CPU**: <5% during normal operation
- **Disk**: ~50MB for databases (150 users)

## Backup and Disaster Recovery

### 1. Automated Backups
```bash
# Create volume snapshot
fly volumes snapshots create vol_4qp8owm33l6joydv

# List snapshots
fly volumes snapshots list
```

### 2. Application Backup
```bash
# Export user data
fly ssh console
cd /data
sqlite3 steps.db ".dump" > backup.sql
```

### 3. Disaster Recovery
```bash
# Restore from snapshot
fly volumes create data-restored --from-snapshot snap_xyz
# Update fly.toml to use new volume
fly deploy
```

## Domain and SSL Configuration

### 1. Custom Domain Setup
```bash
# Add custom domain
fly certs create your-domain.com

# Verify DNS
fly certs show your-domain.com
```

### 2. DNS Configuration
```
# Add CNAME record
CNAME your-domain.com step-app-4x-yhw.fly.dev
```

## Maintenance Windows

### 1. Planned Maintenance
```bash
# Scale down before maintenance
fly scale count 0

# Perform maintenance
# ...

# Scale back up
fly scale count 1
```

### 2. Emergency Procedures
```bash
# Quick rollback
fly releases rollback

# Force restart
fly machine restart <machine_id>

# Emergency scale-up
fly scale count 3 --region ord
```

## Development vs Production

### Key Differences
| Aspect | Development | Production |
|--------|-------------|------------|
| Database | `./steps.db` | `/data/steps.db` |
| Sessions | `./sessions.db` | `/data/sessions.db` |
| HTTPS | Disabled | Forced |
| Cookies | Insecure | Secure |
| Logging | Console | Fly.io logs |
| Auto-scale | No | Yes |

### Migration Checklist
- [ ] Environment variables configured
- [ ] Database volume created and mounted
- [ ] SSL certificate issued
- [ ] Custom domain configured (if needed)
- [ ] Monitoring alerts set up
- [ ] Backup strategy implemented
- [ ] Team access configured

---

## Quick Reference Commands

```bash
# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs

# Scale up
fly scale memory 2048

# SSH access
fly ssh console

# Rollback
fly releases rollback

# Secrets
fly secrets list
fly secrets set KEY=value

# Volumes
fly volumes list
fly volumes snapshots create <volume_id>
```

## Support and Resources

- **Fly.io Documentation**: https://fly.io/docs/
- **Fly.io Community**: https://community.fly.io/
- **Status Page**: https://status.fly.io/
- **App Monitoring**: https://fly.io/apps/step-app-4x-yhw/monitoring

---

*Last updated: July 2025*
*App Version: Deployed on Fly.io with SQLite persistence*