# Step Challenge App

## Overview
Web application for tracking daily steps in a company-wide challenge (~150 users).

## Status: Production Ready ✅
- Deployed on Fly.io with security enhancements
- Full admin panel with user/team management
- Daily step visualization with charts
- CSV export functionality
- CSRF protection and Content Security Policy
- Cross-browser compatibility (including Safari)

## Tech Stack
- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla HTML/CSS/JS
- **Auth**: Magic links via Mailgun API
- **Security**: Helmet, rate limiting, CSRF tokens
- **Deployment**: Fly.io with Docker

## Key Files
- `server.js` - Main Express server
- `database.js` - SQLite schema
- `views/` - HTML templates (dashboard, admin)
- `public/` - Client-side JS (dashboard.js, admin.js)

## Commands
```bash
npm start          # Start server
npm run dev        # Development mode
```

## Recent Updates
- Fixed Safari date validation issues
- Improved admin panel styling and alignment
- Enhanced CSP compliance
- Added comprehensive error handling for production
- Implemented user deletion and CSV export

## Architecture
- **Auth**: Passwordless magic links, session-based
- **Ranking**: Steps per day average (fair for all participation levels)
- **UI**: Mobile-first, glass-morphism design
- **Security**: CSRF tokens, rate limiting, secure headers