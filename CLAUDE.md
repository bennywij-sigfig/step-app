# Step Challenge App

## Overview
Production web application for tracking daily steps in company-wide challenges (~150 users).

## Status: Production Deployed with Repository Reorganization Complete ✅
- **URL**: https://step-app-4x-yhw.fly.dev/
- **Last Deploy**: August 1, 2025 (Repository reorganization + all documentation paths updated)
- **Repository Structure**: Complete directory reorganization with src/, mcp/, docs/, tests/, config/
- **Remote MCP API**: Fully operational Streamable HTTP endpoint at `/mcp`
- **MCP Admin Panel**: Complete token management interface with creation, revocation, and monitoring
- **Claude Integration**: Ready for Claude Desktop/Cursor/Claude Code with zero-installation setup
- Ranked/unranked leaderboard system with team member disclosure
- 5-color admin theme system (Ocean Blue, Sunset Orange, Forest Green, Lavender Purple, Monochrome)
- Admin panel challenge creation fully functional with database migrations
- Clean admin team leaderboard display (removed undefined threshold messages)
- Comprehensive security: CSRF protection, rate limiting, CSP headers, MCP audit logging
- Fly.io deployment with optimized configuration (CLI crash issues resolved)
- Cross-browser compatibility including Safari

## Tech Stack
- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla HTML/CSS/JS with Chart.js
- **Auth**: Magic links via Mailgun API (30-min expiry)
- **Security**: Helmet.js, multi-tier rate limiting, CSRF tokens
- **Deployment**: Fly.io with Docker, persistent SQLite volume

## Key Files

### **Core Application**
- `src/server.js` - Main Express server with route definitions and startup logic
- `src/database.js` - SQLite schema and initialization + MCP tables
- `src/views/dashboard.html` - Main user interface with leaderboard tabs
- `src/views/admin.html` - Admin panel with theme picker and management
- `src/public/dashboard.js` - Client-side logic for leaderboards and team disclosure
- `src/public/admin.js` - Admin panel functionality and theme management
- `fly.toml` - Optimal deployment configuration (avoids CLI crashes)

### **Modular Backend Components (New Architecture)**
- `src/middleware/auth.js` - Authentication middleware (requireAuth, requireAdmin, etc.)
- `src/middleware/rateLimiters.js` - Rate limiting configurations (API, MCP, admin limiters)
- `src/services/email.js` - Email service with Mailgun integration
- `src/utils/dev.js` - Development utilities (devLog, isDevelopment)
- `src/utils/validation.js` - Input validation utilities (email, date validation)
- `src/utils/token.js` - Secure token generation and hashing
- `src/utils/challenge.js` - Challenge timezone and date calculations

### **Local Stdio MCP Integration**
- `mcp/mcp-server.js` - Secure stdio-based MCP server with JSON-RPC 2.0 support
- `src/server.js` - Main server with `/mcp` endpoint for token validation
- `mcp/get_mcp_token.py` - Admin tool for creating and managing MCP tokens
- `mcp/test_mcp_python.py` - Comprehensive testing suite for API and MCP server testing

### **Documentation & Guides**
- `README.md` - Complete project documentation with remote MCP integration
- `docs/USER_SETUP_GUIDE.md` - End user setup guide for remote MCP (no installation required)
- `docs/ADMIN_DISTRIBUTION_GUIDE.md` - Admin workflow for distributing remote MCP access
- `docs/MCP_TESTING_GUIDE.md` - Comprehensive testing and integration guide

## Commands

### **Application Server**
```bash
npm start          # Start production server
npm run dev        # Development mode with auto-restart
```

### **Local Stdio MCP Integration**
```bash
# Admin: Create MCP tokens for users
python mcp/get_mcp_token.py --interactive

# Testing: Test API and local MCP server
python mcp/test_mcp_python.py --token YOUR_TOKEN --test-all

# Test local MCP server directly
STEP_CHALLENGE_TOKEN=YOUR_TOKEN node mcp/mcp-server.js

# Test with Claude Code
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | STEP_CHALLENGE_TOKEN=YOUR_TOKEN node mcp/mcp-server.js
```

