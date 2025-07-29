# Step Challenge App

## Overview
Production web application for tracking daily steps in company-wide challenges (~150 users).

## Status: Production Deployed ✅
- **URL**: https://step-app-4x-yhw.fly.dev/
- **Last Deploy**: July 28, 2025 (UI fixes + database stability improvements)
- Ranked/unranked leaderboard system with team member disclosure
- 5-color admin theme system (Ocean Blue, Sunset Orange, Forest Green, Lavender Purple, Monochrome)
- Admin panel challenge creation fully functional with database migrations
- Clean admin team leaderboard display (removed undefined threshold messages)
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

## Recent Updates (July 29, 2025)
- **🔒 Security Hardening**: Comprehensive backend input validation prevents type confusion, SQL injection, and malicious payload attacks
- **🚀 Production Testing**: Full security penetration testing completed - all attack vectors blocked
- **🔧 Rate Limiting**: Increased magic link requests from 5→10 per hour per IP for VPN/shared network users  
- **🛡️ CSRF Assessment**: Security review confirmed current 24-hour session tokens are adequate for use case
- **📊 Input Validation**: Robust numeric validation with descriptive error messages and safe type conversion
- **✅ Launch Ready**: All critical security issues resolved, app ready for 50-user deployment

## Previous Updates (July 28, 2025)
- **Admin UI Cleanup**: Removed undefined threshold messages from team leaderboard display  
- **Challenge Creation Fix**: Resolved database errors when creating new challenges in production
- **Database Migrations**: Added automatic schema updates for backward compatibility
- **Enhanced Error Handling**: Better error messages and duplicate name checking for challenge creation
- **Ranked/Unranked Leaderboard System**: Individual and team leaderboards with participation thresholds (70% default)
- **Team Member Disclosure**: Expandable team member lists with individual statistics and reporting rates
- **Admin Theme System**: 5-color theme picker with real-time switching and localStorage persistence
- **Production Testing**: Comprehensive Playwright testing validates all functionality in production
- **Pacific Time Support**: Proper timezone handling for challenge day calculations
- **Future Date Prevention**: Blocks step entries beyond current day with timezone buffer

## Architecture
- **Auth**: Passwordless magic links, SQLite session storage
- **Leaderboards**: Steps-per-day averages with ranked (≥threshold) vs unranked (<threshold) separation
- **Challenges**: Time-bound with configurable reporting thresholds and admin controls
- **UI**: Mobile-first glass-morphism design with responsive layouts
- **Security**: CSRF tokens, rate limiting (10/hour magic links, 100/hour API, 50/hour admin), comprehensive input validation, parameterized queries

## Security & Infrastructure Status

### ✅ **COMPLETED Security Fixes (Ready for 50+ Users)**
1. **Backend Input Validation** - Comprehensive validation prevents type confusion, SQL injection, and data corruption attacks
2. **Rate Limiting Enhancement** - Increased magic link limit from 5→10 per hour per IP for VPN users
3. **Production Security Testing** - Full penetration testing completed, all attack vectors blocked
4. **CSRF Protection Assessment** - Current 24-hour session-based tokens deemed secure for use case

### ⚠️ **CRITICAL Next Steps (Before scaling to 150+ users)**
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

## Current Todo Status

### ✅ **Completed (Ready for 50-User Launch)**
- [x] Test production API endpoints (auth, steps, leaderboards, admin)
- [x] Run Playwright browser automation tests on production  
- [x] Stress test rate limiting and security features
- [x] Test edge cases and error handling
- [x] Validate mobile responsiveness and cross-browser compatibility
- [x] Analyze backend input validation security issues
- [x] Analyze CSRF token reuse security vulnerability
- [x] Create comprehensive security fix plan
- [x] Implement robust backend input validation (Fix 1)
- [x] Test input validation with malicious inputs
- [x] Plan CSRF token rotation strategy
- [x] Create detailed selective CSRF rotation implementation plan
- [x] Validate plan with external review (Gemini)

### ❌ **Cancelled (Too Risky for Launch)**
- [x] CANCELLED: Implement selective CSRF token rotation (expert review deemed too risky)
- [x] CANCELLED: Review implementation code with Gemini
- [x] CANCELLED: Test implementation locally and commit changes  
- [x] CANCELLED: Deploy to production and verify CSRF rotation

### 🔄 **Pending (Future Considerations)**
- [ ] Consider migrating from ORD to Singapore (sin) region for better global latency
- [ ] Implement database backup strategy (critical before 150+ users)
- [ ] Add global error handlers (critical before 150+ users)  
- [ ] Set up external uptime monitoring (critical before 150+ users)