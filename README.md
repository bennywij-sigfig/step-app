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
- **MCP Integration**: Python bridge script (primary) and Node.js stdio server (alternate) for Claude Desktop/Cursor/Claude Code

## Recent Updates (August 1, 2025)
- **Repository Reorganization**: Complete directory restructure with src/, mcp/, docs/, tests/, config/ organization
- **Documentation Updates**: All path references updated for new structure
- **Production Stability**: Repository reorganization deployed and verified working
- **Enhanced Testing**: Comprehensive test suites for load testing, security validation, and browser automation

## Previous Updates (July 30, 2025)
- **Python MCP Bridge**: Primary approach - single Python file with rich tool descriptions for optimal LLM integration
- **Node.js MCP Server**: Alternate approach - full stdio protocol implementation for advanced users
- **Security-First Design**: Environment variable token handling with secure authentication
- **Configuration Management**: Clear documentation for claude.json and config file locations
- **Production Security**: B+ security grade with comprehensive token validation
- **Simple User Experience**: One-click download + token setup - works locally with full control

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
- **Security**: Multi-tier rate limiting (magic link: 10/hour, API: 100/hour, admin: 50/hour)
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

**Status**: Fully operational with recent stability improvements
- Challenge creation fully functional
- Admin panel UI cleaned up 
- Database migrations handle schema updates automatically
- Enhanced error handling and validation
- Repository reorganization deployed successfully

### Fly.io Configuration
- Uses optimal `fly.toml` configuration that avoids CLI deployment crashes
- Single machine with persistent SQLite volume
- Automated deployments via Docker
- Health monitoring and graceful shutdowns
- Database schema migrations on startup ensure production compatibility

### Production Readiness
**Before scaling to 150+ users, implement**:
- Automated backup strategy for SQLite database
- Pre-deployment backup scripts
- Global error handlers and database reconnection logic
- External uptime monitoring

## Development

- **Local Testing**: App creates SQLite database automatically
- **Email Development**: Magic link URLs appear in console when email is not configured
- **Admin Access**: Set `is_admin=1` in users table for admin panel access
- **Testing**: Playwright test configuration included for browser automation

## MCP (Model Context Protocol) Integration

The Step Challenge App provides two MCP integration approaches for Claude Desktop, Cursor, and Claude Code:

### **Python Bridge (Primary - Recommended)**
Single Python file that bridges AI clients to the Step Challenge API with rich tool descriptions for optimal LLM performance. Users prefer this approach due to simplicity and widespread Python availability.

### **Node.js Stdio Server (Alternate - Advanced)**  
Full MCP protocol implementation for users who prefer Node.js or need advanced MCP features. See `docs/USER_SETUP_GUIDE.md` for setup instructions.

### Overview

Both MCP approaches allow AI assistants to:
- Add and update daily step counts programmatically
- Retrieve step history with flexible date filtering
- Access user profile and challenge information
- Maintain full audit trails with security logging

**Key Features:**
- **Local Execution**: MCP server runs on user's machine with full control
- **Token-based Authentication**: Secure MCP tokens validate against remote API
- **User Data Isolation**: Users can only access their own data through tokens
- **Stdio Protocol**: Standards-compliant MCP stdio communication
- **No Network Latency**: Direct local execution with immediate responses
- **Privacy-First**: Local processing with minimal data transmission

### Admin Setup Instructions

#### 1. **Create MCP Tokens for Users**
```bash
# Use the interactive token creation tool
python mcp/get_mcp_token.py --interactive

# Or create via admin API
POST /api/admin/mcp-tokens
Content-Type: application/json
X-CSRF-Token: [admin_csrf_token]

{
  "user_id": 123,
  "name": "Local MCP Integration",
  "permissions": "read_write",
  "scopes": "steps:read,steps:write,profile:read",
  "expires_days": 30
}
```

#### 2. **Distribute MCP Server Files**
- Provide users with `mcp/mcp-server.js` and setup instructions
- Include token in secure communication (email, secure chat)
- Point users to `docs/USER_SETUP_GUIDE.md` for configuration

#### 3. **Monitor Usage**
```bash
# View MCP audit log
GET /api/admin/mcp-audit?page=1&limit=50

# List all active tokens
GET /api/admin/mcp-tokens
```

### User Setup Instructions

#### **For Claude Desktop, Cursor, or Claude Code**
Configure via `claude.json` or `claude_desktop_config.json`:

**Project Directory** (Claude Code): `./claude.json`
**User Directory**: `~/.config/claude/claude.json` (macOS/Linux)
**User Directory**: `%APPDATA%\claude\claude.json` (Windows)