### **AI Validation & Review**
```bash
# Gemini CLI Integration (Available for technical validation)
gemini -p "Analyze this repository structure"                    # Basic analysis
echo "Technical question" | gemini                               # Pipe questions to Gemini
gemini --all-files -p "Provide comprehensive assessment"         # Full codebase analysis
gemini --debug -p "Technical query"                              # Debug mode for detailed insights

# Code review and architecture assessment
gemini -p "Review this implementation: [paste code here]. Assess architecture, identify bugs, suggest improvements."

# Security and production readiness analysis
gemini -p "Security analysis of this code change. Assess risks for production deployment with 150+ users."

# Repository reorganization validation (tested and confirmed)
echo "Reorganization plan details" | gemini -p "Analyze from production safety perspective"
```

## Recent Updates (August 6, 2025)

### 🏗️ **Major Server.js Refactoring - Modular Architecture**
- **Monolith Broken Down**: Refactored 2,595-line server.js into modular components (now 2,302 lines - 11.3% reduction)
- **New Module Structure**: Created organized `middleware/`, `services/`, and `utils/` directories
- **Authentication Middleware**: Extracted all auth functions (`requireAuth`, `requireAdmin`, etc.) → `src/middleware/auth.js`
- **Rate Limiting**: Consolidated all rate limiters (API, admin, MCP, magic links) → `src/middleware/rateLimiters.js`
- **Email Service**: Isolated Mailgun integration and email logic → `src/services/email.js`
- **Utility Modules**: Separated validation, token management, and challenge utilities → `src/utils/`
- **Zero Regressions**: All 119 unit tests pass, full functionality preserved with improved maintainability
- **Future-Ready**: Modular structure enables easier testing, reuse, and evolution

### 📁 **Improved Code Organization**
```
src/
├── middleware/          # Authentication & rate limiting
│   ├── auth.js         # requireAuth, requireAdmin functions
│   └── rateLimiters.js # All rate limit configurations
├── services/           # Business logic services
│   └── email.js        # Mailgun email integration
└── utils/              # Shared utilities
    ├── dev.js          # Development logging
    ├── validation.js   # Input validation
    ├── token.js        # Token generation/hashing
    └── challenge.js    # Challenge date calculations
```

## Previous Updates (August 2, 2025)

### 🧹 **Admin UI Simplification**
- **Magic Link Consolidation**: Removed redundant "Generate My Magic Link" button from Extras section
- **Single Source of Truth**: All magic link generation now happens in Manage Users (works for all users including admins)
- **Code Cleanup**: Removed 65 lines of server code and 50+ lines of JavaScript for cleaner codebase
- **Better UX**: Admins can find themselves in user list and generate magic links alongside managing other users
- **Fixed Database Error**: Resolved `logMCPAudit is not defined` error that was preventing admin magic link generation

### 🎊 **Two-Phase Confetti Physics System**
- **Drop Phase**: Particles fall naturally for 1.5 seconds, ignoring device tilting for proper physics
- **Interactive Phase**: Activates when 60% of particles settle, then responds to device tilting
- **User Delight**: Ensures confetti drops beautifully first, then becomes interactive without long delays
- **Fixed Timing Issue**: Y direction toggle now only applies after particles have touched bottom

### 🎊 **Comprehensive Confetti Physics Overhaul**
- **Complete Orientation Support**: Added full device rotation handling (0°, 90°, 180°, 270°) with proper gravity direction switching
- **Fixed Tilt Direction Confusion**: Implemented accelerometer coordinate transformation system - tilt top-toward-you/bottom-away now correctly moves confetti toward bottom
- **Dynamic Gravity System**: Confetti now travels to correct edges when device rotated - upside down makes confetti go to top of screen
- **Orientation-Aware Boundaries**: Particles settle on appropriate edges based on gravity direction instead of always settling at bottom
- **iOS Permission Caching**: Fixed multiple permission request bug that could disable DeviceMotion after first confetti celebration
- **Performance Optimizations**: Added debounced resize handling (150ms) and canvas size validation for smooth orientation transitions
- **Enhanced Shake Detection**: Now uses delta acceleration instead of absolute values for more accurate shake detection
- **Comprehensive Bug Fixes**: Fixed boundary collision logic, added safety checks for distance calculations, improved settling behavior

### 🔍 **AI-Assisted Code Review Process**
- **Gemini Security Analysis**: Comprehensive code review identified and fixed 11 critical/high-priority physics bugs
- **Production-Ready Validation**: All critical issues addressed including race conditions, memory leaks, and browser compatibility
- **Cross-Platform Testing**: Enhanced support for iOS Safari, Android Chrome, and desktop browsers with proper fallbacks

