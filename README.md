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
- **Remote MCP Integration**: Zero-installation Claude Desktop/Cursor integration with enterprise security

## Recent Updates (July 30, 2025)
- **🌐 Remote MCP Server**: Converted to Streamable HTTP remote server - no Python installation required for users
- **🚀 Zero-Installation Setup**: Users only need URL + token - eliminated complex local server setup
- **🤖 LLM-Optimized**: Enhanced tool descriptions with examples and usage hints for better AI understanding
- **🧹 Legacy Cleanup**: Removed `/mcp/rpc` endpoint, archived local Python MCP server files
- **🛡️ Security Review**: Comprehensive security audit completed - B+ grade, production ready for 150+ users
- **📚 Simplified Distribution**: Updated all documentation for streamlined remote MCP approach

## Previous Security Updates (July 29, 2025)
- **🔒 Input Validation**: Comprehensive backend validation prevents type confusion and SQL injection attacks
- **🚀 Penetration Testing**: Full security audit completed - all attack vectors successfully blocked
- **🔧 Rate Limiting**: Increased magic link requests from 5→10 per hour per IP for VPN users
- **🛡️ CSRF Protection**: Security assessment confirmed 24-hour session tokens adequate for use case
- **📊 Data Validation**: Robust numeric validation with descriptive error messages and safe type conversion

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

## MCP (Model Context Protocol) API

The Step Challenge App provides a comprehensive MCP server implementation that enables programmatic access to step tracking functionality through a secure JSON-RPC 2.0 API.

### Overview

The MCP API allows external applications, automation tools, and integrations to:
- Add and update daily step counts programmatically
- Retrieve step history with flexible date filtering
- Access user profile and challenge information
- Maintain full audit trails with security logging

**Key Features:**
- **Token-based Authentication**: Secure MCP tokens with configurable permissions and scopes
- **User Data Isolation**: Users can only access their own data through tokens
- **Overwrite Protection**: Prevents accidental data loss with explicit overwrite flags
- **Rate Limiting**: 60 requests/hour and 15 requests/minute per token
- **Comprehensive Audit Logging**: All API actions are logged for security and debugging

### Admin Instructions

Administrators can manage MCP tokens through the admin API endpoints (no UI currently available):

#### 1. **Create MCP Token**
```bash
# Create a new MCP token for a user
POST /api/admin/mcp-tokens
Content-Type: application/json
X-CSRF-Token: [admin_csrf_token]

{
  "user_id": 123,
  "name": "My App Integration",
  "permissions": "read_write",  // or "read_only"
  "scopes": "steps:read,steps:write,profile:read",
  "expires_days": 30
}
```

#### 2. **List All MCP Tokens**
```bash
GET /api/admin/mcp-tokens
```

#### 3. **Revoke MCP Token**
```bash
DELETE /api/admin/mcp-tokens/[token_id]
X-CSRF-Token: [admin_csrf_token]
```

#### 4. **View MCP Audit Log**
```bash
GET /api/admin/mcp-audit?page=1&limit=50
```

### End User Instructions

Users interact with the MCP API using their assigned tokens through the JSON-RPC 2.0 protocol:

#### **API Endpoint**
- **Remote MCP Server**: `POST /mcp`
- **Capabilities Discovery**: `GET /mcp/capabilities`

#### **Authentication**
All API calls require a valid MCP token provided in the `params.token` field.

#### **Available Methods**

##### 1. **add_steps** - Add or Update Daily Steps
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "add_steps",
  "params": {
    "token": "mcp_12345678-abcd-...",
    "date": "2025-01-15",
    "count": 12000,
    "allow_overwrite": false
  }
}
```

**Parameters:**
- `token` (string, required): Your MCP authentication token
- `date` (string, required): Date in YYYY-MM-DD format
- `count` (number, required): Step count (0-70,000)
- `allow_overwrite` (boolean, optional): Allow overwriting existing data (default: false)

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "message": "Steps saved for 2025-01-15: 12000",
    "date": "2025-01-15",
    "count": 12000,
    "was_overwrite": false,
    "old_count": null
  },
  "id": 1
}
```

##### 2. **get_steps** - Retrieve Step History
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "get_steps",
  "params": {
    "token": "mcp_12345678-abcd-...",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  }
}
```

**Parameters:**
- `token` (string, required): Your MCP authentication token
- `start_date` (string, optional): Start date filter in YYYY-MM-DD format
- `end_date` (string, optional): End date filter in YYYY-MM-DD format

##### 3. **get_user_profile** - Get User Information
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "get_user_profile",
  "params": {
    "token": "mcp_12345678-abcd-..."
  }
}
```

