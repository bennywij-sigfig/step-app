# Step Challenge Web App

A production-ready web application for tracking daily steps in company-wide challenges, supporting 150+ users with advanced leaderboard systems and administrative features.

## Features

- **Passwordless Authentication**: Magic link login via Mailgun API
- **Advanced Leaderboards**: Ranked/unranked individual and team leaderboards with participation thresholds
- **Team Management**: Expandable team member disclosure with individual statistics
- **Admin Panel**: User/team management, CSV export, challenge configuration with 5-color theme system
- **Challenge System**: Time-bound challenges with Pacific Time zone support and configurable reporting thresholds
- **Mobile Optimized**: Responsive glass-morphism UI design, cross-browser compatible (including Safari)
- **Production Security**: CSRF protection, rate limiting, CSP headers, SQL injection prevention

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   # Required for production
   SESSION_SECRET=your-secure-32-char-minimum-secret-key
   NODE_ENV=production
   
   # Email configuration (Mailgun)
   MAILGUN_API_KEY=your-mailgun-api-key
   MAILGUN_DOMAIN=your-domain.com
   FROM_EMAIL=your-sender@your-domain.com
   ```

3. **Start the server**:
   ```bash
   npm start          # Production
   npm run dev        # Development with auto-restart
   ```

4. **Access the application**:
   - **Dashboard**: `http://localhost:3000`
   - **Admin Panel**: `http://localhost:3000/admin` (requires admin user)

## Architecture

- **Authentication**: Passwordless magic links with 30-minute expiry, session-based authentication
- **Database**: SQLite with tables for users, steps, teams, challenges, auth_tokens, and sessions
- **Ranking System**: Steps-per-day averages with ranked/unranked threshold system (default 70% reporting required)
- **Security**: Multi-tier rate limiting (magic link: 5/hour, API: 100/hour, admin: 50/hour)
- **Deployment**: Fly.io with Docker, optimized configuration to avoid CLI deployment crashes

## Tech Stack

- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla HTML/CSS/JavaScript with Chart.js for visualizations
- **Authentication**: Magic links via Mailgun API
- **Security**: Helmet.js, rate limiting, CSRF tokens, parameterized queries
- **Deployment**: Fly.io with Docker containers and persistent volumes

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | Production | auto-generated | Secure session key (32+ characters) |
| `NODE_ENV` | Recommended | development | Set to 'production' for optimizations |
| `MAILGUN_API_KEY` | For email | - | Mailgun API key for sending magic links |
| `MAILGUN_DOMAIN` | For email | sigfig.com | Your verified Mailgun domain |
| `FROM_EMAIL` | For email | data@sigfig.com | Sender email address |

## Key Features

### Leaderboard System
- **Individual Leaderboards**: Ranked (≥threshold) and unranked (<threshold) participants
- **Team Leaderboards**: Average team performance with expandable member details
- **Reporting Rates**: Personal and team participation percentages
- **Challenge Context**: Time-bound challenges with day tracking

### Admin Features
- **User Management**: Create, edit, delete users with team assignments
- **Team Management**: Create and manage teams with member oversight
- **Challenge Management**: Configure start/end dates and reporting thresholds
- **Theme System**: 5-color admin interface themes with real-time switching
- **Data Export**: Complete CSV export of users and step data

### Security & Performance
- **CSRF Protection**: Token-based validation for all admin operations
- **Rate Limiting**: Multi-tier limits prevent abuse
- **Content Security Policy**: Strict CSP with external resource controls
- **SQL Injection Prevention**: Parameterized queries throughout
- **Session Management**: SQLite-based sessions with secure configuration

## Production Deployment

Currently deployed at: **https://step-app-4x-yhw.fly.dev/**

**Status**: ✅ **Fully operational** with recent stability improvements
- Challenge creation fully functional
- Admin panel UI cleaned up 
- Database migrations handle schema updates automatically
- Enhanced error handling and validation

### Fly.io Configuration
- Uses optimal `fly.toml` configuration that avoids CLI deployment crashes
- Single machine with persistent SQLite volume
- Automated deployments via Docker
- Health monitoring and graceful shutdowns
- Database schema migrations on startup ensure production compatibility

### Critical Production Notes
⚠️ **Before scaling to 150+ users, implement**:
- Automated backup strategy for SQLite database
- Pre-deployment backup scripts
- Global error handlers and database reconnection logic
- External uptime monitoring

## Development

- **Local Testing**: App creates SQLite database automatically
- **Email Development**: Magic link URLs appear in console when email is not configured
- **Admin Access**: Set `is_admin=1` in users table for admin panel access
- **Testing**: Playwright test configuration included for browser automation

## Database Schema

- `users` - User profiles, team assignments, admin flags
- `steps` - Daily step counts with challenge associations
- `teams` - Team definitions and metadata
- `challenges` - Challenge periods with thresholds and dates
- `auth_tokens` - Magic link tokens with expiry
- `sessions` - User session management