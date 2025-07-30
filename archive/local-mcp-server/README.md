# Local MCP Server Files (Archived)

These files were part of the original local MCP server implementation that required Python installation on end-user machines.

## What Changed

As of July 30, 2025, we migrated to a **remote MCP server** approach that eliminates the need for local Python installations.

## Archived Files

- `mcp_server_anthropic.py` - Local MCP server that ran on user machines
- `install_step_mcp.py` - Python installer script for setting up local servers
- `claude_code_integration.py` - Direct API client for Claude Code integration
- `requirements-mcp.txt` - Python dependencies required for local setup

## Why We Migrated

### Problems with Local MCP Servers:
- ❌ Required Python installation on every user machine
- ❌ Complex setup process (15+ minutes)
- ❌ File distribution challenges
- ❌ Version management and updates
- ❌ Platform-specific configuration issues
- ❌ Limited adoption in corporate environments

### Benefits of Remote MCP Server:
- ✅ Zero installation required for end users
- ✅ Simple setup (2 minutes: URL + token)
- ✅ Centralized management and updates
- ✅ Better security and monitoring
- ✅ Cross-platform compatibility
- ✅ Higher adoption rates

## Current Implementation

Users now connect to the remote MCP server at:
- **URL**: `https://step-app-4x-yhw.fly.dev/mcp`
- **Transport**: Streamable HTTP
- **Authentication**: Token-based

See the current `USER_SETUP_GUIDE.md` for modern setup instructions.

## Historical Context

These files represent our initial MCP implementation following Anthropic's local server patterns. While functional, the remote server approach proved much more practical for enterprise deployment.

---

*Files archived on July 30, 2025 during migration to remote MCP server architecture.*