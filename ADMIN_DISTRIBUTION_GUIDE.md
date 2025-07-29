# Step Challenge MCP - Admin Distribution Guide

This guide helps administrators distribute MCP access to end users of Claude Desktop and Cursor.

## 📦 What To Distribute

Create a distribution package containing these files for your users:

### Required Files:
1. **`mcp_server_anthropic.py`** - The MCP server implementation
2. **`requirements-mcp.txt`** - Python dependencies  
3. **`USER_SETUP_GUIDE.md`** - End user instructions

### Optional Files:
4. **`get_mcp_token.py`** - For admins to create tokens
5. **`test_mcp_python.py`** - For testing/debugging

## 🔑 Token Management Workflow 

### Creating Tokens for Users

1. **Get user information**:
   ```bash
   python get_mcp_token.py --interactive
   ```

2. **Follow the prompts to**:
   - Login with admin credentials
   - Select the user from the list  
   - Configure token settings:
     - **Name**: "Claude Desktop Integration" or similar
     - **Permissions**: `read_write` (for full functionality)
     - **Scopes**: `steps:read,steps:write,profile:read` (default)
     - **Expires**: 30-90 days (your choice)

3. **Provide the token to the user** securely (email, secure chat, etc.)

### Token Settings Recommendations

| User Type | Permissions | Scopes | Expires | Use Case |
|-----------|-------------|--------|---------|----------|
| **Regular User** | `read_write` | `steps:read,steps:write,profile:read` | 30 days | Daily step logging |
| **Power User** | `read_write` | `steps:read,steps:write,profile:read` | 90 days | Automation & reporting |
| **Read-Only** | `read_only` | `steps:read,profile:read` | 30 days | View-only access |

## 📋 User Onboarding Process

### Step 1: Prerequisites Check
Ensure users have:
- [ ] Claude Desktop or Cursor installed
- [ ] Python installed (3.8+ recommended)
- [ ] Basic computer skills (editing files, using terminal)
- [ ] Account in your Step Challenge app

### Step 2: Provide Distribution Package
Send users:
- [ ] The 3 required files listed above
- [ ] Their personal MCP token
- [ ] Your Step Challenge app URL (if different from default)

### Step 3: Support During Setup
Be available to help with:
- [ ] Finding config file locations
- [ ] Editing JSON configuration
- [ ] Installing Python dependencies
- [ ] Testing the connection

## 🛠️ Creating Distribution Packages

### Option A: Simple File Bundle
```bash
# Create distribution folder
mkdir step-challenge-mcp-dist

# Copy required files
cp mcp_server_anthropic.py step-challenge-mcp-dist/
cp requirements-mcp.txt step-challenge-mcp-dist/
cp USER_SETUP_GUIDE.md step-challenge-mcp-dist/

# Create zip file
zip -r step-challenge-mcp.zip step-challenge-mcp-dist/
```

### Option B: With Installer Script
Create an `install.py` script:

```python
#!/usr/bin/env python3
"""
Step Challenge MCP Installer
Helps users set up MCP integration automatically
"""

import os
import json
import platform
from pathlib import Path

def get_claude_config_path():
    """Get Claude Desktop config file path for current OS"""
    system = platform.system()
    if system == "Darwin":  # macOS
        return Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"
    elif system == "Windows":
        return Path(os.environ["APPDATA"]) / "Claude/claude_desktop_config.json"
    else:  # Linux
        return Path.home() / ".config/Claude/claude_desktop_config.json"

def setup_claude_config(token, server_path):
    """Set up Claude Desktop MCP configuration"""
    config_path = get_claude_config_path()
    
    # Create config directory if it doesn't exist
    config_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load existing config or create new
    if config_path.exists():
        with open(config_path, 'r') as f:
            config = json.load(f)
    else:
        config = {}
    
    # Add MCP servers section if it doesn't exist
    if "mcpServers" not in config:
        config["mcpServers"] = {}
    
    # Add step-challenge server
    config["mcpServers"]["step-challenge"] = {
        "command": "python",
        "args": [str(server_path.absolute())],
        "env": {
            "STEP_CHALLENGE_TOKEN": token,
            "STEP_CHALLENGE_URL": "https://step-app-4x-yhw.fly.dev"
        }
    }
    
    # Save config
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✅ Configuration saved to: {config_path}")

def main():
    print("🎯 Step Challenge MCP Installer")
    print("=" * 40)
    
    # Get token from user
    token = input("Enter your MCP token: ").strip()
    if not token:
        print("❌ Token is required")
        return
    
    # Find server file
    server_path = Path("mcp_server_anthropic.py")
    if not server_path.exists():
        print("❌ mcp_server_anthropic.py not found in current directory")
        return
    
    try:
        setup_claude_config(token, server_path)
        print("\n🎉 Setup complete!")
        print("Next steps:")
        print("1. Restart Claude Desktop completely")
        print("2. Start a new conversation")
        print("3. Ask: 'Can you check my step challenge profile?'")
        
    except Exception as e:
        print(f"❌ Setup failed: {e}")

if __name__ == "__main__":
    main()
```