### 🚦 **Rate Limiting Improvements** 
- **Increased Rate Limits**: Addressed UX issues from overly restrictive limits causing legitimate users to be blocked during normal browsing
- **Environment Variable Configuration**: Made all rate limits configurable via environment variables for easier tuning
- **Conservative Security Approach**: Following Gemini security analysis, increased limits reasonably while maintaining protection against abuse
- **New Default Limits**: Magic Links: 50/hour (was 10), API: 300/hour (was 100), Admin API: 400/hour (was 200), MCP: 300/hour (was 60), MCP Burst: 75/min (was 15)

## Recent Updates (August 1, 2025)

### 🗂️ **Repository Reorganization Complete**
- **Directory Structure**: Complete reorganization with src/, mcp/, docs/, tests/, config/ directories
- **Path Fixes**: All require() statements, documentation, and deployment configurations updated
- **Production Deployment**: Successfully deployed and verified working with new structure
- **Documentation Sync**: All file path references updated across README, CLAUDE.md, and docs/

### 🌐 **Local Stdio MCP Server Implementation**
- **Stdio Protocol Support**: Full MCP stdio protocol compliance for local integration
- **Node.js Based**: Users need Node.js installed - server files distributed by admin
- **Local Control**: Users run MCP server locally with full control and privacy
- **Standards Compliant**: Follows official MCP protocol for Claude Desktop/Cursor/Claude Code
- **Direct Communication**: No network latency - immediate responses via stdio

### 🎛️ **MCP Admin UI Enhanced**
- **Token Management Interface**: Full-featured admin panel with creation, revocation, and monitoring
- **Remote Server Testing**: Admin tools can test remote MCP endpoints directly
- **Enterprise Token Lifecycle**: Copy functionality, usage tracking, expiration monitoring, and audit trails
- **Real-time Activity Dashboard**: MCP API monitoring with comprehensive filtering and search capabilities

### 🛡️ **Security & Reliability**
- **Local Execution**: MCP server runs locally - no network exposure
- **Token Authentication**: Secure token-based auth with remote API validation
- **User Isolation**: Each token only accesses associated user data
- **Audit Logging**: All MCP actions logged to remote API for monitoring

## Previous Updates (July 29, 2025)

### 🤖 **MCP Foundation Completed**
- **Production MCP API**: JSON-RPC 2.0 endpoint with comprehensive security (B+ security grade)
- **Enterprise Token System**: Secure token-based authentication with user isolation
- **Testing Suite**: Comprehensive Python tools for testing, debugging, and integration
- **Admin Panel Integration**: Web-based token management and monitoring
- **Documentation**: Complete guides for developers, admins, and end users

### 🔒 **Security Hardening** 
- **User Data Isolation**: MCP tokens enforce strict access controls (users can only access own data)
- **SQL Injection Prevention**: Safe query builders and parameterized queries throughout
- **Input Validation**: Robust validation prevents type confusion, prototype pollution attacks
- **Rate Limiting**: Dual-layer protection (15 req/min + 60 req/hour per token)
- **Audit Logging**: Complete MCP action tracking with IP addresses and user agents
- **Token Security**: Scoped permissions system (steps:read, steps:write, profile:read)

### 🚀 **Production Testing**
- **Security Review**: Gemini assessment confirmed all critical vulnerabilities fixed
- **Penetration Testing**: All attack vectors blocked, production-ready for deployment
- **API Testing**: Comprehensive test coverage with automated validation tools
- **Integration Testing**: Claude Desktop/Cursor integration verified and working

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
- **Local MCP API**: Stdio protocol with token-based auth, user isolation, and comprehensive audit logging
- **AI Integration**: Native Claude Desktop/Cursor/Claude Code support via local stdio MCP server

## Claude Code Best Practices for This Repository

### 🧪 **Testing Workflow - Local First, Then Production**

#### **1. Local Development Testing**
```bash
# Start local server with monitoring
npm run dev

# Test basic functionality
curl http://localhost:3000/health
curl http://localhost:3000/
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' http://localhost:3000/auth/send-link
```

#### **2. Frontend Testing (All Pages)**
Use Playwright MCP integration for comprehensive browser testing:
```bash
# Test all frontend pages systematically
# Dashboard: http://localhost:3000
# Admin panel: http://localhost:3000/admin  
# MCP setup: http://localhost:3000/mcp-setup
# Login flow: Magic link generation and validation
```