#### **Error Responses**
The API returns standard JSON-RPC 2.0 error responses:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Server error",
    "data": "Steps already exist for 2025-01-15. Set allow_overwrite=true to replace."
  },
  "id": 1
}
```

**Common Error Codes:**
- `-32600`: Invalid Request (malformed JSON-RPC)
- `-32601`: Method not found
- `-32602`: Invalid params (missing required parameters)
- `-32001`: Authentication failed (invalid/expired token)
- `-32003`: Permission denied (insufficient token permissions)
- `-32004`: Rate limit exceeded

### Security Considerations

- **User Isolation**: Tokens only allow access to the token owner's data
- **Token Expiration**: Tokens have configurable expiration dates
- **Rate Limiting**: Automatic throttling prevents API abuse
- **Audit Logging**: All API actions are logged with IP addresses and user agents
- **Scope Validation**: Token permissions are enforced for all operations
- **Overwrite Protection**: Prevents accidental data loss unless explicitly allowed

### Testing MCP Integration

#### **Python Testing Suite** (Recommended)
```bash
# Install dependencies
pip install -r requirements.txt

# Get an MCP token (admin required)
python get_mcp_token.py --interactive

# Comprehensive testing
python test_mcp_python.py --token YOUR_TOKEN --test-all

# Interactive testing menu
python test_mcp_python.py --interactive
```

#### **JavaScript Testing** (Legacy)
```bash
# Test MCP integration against running server
node test-mcp.js --test-server

# View usage examples
node test-mcp.js
```

### Claude Code Integration

#### **Quick Start for Claude Code Users**
```python
import requests
import json
from datetime import datetime

# Replace with your MCP token
STEP_TOKEN = "mcp_12345678-abcd-..."

def call_step_api(method, params=None):
    if params is None:
        params = {}
    
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": {**params, "token": STEP_TOKEN},
        "id": 1
    }
    
    response = requests.post("https://step-app-4x-yhw.fly.dev/mcp", json=payload)
    return response.json()

# Add steps for today
today = datetime.now().strftime("%Y-%m-%d")
result = call_step_api("add_steps", {"date": today, "count": 12000})
print(json.dumps(result, indent=2))
```

#### **Official MCP Server for Claude Desktop/Cursor**
For persistent integration with Claude Desktop or Cursor:

1. **Install dependencies**: `pip install -r requirements-mcp.txt`
2. **Get MCP token**: `python get_mcp_token.py --interactive`
3. **Run installer**: `python install_step_mcp.py`
4. **Restart Claude Desktop/Cursor**

See `CLAUDE_CODE_SETUP.md` for detailed instructions.

### End User Distribution

For distributing MCP access to Claude Desktop/Cursor users:

#### **Files to Distribute:**
- `mcp_server_anthropic.py` - MCP server implementation
- `install_step_mcp.py` - Automated installer
- `USER_SETUP_GUIDE.md` - User instructions
- `README_DISTRIBUTION.md` - Quick start guide

#### **Admin Workflow:**
1. Create tokens: `python get_mcp_token.py --interactive`
2. Provide users with token + distribution files
3. Users run: `python install_step_mcp.py`
4. Users can then ask Claude: *"Add 12,000 steps for today"*

See `ADMIN_DISTRIBUTION_GUIDE.md` for complete distribution workflow.

## MCP Integration Files

### **Core MCP Implementation:**
- `mcp-server.js` - MCP JSON-RPC 2.0 server implementation with security hardening
- `server.js` - Express server with MCP endpoints and admin API
- `database.js` - Database schema including MCP tables

### **Testing & Development:**
- `test_mcp_python.py` - Comprehensive Python testing suite with interactive mode
- `get_mcp_token.py` - Admin tool for creating and managing MCP tokens
- `test-mcp.js` - JavaScript testing script (legacy)
- `mcp_demo_claude_code.py` - Direct API demo for LLM environments

### **Claude Code Integration:**
- `claude_code_integration.py` - Ready-to-use API client with helper functions
- `mcp_server_anthropic.py` - Official Anthropic MCP server for Claude Desktop/Cursor
- `CLAUDE_CODE_SETUP.md` - Complete setup guide for both integration methods

### **End User Distribution:**
- `install_step_mcp.py` - Automated installer for end users
- `USER_SETUP_GUIDE.md` - Detailed end user setup instructions  
- `ADMIN_DISTRIBUTION_GUIDE.md` - Admin workflow for distributing MCP access
- `README_DISTRIBUTION.md` - Quick start guide for distribution package
- `MCP_TESTING_GUIDE.md` - Comprehensive testing and integration guide

### **Dependencies:**
- `requirements.txt` - Python dependencies for testing tools
- `requirements-mcp.txt` - Dependencies for MCP server

## Database Schema

- `users` - User profiles, team assignments, admin flags
- `steps` - Daily step counts with challenge associations
- `teams` - Team definitions and metadata
- `challenges` - Challenge periods with thresholds and dates
- `auth_tokens` - Magic link tokens with expiry
- `sessions` - User session management
- `mcp_tokens` - MCP API tokens with permissions and scopes
- `mcp_audit_log` - API action audit trail for security