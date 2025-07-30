# Step Challenge Remote MCP Integration for End Users

This guide helps Claude Desktop and Cursor users connect to the Step Challenge app for step tracking via remote MCP servers.

## 🎯 What This Does

Once set up, you can ask Claude Desktop or Cursor to:
- "Add 12,000 steps for today"
- "Show my step progress for this week" 
- "Check if I met my 10,000 step goal yesterday"
- "Update my steps for multiple days"

Claude will automatically interact with your Step Challenge account through the remote server!

## 📋 Prerequisites

- **Claude Desktop** or **Cursor** installed on your computer (MCP does NOT work with Claude.ai webapp)
- An account on the Step Challenge app (contact your admin to get access)
- **No Python, file downloads, or local setup required!**

## 🔑 Step 1: Get Your MCP Token

Contact your Step Challenge administrator and ask them to create an MCP token for your account. They will:

1. Log into the admin panel
2. Create a token specifically for you  
3. Provide you with a token that looks like: `mcp_12345678-abcd-efgh-ijkl-mnopqrstuvwx_a1b2c3d4`

**Keep this token secure** - it provides access to your step data!

## 🔧 Step 2: Configure Your MCP Client

### For Claude Desktop:

1. **Open Claude Desktop Settings**
2. **Navigate to Connectors** (or similar MCP settings section)
3. **Add a new remote MCP server** with these settings:
   - **Name**: `Step Challenge`
   - **URL**: `https://step-app-4x-yhw.fly.dev/mcp`
   - **Transport Type**: `Streamable HTTP`
   - **Authorization Token**: `your_mcp_token_here`

**Alternative JSON Configuration Method:**
If your Claude Desktop uses JSON config files, add this to your config:

```json
{
  "mcpServers": {
    "step-challenge": {
      "type": "url",
      "url": "https://step-app-4x-yhw.fly.dev/mcp",
      "name": "step-challenge",
      "authorization_token": "your_mcp_token_here"
    }
  }
}
```

### For Cursor:

1. **Open Cursor Settings**: Go to Preferences/Settings
2. **Find MCP Configuration**: Look for "MCP Servers" or "Remote Servers"
3. **Add the remote server** using the same settings as Claude Desktop above

### For Claude Code:

Claude Code supports remote MCP servers through project configuration. Add this to your project settings or use the MCP add command:

```bash
claude mcp add --transport http step-challenge https://step-app-4x-yhw.fly.dev/mcp
```

## 🚀 Step 3: Test Your Setup

1. **Restart** your MCP client (Claude Desktop, Cursor, or Claude Code) completely
2. **Start a new conversation**
3. **Ask**: *"Can you check my step challenge profile?"*

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

1. **Check URL** - Make sure you're using `https://step-app-4x-yhw.fly.dev/mcp`
2. **Check token** - Ensure your token is copied correctly with no extra spaces
3. **Check internet** - Make sure you can access the Step Challenge website
4. **Restart completely** - Close and reopen your MCP client

### "Authentication failed":

1. **Check your token** - Make sure it's copied correctly with no extra spaces
2. **Contact admin** - Your token might be expired or revoked
3. **Check server URL** - Ensure you're using the correct URL with `/mcp` endpoint

### Steps not saving:

1. **Check date format** - Use dates like "January 28, 2025" or "2025-01-28"
2. **Check step counts** - Must be between 0 and 70,000
3. **Overwrite protection** - If steps exist, say "update" or "overwrite" in your request

### Server connection issues:

1. **Test in browser** - Visit https://step-app-4x-yhw.fly.dev/ to verify the server is running
2. **Check firewall** - Ensure your firewall allows HTTPS connections
3. **Contact admin** - The server might be experiencing issues

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

## 🆚 What Changed from Local MCP Servers

If you previously used local MCP servers with Python files:

- **✅ No more Python installation required**
- **✅ No more file downloads or local setup**
- **✅ No more complex JSON configuration**
- **✅ Automatic updates when the server is updated**
- **✅ Better security and reliability**
- **✅ Works across all your devices with the same token**

The remote MCP server approach is much simpler and more reliable than the previous local setup!

---

**Ready to start tracking your steps with AI assistance? Follow the setup steps above and start your conversation with Claude!**