#### **3. API Endpoint Testing**
```bash
# Health and system status
curl http://localhost:3000/health

# MCP capabilities 
curl http://localhost:3000/mcp/capabilities

# Authentication endpoints
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' http://localhost:3000/auth/send-link

# Admin API (requires auth)
curl http://localhost:3000/api/csrf-token

# File downloads
curl http://localhost:3000/download/step_bridge.py
```

#### **4. MCP Integration Testing**
```bash
# Test remote MCP API
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' http://localhost:3000/mcp

# Test local MCP server (requires token)
STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js

# Test comprehensive MCP functionality
python mcp/test_mcp_python.py --token YOUR_TOKEN --test-all
```

#### **5. Production Testing**
After local validation, test production:
```bash
# Production health check
curl https://step-app-4x-yhw.fly.dev/health

# Production frontend pages
curl https://step-app-4x-yhw.fly.dev/
curl https://step-app-4x-yhw.fly.dev/download/step_bridge.py

# Production MCP endpoints
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' https://step-app-4x-yhw.fly.dev/mcp

# Production magic link testing
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' https://step-app-4x-yhw.fly.dev/auth/send-link
```

### 🔐 **Manual Magic Link Provision**

When email delivery fails or for testing purposes:

#### **Console Method (Development)**
```bash
# Magic links ALWAYS appear in console in development mode (regardless of MAILGUN_API_KEY)
# Look for: "🔗 Magic link (development mode): http://localhost:3000/auth/login?token=..."
npm run dev
# Send magic link request
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' http://localhost:3000/auth/send-link
# Magic link will appear in server console immediately (localhost only)
```

#### **Database Method (Production)**
```bash
# Connect to production database and retrieve magic link token
fly ssh console -a step-app-4x-yhw
sqlite3 /data/steps.db
SELECT token, email, expires_at FROM auth_tokens ORDER BY created_at DESC LIMIT 5;
# Construct URL: https://step-app-4x-yhw.fly.dev/auth/verify?token=TOKEN_VALUE
```

#### **Admin Panel Method (Preferred)**
```bash
# Use admin self-service magic link generation feature
# 1. Access admin panel: https://step-app-4x-yhw.fly.dev/admin
# 2. Navigate to Extras tab → "Magic Link Testing" section
# 3. Click "Generate My Magic Link" for your admin account
# 4. Secure masked display with copy/show controls
# 5. Full audit logging and CSRF protection
```

#### **Development Debug Method (Localhost)**
```bash
# Direct API endpoint for development testing (localhost only)
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' http://localhost:3000/dev/get-magic-link
# Returns magic link directly in JSON response (development mode only)
```

### 🤖 **Gemini CLI Integration for Code Review and Analysis**

Leverage the `gemini` command line tool for comprehensive code review and technical validation:

#### **Code Review Workflow**
```bash
# Architecture and implementation review
gemini -p "Review this per-user theme system implementation:

[paste your code here]

Assess:
1. Architecture design and patterns
2. Potential bugs and edge cases  
3. Performance implications
4. Security considerations
5. Best practices adherence
6. Maintainability concerns
7. Suggest improvements"

# Security analysis for production deployment
gemini -p "Security assessment of this code change for production app with 150+ users:

[paste code/changes]

Focus on: authentication, input validation, XSS, CSRF, data privacy, localStorage usage"

# Full repository analysis  
gemini --all-files -p "Comprehensive codebase assessment focusing on production readiness, security vulnerabilities, and architectural improvements"
```

#### **Development Decision Support**
```bash
# Design pattern validation
gemini -p "Is this implementation pattern appropriate for [specific context]? [paste code] What are better alternatives?"

# Performance analysis
gemini -p "Performance analysis of this implementation. Identify bottlenecks and optimization opportunities: [paste code]"

# Cross-browser compatibility
gemini -p "Cross-browser compatibility assessment for this frontend code: [paste code]. Focus on Safari, Chrome, Firefox mobile/desktop."
```

#### **Pre-deployment Validation**
```bash
# Production readiness check
gemini -p "Production deployment readiness check for these changes: [describe changes]. Risk assessment for live users."

# Breaking change analysis  
gemini -p "Analyze potential breaking changes in this implementation: [paste code]. Impact on existing users and data."
```

#### **Best Practices for Claude Code + Gemini**
- **Always get second opinion** on architectural decisions
- **Security review** before production deployment
- **Performance validation** for user-facing changes
- **Cross-browser compatibility** for frontend modifications
- **Breaking change assessment** for API or database changes

