# Step Challenge Remote MCP Integration

Connect your Claude Desktop, Cursor, ChatGPT Desktop, or Claude Code to the Step Challenge app for AI-powered step tracking!

## 🚀 Zero-Installation Setup

**No downloads, no Python installation, no complex setup required!**

1. **Get your MCP token** from your administrator  
2. **Add remote server** to your AI client settings
3. **Start tracking steps** with natural language commands

## 📋 What You Need

- **AI Client**: Claude Desktop, Cursor, ChatGPT Desktop, or Claude Code
- **MCP Token**: Provided by your Step Challenge administrator  
- **Server URL**: `https://step-app-4x-yhw.fly.dev/mcp`
- **2 minutes setup time** (vs previous 15+ minute Python installation)

## 🔧 Setup by AI Client

### Claude Desktop
1. **Open Settings** → **Connectors** (or MCP section)
2. **Add Remote Server**:
   - **Name**: `Step Challenge`
   - **URL**: `https://step-app-4x-yhw.fly.dev/mcp`  
   - **Transport**: `Streamable HTTP`
   - **Token**: `your_mcp_token_here`
3. **Restart Claude Desktop**

### Cursor IDE
1. **Open Settings** → **MCP Servers**
2. **Add Remote Server**:
   - **Name**: `Step Challenge`
   - **URL**: `https://step-app-4x-yhw.fly.dev/mcp`
   - **Transport**: `Streamable HTTP`  
   - **Authorization**: `Bearer your_mcp_token_here`
3. **Restart Cursor**

### ChatGPT Desktop
1. **Settings** → **Connectors** → **Add MCP Server**
2. **Configure**:
   - **Server URL**: `https://step-app-4x-yhw.fly.dev/mcp`
   - **Authorization Token**: `your_mcp_token_here`
3. **Restart ChatGPT Desktop**

### Claude Code (Direct API)
No configuration needed! Just copy this code into any Claude Code session:

```python
import requests
import json
from datetime import datetime

# Replace with your token
STEP_TOKEN = "your_mcp_token_here"

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

# Test it!
profile = call_step_api("get_user_profile")
print(json.dumps(profile, indent=2))
```

## 💬 Once Set Up, You Can Ask Your AI:

- *"Add 12,000 steps for today"*
- *"Show my step progress for this week"*  
- *"Check if I met my 10,000 step goal yesterday"*
- *"Update my steps: Monday was 9,500, Tuesday was 11,200"*
- *"Generate a monthly step report"*
- *"What's my current ranking in the team challenge?"*

## ✅ Test Your Setup

Ask your AI client: *"Can you check my step challenge profile?"*

If it responds with your profile information, you're all set!

## 🆘 Need Help?

### Common Issues:

**"MCP server not found"**  
→ Make sure you restarted your AI client completely

**"Authentication failed"**  
→ Check your token with your administrator - it may be expired

**"Connection refused"**  
→ Verify the server URL: `https://step-app-4x-yhw.fly.dev/mcp`

**"Transport not supported"**  
→ Ensure your client supports Streamable HTTP transport

### Get Support:
1. **Contact your admin** - They can check your token and account status
2. **Test the server** - Visit https://step-app-4x-yhw.fly.dev/mcp/capabilities
3. **Try Claude Code** - Use the direct API approach as a fallback

## 🌟 Advantages of Remote MCP

### For You:
- **Zero installation** - No Python, no file downloads
- **Cross-device sync** - Same token works everywhere  
- **No maintenance** - No local files to update
- **Better reliability** - Professional server hosting
- **Automatic updates** - New features available immediately

### For Your Admin:
- **Simplified distribution** - Just URL + token
- **Centralized management** - One server for all users
- **Better monitoring** - Complete usage visibility
- **Easy updates** - Server improvements benefit everyone instantly

## 🔒 Security Features

- **User isolation** - Your token only accesses your data
- **Rate limiting** - Automatic throttling prevents abuse  
- **Audit logging** - All actions tracked for security
- **Token expiration** - Configurable expiration dates
- **Overwrite protection** - Prevents accidental data loss

---

**Ready to start tracking steps with AI? Get your token from your admin and set up in under 2 minutes!**