# Adding Step Challenge to Claude Code

This guide shows you two ways to integrate the Step Challenge App with Claude Code.

## 🎯 **Quick Start: Direct API Usage** (Recommended)

This is the simplest approach - use the Step Challenge API directly in Claude Code sessions.

### Step 1: Get Your MCP Token
```bash
python get_mcp_token.py --interactive
```

### Step 2: Use in Claude Code
Copy this code into any Claude Code session:

```python
import requests
import json
from datetime import datetime

# Replace with your actual token
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
    
    response = requests.post("https://step-app-4x-yhw.fly.dev/mcp/rpc", json=payload)
    return response.json()

# Test it!
profile = call_step_api("get_user_profile")
print(json.dumps(profile, indent=2))

# Add today's steps
today = datetime.now().strftime("%Y-%m-%d")
result = call_step_api("add_steps", {
    "date": today,
    "count": 12000,
    "allow_overwrite": False
})
print(json.dumps(result, indent=2))
```

### Step 3: Use the Helper Functions
For easier usage, copy the `claude_code_integration.py` file contents into Claude Code and use functions like:

```python
# After copying claude_code_integration.py content and setting your token:

# Log steps for today
log_daily_steps(11500)

# Get weekly summary  
get_weekly_summary()

# Check daily goal progress
daily_goal_check(10000)

# Batch update multiple days
batch_update_steps({
    '2025-01-27': 9200,
    '2025-01-28': 10800,
    '2025-01-29': 12100
})
```

---

## 🛠️ **Advanced: Official MCP Server** (For power users)

This creates a proper Anthropic MCP server that Claude Code can connect to officially.

### Step 1: Install MCP Dependencies
```bash
pip install mcp
```

### Step 2: Get Your Token
```bash
python get_mcp_token.py --interactive
```

### Step 3: Set Up MCP Server
1. **Test the server**:
   ```bash
   export STEP_CHALLENGE_TOKEN="your_token_here"
   python mcp_server_anthropic.py
   ```

2. **Find your Claude Code settings**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

3. **Add to Claude Code MCP configuration**:
   ```json
   {
     "mcpServers": {
       "step-challenge": {
         "command": "python",
         "args": ["/absolute/path/to/mcp_server_anthropic.py"],
         "env": {
           "STEP_CHALLENGE_TOKEN": "your_mcp_token_here"
         }
       }
     }
   }
   ```

4. **Restart Claude Code**

### Step 4: Use MCP Tools in Claude Code
Once configured, you can ask Claude Code to:

- "Add 12,000 steps for today using the step challenge tool"
- "Get my step summary for the last week"  
- "Check if I met my 10,000 step goal yesterday"
- "Show my step challenge profile"

Claude Code will automatically use the MCP tools to interact with your Step Challenge account.

---

## 🆚 **Which Approach Should You Use?**

### **Use Direct API (Approach #1) if:**
- ✅ You want to get started quickly
- ✅ You're comfortable copying code into Claude Code sessions
- ✅ You want full control over the API interactions
- ✅ You don't mind re-importing helper functions each session

### **Use Official MCP Server (Approach #2) if:**
- ✅ You want Claude Code to automatically know about step tracking
- ✅ You prefer natural language commands ("add my steps")
- ✅ You want persistent integration across all Claude Code sessions
- ✅ You're comfortable with more advanced setup

---

## 🧪 **Testing Your Setup**

### For Direct API Approach:
```python
# Test connection
result = call_step_api("get_user_profile")
if "result" in result:
    print("✅ Connected successfully!")
    print(f"User: {result['result']['user']['name']}")
else:
    print("❌ Connection failed")
    print(result.get('error'))
```

### For MCP Server Approach:
Ask Claude Code: *"Can you check my step challenge profile?"*

If it responds with your profile information, the MCP server is working correctly.

---

## 🎯 **Example Use Cases**

### Daily Step Logging
```python
# Log steps from your fitness tracker
def sync_from_fitbit(fitbit_steps):
    today = datetime.now().strftime("%Y-%m-%d")
    return call_step_api("add_steps", {
        "date": today,
        "count": fitbit_steps,
        "allow_overwrite": True
    })
```

### Weekly Reports
```python
# Generate weekly report
def generate_report():
    from datetime import timedelta
    end = datetime.now()
    start = end - timedelta(days=7)
    
    result = call_step_api("get_steps", {
        "start_date": start.strftime("%Y-%m-%d"),
        "end_date": end.strftime("%Y-%m-%d")
    })
    
    if "result" in result:
        steps = result["result"]["steps"]
        total = sum(day["count"] for day in steps)
        print(f"Week total: {total:,} steps")
        print(f"Daily average: {total/len(steps):,.0f} steps")
```

### Goal Tracking
```python
# Check goal progress
def check_goal(target=10000):
    today = datetime.now().strftime("%Y-%m-%d")
    result = call_step_api("get_steps", {
        "start_date": today,
        "end_date": today
    })
    
    if "result" in result and result["result"]["steps"]:
        steps = result["result"]["steps"][0]["count"]
        if steps >= target:
            print(f"🎯 Goal achieved! {steps:,} steps")
        else:
            remaining = target - steps
            print(f"📈 {remaining:,} steps to go!")
```

---

## 🔧 **Troubleshooting**

### Common Issues:

1. **"Authentication failed"**
   - Verify your token is correct and not expired
   - Run `python get_mcp_token.py --list` to check token status

2. **"Module not found" errors**
   - Install required packages: `pip install requests`
   - For MCP server: `pip install mcp`

3. **MCP server not connecting**
   - Check the file path in your configuration is absolute
   - Verify the token environment variable is set correctly
   - Restart Claude Code after configuration changes

4. **API errors**
   - Check rate limits (60/hour, 15/minute per token)
   - Verify dates are in YYYY-MM-DD format
   - Check step counts are between 0-70,000

### Getting Help:
- Test your token: `python test_mcp_python.py --token YOUR_TOKEN`
- Check API status: Visit https://step-app-4x-yhw.fly.dev/mcp/capabilities
- View logs: Check the MCP audit logs via admin panel

---

## 🎉 **You're Ready!**

Choose your preferred approach and start integrating step tracking into your Claude Code workflows. The Step Challenge API provides secure, rate-limited access to all your step data with comprehensive audit logging.