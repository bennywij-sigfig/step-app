# Step Challenge Node.js MCP Server Setup Guide (Alternate Approach)

**Note**: This guide covers the Node.js MCP server approach. **For the simpler Python bridge approach (recommended for most users), visit the web-based setup page at https://step-app-4x-yhw.fly.dev/mcp-setup**

This guide helps advanced users set up the Node.js MCP server for Claude Desktop, Cursor, and Claude Code integration.

## 🎯 What This Does

Once set up, you can ask Claude Desktop, Cursor, or Claude Code to:
- "Add 12,000 steps for today"
- "Show my step progress for this week" 
- "Check if I met my 10,000 step goal yesterday"
- "Update my steps for multiple days"

Claude will automatically interact with your Step Challenge account through the local MCP server!

## 📋 Prerequisites

- **Claude Desktop**, **Cursor**, or **Claude Code** installed on your computer (MCP does NOT work with Claude.ai webapp)
- **Node.js** installed on your system (required for this advanced approach)
- An account on the Step Challenge app (contact your admin to get access)
- The Step Challenge MCP server files (provided by your admin)

**💡 Tip**: If you don't have Node.js or prefer a simpler setup, use the Python bridge approach at https://step-app-4x-yhw.fly.dev/mcp-setup

## 🔑 Step 1: Get Your MCP Token and Server Files

Contact your Step Challenge administrator to get:

1. **MCP Token**: A token that looks like `mcp_12345678-abcd-efgh-ijkl-mnopqrstuvwx_a1b2c3d4`
2. **Server Files**: The Step Challenge MCP server directory containing `mcp-server.js` and related files  
3. **Setup Instructions**: This guide for the Node.js approach

**💡 Alternative**: Get your token directly from https://step-app-4x-yhw.fly.dev/mcp-setup if you have access

**Keep this token secure** - it provides access to your step data!

## 🔧 Step 2: Configure Your MCP Client

### For Claude Desktop:

