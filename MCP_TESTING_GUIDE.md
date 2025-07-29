# Step Challenge MCP Testing Guide

This guide walks you through testing the Model Context Protocol (MCP) API functionality of the Step Challenge App.

## 🎯 Overview

The Step Challenge App provides a secure MCP API that allows programmatic access to step tracking functionality. This guide shows you how to:
1. Obtain an MCP token
2. Test the API using Python scripts
3. Integrate with LLM agents like Claude Code

## 📋 Prerequisites

### 1. Install Python Dependencies
```bash
pip install requests
# OR use the requirements file
pip install -r requirements.txt
```

### 2. Admin Access Required
To create MCP tokens, you need admin privileges on the Step Challenge App. Make sure you have:
- An admin account on https://step-app-4x-yhw.fly.dev/
- Access to the email account associated with your admin user

## 🔑 Step 1: Obtain an MCP Token

### Option A: Interactive Token Creation (Recommended)
```bash
python get_mcp_token.py --interactive
```

This script will:
1. Ask for your admin email
2. Send you a magic link for authentication
3. Show you a list of users in the system
4. Let you create a token for any user
5. Provide the token for testing

### Option B: Manual Token Creation via API

If you prefer to use curl or another tool:

1. **Get admin session**:
   ```bash
   # Send magic link
   curl -X POST https://step-app-4x-yhw.fly.dev/send-magic-link \
     -H "Content-Type: application/json" \
     -d '{"email": "your-admin@example.com"}'
   
   # Use the magic link from your email to authenticate
   # Visit the link in your browser to establish session
   ```

2. **Get CSRF token**:
   ```bash
   curl -X GET https://step-app-4x-yhw.fly.dev/api/csrf-token \
     --cookie-jar cookies.txt
   ```

3. **Create MCP token**:
   ```bash
   curl -X POST https://step-app-4x-yhw.fly.dev/api/admin/mcp-tokens \
     -H "Content-Type: application/json" \
     -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
     --cookie cookies.txt \
     -d '{
       "user_id": 123,
       "name": "Test Token",
       "permissions": "read_write",
       "scopes": "steps:read,steps:write,profile:read",
       "expires_days": 30
     }'
   ```

## 🧪 Step 2: Test the MCP API

### Quick Token Verification
```bash
python test_mcp_python.py --token YOUR_MCP_TOKEN
```

### Comprehensive Testing Suite
```bash
python test_mcp_python.py --token YOUR_MCP_TOKEN --test-all
```

### Interactive Testing
```bash
python test_mcp_python.py --interactive
```

This provides a menu-driven interface to test all MCP functions:
- ✅ Test capabilities discovery
- ✅ Get user profile
- ✅ Add steps with overwrite protection
- ✅ Retrieve step history with date filtering

## 🤖 Step 3: Using with LLM Agents

### Claude Code Integration

You can use the MCP API directly within Claude Code or other LLM environments:

```python
import requests
import json

# Your MCP token from Step 1
MCP_TOKEN = "mcp_12345678-abcd-..."
BASE_URL = "https://step-app-4x-yhw.fly.dev"

def call_mcp_api(method, params):
    """Make MCP API call from within Claude Code"""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": {**params, "token": MCP_TOKEN},
        "id": 1
    }
    
    response = requests.post(f"{BASE_URL}/mcp/rpc", json=payload)
    return response.json()

# Example: Add today's steps
result = call_mcp_api("add_steps", {
    "date": "2025-01-29",
    "count": 10500,
    "allow_overwrite": False
})
print(json.dumps(result, indent=2))

# Example: Get step history
history = call_mcp_api("get_steps", {
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
})
print(json.dumps(history, indent=2))
```

### Other LLM Integrations

The MCP API follows standard JSON-RPC 2.0 protocol, making it compatible with:
- OpenAI Function Calling
- Anthropic Tool Use
- Custom automation scripts
- CI/CD pipelines
- Health monitoring systems

## 📊 Available MCP Methods

