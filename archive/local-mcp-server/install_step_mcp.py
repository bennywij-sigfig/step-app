#!/usr/bin/env python3
"""
Step Challenge MCP Auto-Installer

This script automatically configures Claude Desktop or Cursor
to connect to your Step Challenge app via MCP.

Usage:
    python install_step_mcp.py
"""

import os
import json
import platform
import subprocess
import sys
from pathlib import Path

def check_python_version():
    """Check if Python version is sufficient"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required")
        print(f"   Current version: {sys.version}")
        return False
    return True

def install_dependencies():
    """Install required Python packages"""
    print("📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements-mcp.txt"])
        print("✅ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install dependencies")
        print("   Try running: pip install requests mcp")
        return False
    except FileNotFoundError:
        print("❌ requirements-mcp.txt not found")
        print("   Try running: pip install requests mcp")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "mcp"])
            print("✅ Dependencies installed successfully")
            return True
        except subprocess.CalledProcessError:
            print("❌ Failed to install dependencies manually")
            return False

def get_claude_config_path():
    """Get Claude Desktop config file path for current OS"""
    system = platform.system()
    if system == "Darwin":  # macOS
        return Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            print("❌ APPDATA environment variable not found")
            return None
        return Path(appdata) / "Claude/claude_desktop_config.json"
    else:  # Linux
        return Path.home() / ".config/Claude/claude_desktop_config.json"

def setup_claude_config(token, server_path, step_url):
    """Set up Claude Desktop MCP configuration"""
    config_path = get_claude_config_path()
    if not config_path:
        return False
    
    print(f"📝 Configuring Claude Desktop at: {config_path}")
    
    # Create config directory if it doesn't exist
    config_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load existing config or create new
    config = {}
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
        except json.JSONDecodeError:
            print("⚠️  Existing config file has invalid JSON, creating backup...")
            backup_path = config_path.with_suffix('.json.backup')
            config_path.rename(backup_path)
            print(f"   Backup saved as: {backup_path}")
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
            "STEP_CHALLENGE_URL": step_url
        }
    }
    
    # Save config
    try:
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        print("✅ Claude Desktop configuration updated")
        return True
    except Exception as e:
        print(f"❌ Failed to save configuration: {e}")
        return False

def test_connection(token, step_url):
    """Test the MCP connection"""
    print("🔍 Testing connection to Step Challenge...")
    
    try:
        import requests
        
        # Test basic connectivity
        response = requests.get(f"{step_url}/mcp/capabilities", timeout=10)
        if response.status_code != 200:
            print(f"❌ Step Challenge server not responding (status: {response.status_code})")
            return False
        
        # Test token authentication
        payload = {
            "jsonrpc": "2.0",
            "method": "get_user_profile",
            "params": {"token": token},
            "id": 1
        }
        
        response = requests.post(f"{step_url}/mcp/rpc", json=payload, timeout=10)
        result = response.json()
        
        if "result" in result:
            user = result["result"]["user"]
            print(f"✅ Connection successful!")
            print(f"   User: {user['name']} ({user['email']})")
            if user.get('team'):
                print(f"   Team: {user['team']}")
            return True
        else:
            error = result.get("error", {})
            print(f"❌ Authentication failed: {error.get('data', 'Invalid token')}")
            return False
            
    except ImportError:
        print("❌ 'requests' package not available for testing")
        return False
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False

def main():
    print("🎯 Step Challenge MCP Auto-Installer")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        return
    
    # Check for required files
    server_path = Path("mcp_server_anthropic.py")
    if not server_path.exists():
        print("❌ mcp_server_anthropic.py not found in current directory")
        print("   Please ensure you have all the required files")
        return
    
    # Install dependencies
    if not install_dependencies():
        print("❌ Failed to install dependencies. Please install manually:")
        print("   pip install requests mcp")
        return
    
    # Get configuration from user
    print("\n🔧 Configuration Setup")
    print("-" * 30)
    
    token = input("Enter your MCP token: ").strip()
    if not token:
        print("❌ Token is required")
        return
    
    step_url = input("Enter Step Challenge URL (press Enter for default): ").strip()
    if not step_url:
        step_url = "https://step-app-4x-yhw.fly.dev"
    
    # Test connection first
    if not test_connection(token, step_url):
        print("\n❌ Connection test failed. Please check your token and URL.")
        retry = input("Continue with setup anyway? (y/N): ").strip().lower()
        if retry != 'y':
            return
    
    # Set up Claude Desktop configuration
    print(f"\n⚙️  Setting up Claude Desktop...")
    if not setup_claude_config(token, server_path, step_url):
        return
    
    print("\n🎉 Installation Complete!")
    print("=" * 50)
    print("Next steps:")
    print("1. 🔄 Restart Claude Desktop completely (quit and reopen)")
    print("2. 💬 Start a new conversation")
    print("3. 🧪 Test by asking: 'Can you check my step challenge profile?'")
    print("\nIf it works, you should see your user information!")
    print("\nExample commands to try:")
    print("• 'Add 12,000 steps for today'")
    print("• 'Show my step summary for this week'")
    print("• 'Check if I met my 10,000 step goal yesterday'")
    
    # Offer to test MCP server directly
    test_direct = input("\n🔍 Would you like to test the MCP server directly? (y/N): ").strip().lower()
    if test_direct == 'y':
        print("\n🧪 Testing MCP server directly...")
        print("Press Ctrl+C to stop the test")
        
        try:
            env = os.environ.copy()
            env["STEP_CHALLENGE_TOKEN"] = token
            env["STEP_CHALLENGE_URL"] = step_url
            
            subprocess.run([sys.executable, str(server_path)], env=env)
        except KeyboardInterrupt:
            print("\n✅ MCP server test stopped")
        except Exception as e:
            print(f"\n❌ MCP server test failed: {e}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Installation cancelled by user")
    except Exception as e:
        print(f"\n❌ Installation failed: {e}")
        print("Please check the error message and try again")