## 📊 Usage Monitoring

### Monitor Token Usage
```bash
# List all MCP tokens and their usage
python get_mcp_token.py --list

# View audit logs for debugging
curl -X GET "https://step-app-4x-yhw.fly.dev/api/admin/mcp-audit?limit=50" \
  --cookie cookies.txt
```

### Common Admin Tasks

**Create bulk tokens:**
```bash
# Create tokens for multiple users
for user_id in 123 124 125; do
  # Use the admin API to create tokens programmatically
  curl -X POST https://step-app-4x-yhw.fly.dev/api/admin/mcp-tokens \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --cookie cookies.txt \
    -d "{\"user_id\": $user_id, \"name\": \"Claude Desktop\", \"expires_days\": 30}"
done
```

**Revoke expired tokens:**
```bash
# List tokens and revoke expired ones
python get_mcp_token.py --list
# Then manually revoke via admin API
```

## 🚨 Troubleshooting for Users

### Most Common Issues:

1. **"MCP server not found"**
   - **Cause**: Incorrect file path in config
   - **Solution**: Use absolute paths, check file exists

2. **"Authentication failed"** 
   - **Cause**: Wrong/expired token
   - **Solution**: Generate new token

3. **"Python not found"**
   - **Cause**: Python not installed or not in PATH
   - **Solution**: Install Python, add to PATH

4. **Config file location issues**
   - **Cause**: User can't find Claude config file
   - **Solution**: Provide exact paths for their OS

### Debug Steps for Admins:

1. **Test token manually**:
   ```bash
   python test_mcp_python.py --token USER_TOKEN
   ```

2. **Check user's account**:
   - Verify user exists in Step Challenge app
   - Check user has proper permissions
   - Confirm user_id matches token

3. **Test MCP server**:
   ```bash
   STEP_CHALLENGE_TOKEN=USER_TOKEN python mcp_server_anthropic.py
   ```

## 📈 Scaling Considerations

### For Large Deployments (50+ users):

1. **Batch token creation**: Create tokens programmatically via API
2. **Automated distribution**: Use IT systems to deploy configs
3. **Monitoring dashboard**: Track token usage and API health
4. **Support documentation**: Create internal wiki/docs
5. **Training sessions**: Host setup workshops for users

### Security Best Practices:

- **Token rotation**: Set reasonable expiration periods (30-90 days)
- **Audit regularly**: Review MCP audit logs monthly
- **Principle of least privilege**: Use read-only tokens where appropriate
- **Secure distribution**: Use secure channels for token delivery
- **Revocation process**: Have procedures for revoking compromised tokens

## 📞 Support Resources

### For End Users:
- Provide `USER_SETUP_GUIDE.md`
- Create internal FAQ/troubleshooting docs  
- Designate technical support contact
- Consider video walkthrough for complex setups

### For Admins:
- Keep `get_mcp_token.py` and admin tools handy
- Monitor API usage and performance
- Plan for token renewal cycles
- Document your specific deployment details

---

**Ready to roll out MCP access to your users? Use this guide to create a smooth onboarding experience!**