### 1. `add_steps` - Add/Update Daily Steps
**Purpose**: Add or update step count for a specific date  
**Security**: Overwrite protection prevents accidental data loss  
**Parameters**:
- `date` (required): YYYY-MM-DD format
- `count` (required): 0-70,000 steps
- `allow_overwrite` (optional): boolean, default false

### 2. `get_steps` - Retrieve Step History
**Purpose**: Get step data with optional date filtering  
**Parameters**:
- `start_date` (optional): YYYY-MM-DD format
- `end_date` (optional): YYYY-MM-DD format

### 3. `get_user_profile` - Get User Information
**Purpose**: Get user details, token info, and active challenge data  
**Parameters**: None (uses token's user context)

## 🔒 Security Features

- **User Isolation**: Tokens only access the owner's data
- **Rate Limiting**: 60 requests/hour + 15 requests/minute per token
- **Scope Validation**: Token permissions enforced (`steps:read`, `steps:write`, `profile:read`)
- **Audit Logging**: All API actions logged with IP addresses
- **Token Expiration**: Configurable expiration dates
- **Overwrite Protection**: Prevents accidental data overwrites

## 🚨 Troubleshooting

### Common Issues

1. **"Authentication failed"**
   - Check that your token is correct and not expired
   - Verify token hasn't been revoked

2. **"Rate limit exceeded"**
   - Wait before making more requests (15/minute, 60/hour)
   - Consider using multiple tokens for higher throughput

3. **"Permission denied"**
   - Check token scopes match the operation
   - Verify token has `read_write` permissions for `add_steps`

4. **"Steps already exist"**
   - Use `allow_overwrite: true` to replace existing data
   - This is a safety feature to prevent accidental overwrites

### Debugging

Enable verbose output in the test scripts:
```bash
python test_mcp_python.py --token YOUR_TOKEN --test-all
```

Check the MCP audit log (admin access required):
```bash
curl -X GET "https://step-app-4x-yhw.fly.dev/api/admin/mcp-audit?page=1&limit=10" \
  --cookie cookies.txt
```

## 🎉 Example Use Cases

### Daily Automation
```python
# Sync steps from fitness tracker
import requests
from datetime import datetime

def sync_daily_steps(steps_from_fitbit):
    today = datetime.now().strftime("%Y-%m-%d")
    
    result = call_mcp_api("add_steps", {
        "date": today,
        "count": steps_from_fitbit,
        "allow_overwrite": True  # Update if already exists
    })
    
    if "result" in result:
        print(f"✅ Synced {steps_from_fitbit} steps for {today}")
    else:
        print(f"❌ Failed to sync: {result.get('error', {}).get('data')}")
```

### Reporting & Analytics
```python
# Generate weekly report
def weekly_report():
    from datetime import datetime, timedelta
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    steps = call_mcp_api("get_steps", {
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d")
    })
    
    if "result" in steps:
        total_steps = sum(day["count"] for day in steps["result"]["steps"])
        avg_steps = total_steps / 7
        print(f"📊 Weekly Report: {total_steps:,} total steps, {avg_steps:,.0f} avg/day")
```

### Health Monitoring
```python
# Check if daily goal met
def check_daily_goal(goal=10000):
    today = datetime.now().strftime("%Y-%m-%d")
    
    steps = call_mcp_api("get_steps", {
        "start_date": today,
        "end_date": today
    })
    
    if "result" in steps and steps["result"]["steps"]:
        today_steps = steps["result"]["steps"][0]["count"]
        if today_steps >= goal:
            print(f"🎯 Goal achieved! {today_steps:,} steps (goal: {goal:,})")
        else:
            remaining = goal - today_steps
            print(f"📈 Keep going! {remaining:,} steps to reach goal")
```

## 🔗 Next Steps

1. **Create your first MCP token** using the interactive script
2. **Run the comprehensive test suite** to verify functionality
3. **Integrate with your automation tools** using the API examples
4. **Monitor usage** through the admin audit logs
5. **Scale up** by creating additional tokens as needed

For more advanced usage, see the complete API documentation in the main README.md file.