1. **Locate your Claude Desktop configuration directory**:
   - **macOS**: `~/Library/Application Support/Claude/`
   - **Windows**: `%APPDATA%\Claude\`
   - **Linux**: `~/.config/claude/`

2. **Create or edit `claude_desktop_config.json`** in the configuration directory:

```json
{
  "mcpServers": {
    "step-challenge": {
      "command": "node",
      "args": ["/path/to/step-challenge/mcp-server.js"],
      "env": {
        "STEP_CHALLENGE_TOKEN": "your_mcp_token_here"
      }
    }
  }
}
```

**Replace `/path/to/step-challenge/mcp-server.js` with the actual path to your MCP server file.**

### For Cursor:

1. **Open Cursor Settings**: Go to Preferences/Settings
2. **Find MCP Configuration**: Look for "MCP Servers" or "Extensions"
3. **Add a new MCP server** with:
   - **Command**: `node`
   - **Args**: `["/path/to/step-challenge/mcp-server.js"]`
   - **Environment Variables**: `STEP_CHALLENGE_TOKEN=your_mcp_token_here`

### For Claude Code:

1. **Create a `claude.json` file** in your project root or home directory:

```json
{
  "mcpServers": {
    "step-challenge": {
      "command": "node",
      "args": ["/path/to/step-challenge/mcp-server.js"],
      "env": {
        "STEP_CHALLENGE_TOKEN": "your_mcp_token_here"
      }
    }
  }
}
```

**Configuration File Locations for Claude Code:**
- **Project-specific**: `./claude.json` (in your current directory)
- **User-wide**: `~/.config/claude/claude.json` (macOS/Linux) or `%APPDATA%\claude\claude.json` (Windows)
- **Environment variable**: Set `CLAUDE_CONFIG_PATH` to point to your config file

## 🚀 Step 3: Test Your Setup

1. **Ensure Node.js is installed**: Run `node --version` in your terminal
2. **Test the MCP server directly** (optional):
   ```bash
   STEP_CHALLENGE_TOKEN=your_token_here node /path/to/step-challenge/mcp-server.js
   ```
3. **Restart** your MCP client (Claude Desktop, Cursor, or Claude Code) completely
4. **Start a new conversation**
5. **Ask**: *"Can you check my step challenge profile?"*

If it works, you should see your user information and current challenge details!

## 🎮 Step 4: Start Using Step Tracking

### Basic Commands:

**Add steps for today:**
> "Add 12,500 steps for today in my step challenge"

**Check yesterday's progress:**
> "How many steps did I log yesterday?"

**Get weekly summary:**
> "Show me my step summary for the last 7 days"

**Check goal progress:**
> "Did I meet my 10,000 step goal today?"

**Add steps for specific date:**
> "Add 9,800 steps for January 28th, 2025"

**Update multiple days:**
> "I need to update my steps: January 26th was 11,200 steps, January 27th was 9,500 steps"

### Advanced Usage:

**Monthly report:**
> "Generate a report of my step activity for the last 30 days"

**Goal analysis:**
> "Check how many days this month I've met my 10,000 step goal"

**Team comparison:**
> "Show me my profile and team information"

## 🔒 Security & Privacy

- **Your token is personal** - don't share it with others
- **Token expires** - contact your admin if it stops working
- **Rate limits** - You can make up to 60 requests per hour and 15 per minute
- **Audit logging** - All your API actions are logged for security (admins can see this)
- **Data isolation** - You can only access your own step data
- **Secure transport** - All communication is encrypted via HTTPS

## 🚨 Troubleshooting

### "MCP server not found" or connection errors:

1. **Check Node.js** - Ensure Node.js is installed and accessible: `node --version`
2. **Check file path** - Verify the path to `mcp-server.js` is correct and accessible
3. **Check token** - Ensure your token is copied correctly with no extra spaces
4. **Check permissions** - Make sure the MCP server file is readable
5. **Test manually** - Try running the server directly: `STEP_CHALLENGE_TOKEN=your_token node /path/to/mcp-server.js`
6. **Restart completely** - Close and reopen your MCP client

### "Authentication failed":

1. **Check your token** - Make sure it's copied correctly with no extra spaces
2. **Contact admin** - Your token might be expired or revoked
3. **Check server URL** - Ensure you're using the correct URL with `/mcp` endpoint

### Steps not saving:

1. **Check date format** - Use dates like "January 28, 2025" or "2025-01-28"
2. **Check step counts** - Must be between 0 and 70,000
3. **Overwrite protection** - If steps exist, say "update" or "overwrite" in your request

### Local server issues:

1. **Check server logs** - Look at the console output when the MCP server starts
2. **Verify network access** - Ensure your system can reach https://step-app-4x-yhw.fly.dev/
3. **Check Node.js version** - The server requires Node.js 14 or higher
4. **Contact admin** - The remote API might be experiencing issues

## 📞 Getting Help

If you're having issues:

1. **Contact your Step Challenge admin** - They can check your token and account status
2. **Test the web app** - Make sure you can log in normally at the Step Challenge website
3. **Check with IT** - If you're on a corporate network, there might be restrictions

## 💡 Tips for Best Experience

- **Be specific with dates**: "today", "yesterday", "January 28th" all work
- **Natural language**: You don't need exact commands - Claude understands context
- **Ask for summaries**: "Show me my progress this week" gives you detailed analysis
- **Batch updates**: You can update multiple days in one request
- **Check goals**: Ask about goal progress to stay motivated

## 🎉 Example Conversation

```
You: "Add 11,500 steps for today"
Claude: "✅ Successfully added 11,500 steps for 2025-01-29"

You: "How am I doing this week?"
Claude: "📊 7-Day Step Summary:
• Total steps: 67,800
• Average per day: 9,686
• Highest day: 2025-01-27 (12,100 steps)
• Lowest day: 2025-01-24 (8,200 steps)
• Days with data: 7/7"

You: "Did I meet my goal today?"
Claude: "🎯 Daily goal achieved for 2025-01-29!
Steps: 11,500 (goal: 10,000)
Exceeded by: 1,500 steps"
```

## 🆚 Advantages of Local Stdio MCP Setup

This local stdio MCP server approach provides:

- **✅ Direct control** - Server runs locally on your machine
- **✅ No network dependencies** - Works offline after initial token validation
- **✅ Better privacy** - Data processing happens locally
- **✅ Faster response times** - No network latency for MCP operations
- **✅ Customizable** - You can modify the server behavior if needed
- **✅ Standards compliant** - Uses official MCP stdio protocol

**Trade-offs compared to remote setup:**
- **Requires Node.js installation** - You need Node.js on your system
- **Manual updates** - Server files need to be updated manually when available
- **Local setup** - Requires configuration file creation and path management

---

**Ready to start tracking your steps with AI assistance? Follow the setup steps above and start your conversation with Claude!**