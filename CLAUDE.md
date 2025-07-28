# Step Challenge App

## Overview
Production web application for tracking daily steps in company-wide challenges (~150 users).

## Status: Production Deployed ✅
- **URL**: https://step-app-4x-yhw.fly.dev/
- **Last Deploy**: July 28, 2025 (ranked leaderboards + theme system + deployment fixes)
- Ranked/unranked leaderboard system with team member disclosure
- 5-color admin theme system (Ocean Blue, Sunset Orange, Forest Green, Lavender Purple, Monochrome)
- Comprehensive security: CSRF protection, rate limiting, CSP headers
- Fly.io deployment with optimized configuration (CLI crash issues resolved)
- Cross-browser compatibility including Safari

## Tech Stack
- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla HTML/CSS/JS with Chart.js
- **Auth**: Magic links via Mailgun API (30-min expiry)
- **Security**: Helmet.js, multi-tier rate limiting, CSRF tokens
- **Deployment**: Fly.io with Docker, persistent SQLite volume

## Key Files
- `server.js` - Main Express server with all API endpoints
- `database.js` - SQLite schema and initialization
- `views/dashboard.html` - Main user interface with leaderboard tabs
- `views/admin.html` - Admin panel with theme picker and management
- `public/dashboard.js` - Client-side logic for leaderboards and team disclosure
- `public/admin.js` - Admin panel functionality and theme management
- `fly.toml` - Optimal deployment configuration (avoids CLI crashes)

## Commands
```bash
npm start          # Start production server
npm run dev        # Development mode with auto-restart
```

## Recent Updates (July 28, 2025)
- **Ranked/Unranked Leaderboard System**: Individual and team leaderboards with participation thresholds (70% default)
- **Team Member Disclosure**: Expandable team member lists with individual statistics and reporting rates
- **Admin Theme System**: 5-color theme picker with real-time switching and localStorage persistence
- **Deployment Fix**: Resolved Fly CLI crashes by optimizing fly.toml configuration (removed conflicting constraints)
- **Production Testing**: Comprehensive Playwright testing validates all functionality in production
- **Pacific Time Support**: Proper timezone handling for challenge day calculations
- **Future Date Prevention**: Blocks step entries beyond current day with timezone buffer

## Architecture
- **Auth**: Passwordless magic links, SQLite session storage
- **Leaderboards**: Steps-per-day averages with ranked (≥threshold) vs unranked (<threshold) separation
- **Challenges**: Time-bound with configurable reporting thresholds and admin controls
- **UI**: Mobile-first glass-morphism design with responsive layouts
- **Security**: CSRF tokens, rate limiting (5/hour magic links, 100/hour API, 50/hour admin), parameterized queries

## Critical Next Steps
⚠️ **URGENT - Before scaling to 150+ users**:
1. **Database Backup Strategy** - Implement automated backups (no backup system currently)
2. **Error Handling** - Add global error handlers to prevent silent crashes
3. **Monitoring** - External uptime monitoring for production alerts

## Testing
- **Local Development**: Creates SQLite database automatically at startup
- **Magic Links**: URLs appear in console when email not configured
- **Admin Access**: Set `is_admin=1` in users table for admin panel access
- **Playwright**: Browser automation testing configured for production validation

## Database Schema
- `users` - Profiles, team assignments, admin flags
- `steps` - Daily counts with challenge associations
- `teams` - Team definitions
- `challenges` - Time periods with thresholds
- `auth_tokens` - Magic link tokens
- `sessions` - User session management