```json
{
  "mcpServers": {
    "step-challenge": {
      "command": "node",
      "args": ["/path/to/step-challenge/mcp/mcp-server.js"],
      "env": {
        "STEP_CHALLENGE_TOKEN": "your_mcp_token_here"
      }
    }
  }
}
```

**For Claude Desktop** - Config locations:
- **macOS**: `~/Library/Application Support/Claude/`
- **Windows**: `%APPDATA%\Claude\`
- **Linux**: `~/.config/claude/`

**For Cursor** - Configure via MCP settings in Preferences

#### **Testing the Setup**
```bash
# Test server directly
STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js

# Test with echo
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | STEP_CHALLENGE_TOKEN=your_token node mcp/mcp-server.js
```

#### **Usage Examples**
Once configured, ask your AI assistant:
- "Add 10,500 steps for today"
- "Show my step progress this week"
- "Check my step challenge profile"

#### **Local MCP Server Details**
- **Command**: `node mcp/mcp-server.js`
- **Protocol**: Stdio-based JSON-RPC 2.0
- **Authentication**: Environment variable `STEP_CHALLENGE_TOKEN`

#### **Authentication**
All API calls require a valid MCP token provided in the `params.token` field.

#### **Available Methods**

**`get_user_profile`** - Get user information and current challenge details
- **Purpose**: Retrieve user profile, team assignment, and active challenge information
- **Parameters**: None (uses token's associated user)

**`get_steps`** - Retrieve step history with optional date filtering
- **Purpose**: Get step counts for analysis, reporting, or verification
- **Parameters**:
  - `start_date` (optional): YYYY-MM-DD format
  - `end_date` (optional): YYYY-MM-DD format

**`add_steps`** - Record daily step count with overwrite protection
- **Purpose**: Add or update step count for a specific date
- **Security**: Overwrite protection prevents accidental data loss
- **Parameters**:
  - `date` (required): YYYY-MM-DD format
  - `count` (required): 0-70,000 steps
  - `allow_overwrite` (optional): boolean, default false

### Simple Distribution Process

For distributing MCP access to users:

#### **Simple Process:**
1. **Create MCP token** for user via admin panel
2. **Share setup page URL**: https://step-app-4x-yhw.fly.dev/mcp-setup
3. **User self-service setup** - complete instructions provided on setup page
4. **No IT support needed** - users can configure their own AI clients

#### **Admin Workflow:**
1. **Create tokens** via admin panel MCP token management
2. **Share setup page** - users handle their own setup  
3. **Monitor usage** via admin audit logs

```
User Experience Flow:
1. Download: mcp/step_bridge.py (one-click from setup page)
2. Install: pip install aiohttp
3. Configure: STEP_TOKEN=your_token python step_bridge.py
4. Add to AI client config (instructions provided)
```

#### **Available MCP Tools**
- `get_user_profile` - View profile, team, and current challenge
- `get_steps` - Retrieve step history with date filtering  
- `add_steps` - Record daily step counts with overwrite protection

Users add stdio bridge to their AI client settings (2-minute setup), then can ask Claude: "Add 12,000 steps for today"

See `docs/ADMIN_DISTRIBUTION_GUIDE.md` for complete workflow.

## File Structure

### **Core Application**
- `src/server.js` - Main Express server with all API endpoints + MCP integration
- `src/database.js` - SQLite schema and initialization + MCP tables
- `src/views/` - HTML templates (dashboard, admin, MCP setup)
- `src/public/` - Static assets (CSS, JavaScript, images)
- `src/scripts/` - Backup and deployment scripts

### **MCP Integration**
- `mcp/step_bridge.py` - Single-file Python MCP bridge with rich tool descriptions
- `mcp/mcp-server.js` - Full JSON-RPC 2.0 MCP protocol implementation
- `mcp/get_mcp_token.py` - Admin CLI tool for creating and managing MCP tokens
- `mcp/test_mcp_python.py` - Comprehensive testing suite for API and MCP server testing

### **Testing & Documentation**
- `tests/` - Comprehensive test suites (load testing, security validation, browser automation)
- `docs/` - Setup guides, admin workflows, and testing documentation
- `config/` - Deployment configurations and environment templates

### **User Experience**
- `/mcp-setup` - Authenticated setup page with multi-client configuration examples
- `/download/step_bridge.py` - Public bridge script download with security headers
- `/api/user/mcp-tokens` - API for users to retrieve their tokens securely

### **Admin Tools**
- `mcp/get_mcp_token.py` - Admin CLI tool for creating and managing MCP tokens
- Admin panel at `/admin` - Web-based token management and monitoring
- MCP audit logging for usage tracking and security monitoring

## Contributing

This application follows a security-first development approach with comprehensive testing at multiple levels. See `docs/` directory for detailed setup and testing guides.