# Step Challenge Remote MCP - Admin Distribution Guide

This guide helps administrators distribute remote MCP access to end users of Claude Desktop and Cursor.

## 📦 What To Distribute

With remote MCP servers, distribution is incredibly simple:

### Required Information for Users:
1. **MCP Server URL**: `https://step-app-4x-yhw.fly.dev/mcp`
2. **Their personal MCP token** (generated in admin panel)
3. **Setup instructions** from `USER_SETUP_GUIDE.md`

### No Files Required:
- ❌ No Python files to download
- ❌ No local server installation
- ❌ No complex configuration files
- ✅ Just a URL and token!

## 🔑 Token Management Workflow 

### Creating Tokens for Users

#### Option 1: Web Admin Panel (Recommended)
1. **Login to admin panel**: Visit your Step Challenge app admin section
2. **Navigate to MCP Tokens**: Find the token management interface
3. **Create new token**:
   - **User**: Select from dropdown or enter email
   - **Token Name**: "Claude Desktop Integration" or similar
   - **Permissions**: `read_write` (for full functionality)
   - **Scopes**: `steps:read,steps:write,profile:read` (default)
   - **Expires**: 30-90 days (your choice)
4. **Copy token**: Provide to user securely

#### Option 2: Command Line Tool
```bash
python get_mcp_token.py --interactive
```

### Token Settings Recommendations

| User Type | Permissions | Scopes | Expires | Use Case |
|-----------|-------------|--------|---------|----------|
| **Regular User** | `read_write` | `steps:read,steps:write,profile:read` | 30 days | Daily step logging |
| **Power User** | `read_write` | `steps:read,steps:write,profile:read` | 90 days | Automation & reporting |
| **Read-Only** | `read_only` | `steps:read,profile:read` | 30 days | View-only access |

## 📋 User Onboarding Process

### Step 1: Prerequisites Check
Ensure users have:
- [ ] Claude Desktop, Cursor, or Claude Code installed (MCP does NOT work with web versions)
- [ ] Account in your Step Challenge app
- [ ] Basic computer skills (using settings/preferences menus)

### Step 2: Provide Access Information
Send users:
- [ ] The MCP server URL: `https://step-app-4x-yhw.fly.dev/mcp`
- [ ] Their personal MCP token
- [ ] Link to the `USER_SETUP_GUIDE.md` instructions

### Step 3: Support During Setup
Be available to help with:
- [ ] Finding MCP/Connector settings in their client
- [ ] Entering the server URL and token correctly
- [ ] Testing the initial connection

## 📄 Sample Email Template

```
Subject: Claude Desktop Step Challenge Integration - Your Access Token

Hi [User Name],

You can now connect your Claude Desktop to our Step Challenge app! This will let you update your steps by talking to Claude directly.

Setup Information:
• Server URL: https://step-app-4x-yhw.fly.dev/mcp
• Your personal token: mcp_12345678-abcd-efgh-ijkl-mnopqrstuvwx_a1b2c3d4
• Transport type: Streamable HTTP

Setup instructions: [Attach USER_SETUP_GUIDE.md or provide link]

This is much simpler than before - no Python installation or file downloads required! Just add the server URL and your token to your Claude Desktop settings.

This only works with Claude Desktop, Cursor, or Claude Code - NOT the Claude.ai website.

Questions? Reply to this email or find me on Slack.

Thanks,
[Your Name]
```

## 📊 Usage Monitoring

### Monitor Token Usage via Admin Panel
1. **Login to admin panel**
2. **Navigate to MCP Token Management**
3. **View token activity**:
   - Last used timestamps
   - Request counts
   - Active vs expired tokens
4. **Review MCP audit logs** for detailed activity

### Monitor Token Usage via API
```bash
# List all MCP tokens and their usage
curl -X GET "https://step-app-4x-yhw.fly.dev/api/admin/mcp-tokens" \
  --cookie cookies.txt

# View audit logs for debugging
curl -X GET "https://step-app-4x-yhw.fly.dev/api/admin/mcp-audit?limit=50" \
  --cookie cookies.txt
```

### Common Admin Tasks

**Create bulk tokens via API:**
```bash
# Create tokens for multiple users
for user_id in 123 124 125; do
  curl -X POST https://step-app-4x-yhw.fly.dev/api/admin/mcp-tokens \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    --cookie cookies.txt \
    -d "{\"user_id\": $user_id, \"name\": \"Claude Desktop\", \"expires_days\": 30}"
done
```