### 🖥️ **Playwright MCP Integration for Browser Testing**

Leverage the Playwright MCP server for comprehensive UI testing:

#### **Browser Testing Workflow**
```bash
# Use Claude Code with Playwright MCP to:
# 1. Navigate to application pages
# 2. Take screenshots for visual validation
# 3. Test user interactions (login, dashboard navigation, admin functions)
# 4. Validate responsive design across different viewport sizes
# 5. Test MCP setup page functionality
```

#### **Key Pages to Test**
- **Dashboard** (`/`): Leaderboards, team disclosure, theme switching
- **Admin Panel** (`/admin`): User management, challenge creation, MCP token management
- **MCP Setup** (`/mcp-setup`): Download functionality, configuration examples
- **Login Flow**: Magic link generation, token validation, session management

### 📊 **Database Management via Claude Code**

#### **SQLite Status Monitoring**
```bash
# Check database health
curl http://localhost:3000/health | jq '.database'

# Production database status  
curl https://step-app-4x-yhw.fly.dev/health | jq '.database'

# Database schema validation
sqlite3 src/steps.db ".schema"
```

#### **Common Database Operations**
```bash
# User management
sqlite3 src/steps.db "SELECT id, email, name, team_id, is_admin FROM users;"

# Step data analysis
sqlite3 src/steps.db "SELECT date, count FROM steps ORDER BY date DESC LIMIT 10;"

# MCP token status
sqlite3 src/steps.db "SELECT token, user_id, expires_at FROM mcp_tokens WHERE expires_at > datetime('now');"

# Challenge status
sqlite3 src/steps.db "SELECT name, start_date, end_date, reporting_threshold FROM challenges ORDER BY created_at DESC;"
```

### 🚀 **Deployment and Monitoring**

#### **Deployment Workflow**
```bash
# Pre-deployment checks
npm run dev  # Ensure local functionality
fly deploy   # Deploy to production
curl https://step-app-4x-yhw.fly.dev/health  # Verify deployment

# Post-deployment validation
fly logs -a step-app-4x-yhw  # Monitor startup logs
fly status -a step-app-4x-yhw  # Check app status
```

#### **Production Monitoring**
```bash
# Application health monitoring
curl https://step-app-4x-yhw.fly.dev/health

# Database performance
curl https://step-app-4x-yhw.fly.dev/health | jq '.database'

# MCP endpoint availability
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' https://step-app-4x-yhw.fly.dev/mcp

# Log monitoring for errors
fly logs -a step-app-4x-yhw --follow
```

### ⚡ **Load Testing and Performance Validation**

#### **Using Built-in Test Suites**
```bash
# Comprehensive load testing
node tests/load-test.js

# MCP API load testing
node tests/mcp-api-load-test.js

# Authenticated user flow testing
node tests/authenticated-load-test.js

# Security validation testing
node tests/test-input-validation.js
```

#### **Security Testing Workflows**
```bash
# Input validation testing
node tests/test-string-attack.js

# Rate limiting validation
node tests/test-validation-direct.js

# Admin magic link security testing  
node tests/test-admin-magic-links.js
```

### 🔍 **MCP Integration Debugging**

#### **Python Bridge Testing**
```bash
# Download and test Python bridge
curl https://step-app-4x-yhw.fly.dev/download/step_bridge.py -o step_bridge.py
pip install aiohttp
STEP_TOKEN=your_token python step_bridge.py

# Test specific MCP functions
python mcp/test_mcp_python.py --token YOUR_TOKEN --test-profile
python mcp/test_mcp_python.py --token YOUR_TOKEN --test-steps
```

#### **Node.js MCP Server Testing**
```bash
# Test local stdio MCP server
STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js

# Test JSON-RPC protocol compliance
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js
```

#### **Claude Desktop/Cursor Integration Testing**
```bash
# Validate claude.json configuration
cat claude.json

# Test MCP server accessibility
STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js

# Monitor MCP usage via admin panel
curl https://step-app-4x-yhw.fly.dev/api/admin/mcp-audit
```

### 📋 **Comprehensive Testing Checklist**

When working on this repository, systematically validate:

#### **Frontend Testing**
- [ ] Dashboard loads and displays leaderboards correctly
- [ ] Admin panel accessible and functional (user/team/challenge management)
- [ ] MCP setup page provides correct download and configuration instructions
- [ ] Theme switching works across all admin pages
- [ ] Mobile responsiveness validated across viewport sizes
- [ ] Cross-browser compatibility (Chrome, Firefox, Safari)

