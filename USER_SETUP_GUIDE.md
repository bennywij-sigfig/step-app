# Step Challenge MCP Integration for End Users

This guide helps Claude Desktop and Cursor users connect to the Step Challenge app for step tracking via MCP.

## 🎯 What This Does

Once set up, you can ask Claude Desktop or Cursor to:
- "Add 12,000 steps for today"
- "Show my step progress for this week" 
- "Check if I met my 10,000 step goal yesterday"
- "Update my steps for multiple days"

Claude will automatically interact with your Step Challenge account!

## 📋 Prerequisites

- **Claude Desktop** or **Cursor** installed on your computer
- An account on the Step Challenge app (contact your admin to get access)
- Basic comfort with editing JSON configuration files

## 🔑 Step 1: Get Your MCP Token

Contact your Step Challenge administrator and ask them to create an MCP token for your account. They will:

1. Log into the admin panel
2. Create a token specifically for you  
3. Provide you with a token that looks like: `mcp_12345678-abcd-efgh-ijkl-mnopqrstuvwx_a1b2c3d4`

**Keep this token secure** - it provides access to your step data!

## 🛠️ Step 2: Download MCP Server Files

Download these files from your Step Challenge repository:
- `mcp_server_anthropic.py`
- `requirements-mcp.txt`

Save them to a permanent location on your computer (e.g., `~/step-challenge-mcp/`)

## ⚙️ Step 3: Install Dependencies

Open your terminal/command prompt and run:

```bash
# Navigate to where you saved the files
cd ~/step-challenge-mcp/

# Install required packages
pip install -r requirements-mcp.txt
```

## 🔧 Step 4: Configure Your MCP Client

### For Claude Desktop:

1. **Find your config file**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the config file** (create it if it doesn't exist):
   ```json
   {
     "mcpServers": {
       "step-challenge": {
         "command": "python",
         "args": ["/absolute/path/to/mcp_server_anthropic.py"],
         "env": {
           "STEP_CHALLENGE_TOKEN": "your_mcp_token_here",
           "STEP_CHALLENGE_URL": "https://step-app-4x-yhw.fly.dev"
         }
       }
     }
   }
   ```

   **Important**: 
   - Replace `/absolute/path/to/mcp_server_anthropic.py` with the full path to where you saved the file
   - Replace `your_mcp_token_here` with the token from your admin
   - Use forward slashes (/) even on Windows

### For Cursor:

1. **Open Cursor Settings**: Go to Preferences/Settings
2. **Find MCP Configuration**: Look for "MCP Servers" or similar
3. **Add the configuration** using the same JSON format as above

## 🚀 Step 5: Test Your Setup

1. **Restart** Claude Desktop or Cursor completely
2. **Start a new conversation**
3. **Ask**: *"Can you check my step challenge profile?"*

If it works, you should see your user information and current challenge details!

## 🎮 Step 6: Start Using Step Tracking

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

## 🚨 Troubleshooting

### "MCP server not found" or similar errors:

1. **Check file paths** - Make sure the path in your config is correct and absolute
2. **Check permissions** - Ensure the Python file is executable
3. **Test Python path** - Try running `python --version` in terminal
4. **Restart completely** - Close and reopen Claude Desktop/Cursor

### "Authentication failed":

1. **Check your token** - Make sure it's copied correctly with no extra spaces
2. **Contact admin** - Your token might be expired or revoked
3. **Check URL** - Ensure the Step Challenge URL is correct

### "Connection errors":

1. **Check internet** - Make sure you can access https://step-app-4x-yhw.fly.dev/
2. **Check firewall** - Ensure your firewall allows the connection
3. **Try browser** - Visit the Step Challenge app in your browser to verify it's working

### Steps not saving:

1. **Check date format** - Use dates like "January 28, 2025" or "2025-01-28"
2. **Check step counts** - Must be between 0 and 70,000
3. **Overwrite protection** - If steps exist, say "update" or "overwrite" in your request

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

---

**Ready to start tracking your steps with AI assistance? Follow the setup steps above and start your conversation with Claude!**