**Revoke expired tokens:**
```bash
# Use admin panel or API to revoke tokens
curl -X DELETE https://step-app-4x-yhw.fly.dev/api/admin/mcp-tokens/TOKEN_ID \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  --cookie cookies.txt
```

## 🚨 Troubleshooting for Users

### Most Common Issues:

1. **"MCP server not found" / Connection errors**
   - **Cause**: Incorrect server URL or connectivity issues
   - **Solution**: Verify URL is `https://step-app-4x-yhw.fly.dev/mcp`

2. **"Authentication failed"** 
   - **Cause**: Wrong/expired token
   - **Solution**: Generate new token and provide to user

3. **"Transport not supported"**
   - **Cause**: Client doesn't support Streamable HTTP
   - **Solution**: Ensure client is updated and using `/mcp` endpoint

4. **Settings not found**
   - **Cause**: User can't find MCP/Connector settings
   - **Solution**: Provide client-specific instructions

### Debug Steps for Admins:

1. **Test token manually**:
   ```bash
   # Test with curl
   curl -X POST https://step-app-4x-yhw.fly.dev/mcp \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc": "2.0",
       "method": "get_user_profile",
       "params": {"token": "USER_TOKEN"},
       "id": 1
     }'
   ```

2. **Check user's account**:
   - Verify user exists in Step Challenge app
   - Check user has proper permissions
   - Confirm user_id matches token

3. **Test server connectivity**:
   ```bash
   # Test server is responding
   curl https://step-app-4x-yhw.fly.dev/mcp/capabilities
   ```

## 📈 Scaling Considerations

### For Large Deployments (50+ users):

1. **Batch token creation**: Use admin panel or API for bulk creation
2. **Email templates**: Create standardized onboarding emails
3. **Self-service portal**: Consider allowing users to generate their own tokens
4. **Documentation portal**: Host setup guides on internal wiki
5. **Training videos**: Record setup walkthroughs for different clients

### Security Best Practices:

- **Token rotation**: Set reasonable expiration periods (30-90 days)
- **Audit regularly**: Review MCP audit logs monthly
- **Principle of least privilege**: Use read-only tokens where appropriate
- **Secure distribution**: Use secure channels for token delivery
- **Revocation process**: Have procedures for revoking compromised tokens
- **Monitor usage**: Watch for unusual activity patterns

## 🌟 Advantages of Remote MCP Servers

### For Admins:
- **Zero client-side installation**: No Python or file distribution
- **Centralized management**: All users connect to same server
- **Easy updates**: Server improvements benefit all users instantly
- **Better monitoring**: Complete visibility into usage patterns
- **Simplified support**: Fewer variables in troubleshooting

### For Users:
- **Simple setup**: Just URL and token configuration
- **Cross-device sync**: Same token works on all their devices
- **No maintenance**: No local files to update or manage
- **Better reliability**: Professional server hosting vs local processes
- **Automatic updates**: New features available immediately

## 📞 Support Resources

### For End Users:
- Provide `USER_SETUP_GUIDE.md`
- Create FAQ for common client-specific issues
- Designate technical support contact
- Consider video tutorials for setup process

### For Admins:
- Keep admin panel bookmarked for token management
- Monitor server uptime and performance
- Plan for token renewal cycles
- Document your specific deployment details
- Set up alerts for server issues

## 🔄 Migration from Local MCP Servers

If you previously distributed local Python MCP servers:

### Communication to Users:
```
Subject: Simplified MCP Setup - No More Python Required!

Good news! We've upgraded our Claude Desktop integration to use remote servers.

What this means for you:
✅ No more Python installation
✅ No more file downloads
✅ Much simpler setup process
✅ Better reliability and performance

If you previously set up the local version, you can now:
1. Remove the old Python files and configuration
2. Follow the new simple setup instructions
3. Use the same features with much less complexity

New setup takes less than 2 minutes vs the previous 15+ minute process!
```

### Admin Tasks:
- [ ] Update all documentation and guides
- [ ] Send migration instructions to existing users
- [ ] Archive old Python distribution files
- [ ] Update support processes and troubleshooting guides

---

**Ready to roll out simplified remote MCP access to your users? Use this guide to create a smooth, modern onboarding experience!**