#### **Backend API Testing**
- [ ] Health endpoint returns database status and application metrics
- [ ] Authentication endpoints handle magic link generation and validation
- [ ] CSRF protection active on admin endpoints
- [ ] Rate limiting enforced (10/hour magic links, 100/hour API, 50/hour admin)
- [ ] MCP endpoints respond correctly to JSON-RPC calls
- [ ] File download endpoints serve correct content with security headers

#### **MCP Integration Testing**
- [ ] Remote MCP API returns correct tool definitions and capabilities
- [ ] Python bridge downloads successfully and connects to API
- [ ] Node.js MCP server starts and responds to stdio protocol
- [ ] Token-based authentication validates correctly
- [ ] User data isolation enforced (users only access own data)
- [ ] Audit logging captures all MCP actions with IP addresses

#### **Database and Security Testing**
- [ ] SQLite database integrity check passes
- [ ] Input validation prevents SQL injection and XSS attacks
- [ ] Session management secure with proper token expiration
- [ ] User permissions enforced (admin vs regular user access)
- [ ] Data backup and recovery procedures validated

#### **Production Deployment Testing**
- [ ] Fly.io deployment completes without errors
- [ ] Health checks pass post-deployment
- [ ] All endpoints accessible via HTTPS
- [ ] Database migrations apply successfully
- [ ] Static file serving works correctly
- [ ] Email delivery functional (or console fallback working)

### 🎯 **Repository-Specific Tips**

#### **Quick Development Setup**
```bash
# One-command development start
npm run dev

# Admin user creation (set in database)
sqlite3 src/steps.db "UPDATE users SET is_admin = 1 WHERE email = 'your-email@example.com';"

# MCP token creation for testing
python mcp/get_mcp_token.py --interactive
```

#### **Common Debugging Scenarios**
- **Magic links not working**: Check console output in development, verify Mailgun configuration in production
- **Admin panel not accessible**: Verify `is_admin = 1` in users table for your user account
- **MCP integration failing**: Validate token with `python mcp/test_mcp_python.py --token YOUR_TOKEN`
- **Database issues**: Run health check and examine `database.accessible` and `database.integrity` fields
- **Frontend not loading**: Check static file serving configuration and network tab in browser developer tools

#### **Performance Optimization**
- Monitor database size and consider implementing backup rotation
- Use browser developer tools to validate CSS/JS loading times
- Monitor memory usage during load testing
- Validate rate limiting effectiveness under stress testing

This comprehensive testing and development workflow ensures reliability, security, and optimal performance of the Step Challenge application across all components and integration points.

## Security & Infrastructure Status

### ✅ **COMPLETED Security Fixes (Ready for 150+ Users)**
1. **Repository Reorganization** - Complete directory restructure with proper separation of concerns
2. **Backend Input Validation** - Comprehensive validation prevents type confusion, SQL injection, and data corruption attacks
3. **Rate Limiting Enhancement** - Increased magic link limit from 5→10 per hour per IP for VPN users
4. **Production Security Testing** - Full penetration testing completed, all attack vectors blocked
5. **CSRF Protection Assessment** - Current 24-hour session-based tokens deemed secure for use case
6. **Documentation Sync** - All file paths and references updated for new repository structure

### ⚠️ **CRITICAL Next Steps**
See `/docs/TODO.md` for complete list of next steps and unfinished items.

## Testing
- **Local Development**: Creates SQLite database automatically at startup
- **Magic Links**: URLs appear in console when email not configured
- **Admin Access**: Set `is_admin=1` in users table for admin panel access
- **Playwright**: Browser automation testing configured for production validation
- **Load Testing**: Comprehensive test suites in `/tests/` directory
- **MCP Testing**: Python and Node.js testing tools for integration validation

## Database Schema
- `users` - Profiles, team assignments, admin flags
- `steps` - Daily counts with challenge associations
- `teams` - Team definitions
- `challenges` - Time periods with thresholds
- `auth_tokens` - Magic link tokens
- `sessions` - User session management
- `mcp_tokens` - MCP authentication tokens
- `mcp_audit_log` - MCP action tracking

## Project Status & TODO Management

**Current Status:** Production ready with comprehensive MCP integration and enterprise security features.

**TODO Management:** All current tasks, completed items, and future enhancements are tracked in `/docs/TODO.md`.