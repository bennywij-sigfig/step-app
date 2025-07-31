#!/usr/bin/env python3
"""
MCP Token Management Script

This script helps you obtain and manage MCP tokens for the Step Challenge App.
It provides functions to create tokens via the admin API.

Requirements:
    pip install requests

Usage:
    python get_mcp_token.py --help
"""

import argparse
import json
import getpass
import requests
from typing import Dict, Any, Optional

class StepChallengeAdmin:
    """Admin client for managing MCP tokens"""
    
    def __init__(self, base_url: str = "https://step-app-4x-yhw.fly.dev"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.csrf_token = None
        self.admin_session = None
    
    def login_admin(self, email: str) -> bool:
        """Login as admin user (requires magic link)"""
        print(f"🔐 Initiating admin login for {email}")
        
        # Request magic link
        try:
            response = self.session.post(f"{self.base_url}/send-magic-link", 
                                       json={"email": email})
            response.raise_for_status()
            
            print("✅ Magic link sent to your email")
            print("📧 Please check your email and copy the magic link")
            
            magic_link = input("Paste the magic link here: ").strip()
            
            # Extract token from magic link
            if "/auth/" in magic_link:
                token = magic_link.split("/auth/")[-1].split("?")[0]
                
                # Use the token to authenticate
                auth_response = self.session.get(f"{self.base_url}/auth/{token}")
                auth_response.raise_for_status()
                
                # Get CSRF token
                csrf_response = self.session.get(f"{self.base_url}/api/csrf-token")
                if csrf_response.status_code == 200:
                    self.csrf_token = csrf_response.json().get("token")
                    print("✅ Admin authentication successful")
                    return True
                else:
                    print("❌ Failed to get CSRF token")
                    return False
            else:
                print("❌ Invalid magic link format")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Login failed: {str(e)}")
            return False
    
    def list_mcp_tokens(self) -> Dict[str, Any]:
        """List all MCP tokens"""
        if not self.csrf_token:
            return {"error": "Not authenticated as admin"}
        
        try:
            response = self.session.get(f"{self.base_url}/api/admin/mcp-tokens")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": f"Failed to list tokens: {str(e)}"}
    
    def create_mcp_token(self, user_id: int, name: str, 
                        permissions: str = "read_write",
                        scopes: str = "steps:read,steps:write,profile:read",
                        expires_days: int = 30) -> Dict[str, Any]:
        """Create a new MCP token"""
        if not self.csrf_token:
            return {"error": "Not authenticated as admin"}
        
        payload = {
            "user_id": user_id,
            "name": name,
            "permissions": permissions,
            "scopes": scopes,
            "expires_days": expires_days
        }
        
        headers = {"X-CSRF-Token": self.csrf_token}
        
        try:
            response = self.session.post(f"{self.base_url}/api/admin/mcp-tokens",
                                       json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": f"Failed to create token: {str(e)}"}
    
    def get_users(self) -> Dict[str, Any]:
        """Get list of users"""
        if not self.csrf_token:
            return {"error": "Not authenticated as admin"}
        
        try:
            response = self.session.get(f"{self.base_url}/api/admin/users")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": f"Failed to get users: {str(e)}"}

def print_tokens(tokens):
    """Pretty print MCP tokens"""
    if isinstance(tokens, list) and tokens:
        print("\n📋 Current MCP Tokens:")
        print("=" * 80)
        for token in tokens:
            print(f"ID: {token.get('id')}")
            print(f"Name: {token.get('name')}")
            print(f"User: {token.get('user_name')} ({token.get('user_email')})")
            print(f"Permissions: {token.get('permissions')}")
            print(f"Scopes: {token.get('scopes')}")
            print(f"Expires: {token.get('expires_at')}")
            print(f"Token: {token.get('token')[:20]}...")
            print("-" * 80)
    else:
        print("📋 No MCP tokens found")

def interactive_token_creation():
    """Interactive token creation workflow"""
    print("🎮 Interactive MCP Token Creation")
    print("=" * 50)
    
    base_url = input("Enter base URL (default: https://step-app-4x-yhw.fly.dev): ").strip()
    if not base_url:
        base_url = "https://step-app-4x-yhw.fly.dev"
    
    admin = StepChallengeAdmin(base_url)
    
    # Admin login
    email = input("Enter admin email: ").strip()
    if not admin.login_admin(email):
        print("❌ Failed to authenticate as admin")
        return
    
    # Get users list
    print("\n👥 Getting users list...")
    users_response = admin.get_users()
    if "error" in users_response:
        print(f"❌ Error getting users: {users_response['error']}")
        return
    
    users = users_response.get("users", [])
    if not users:
        print("❌ No users found")
        return
    
    print("\n👥 Available Users:")
    for i, user in enumerate(users):
        print(f"{i+1}. {user.get('name')} ({user.get('email')}) - ID: {user.get('id')}")
    
    # Select user
    try:
        user_choice = int(input("\nSelect user number: ")) - 1
        if user_choice < 0 or user_choice >= len(users):
            print("❌ Invalid user selection")
            return
        selected_user = users[user_choice]
    except ValueError:
        print("❌ Invalid input")
        return
    
    # Token details
    name = input("Enter token name (e.g., 'My App Integration'): ").strip()
    if not name:
        name = "MCP Token"
    
    permissions = input("Enter permissions (read_write/read_only, default: read_write): ").strip()
    if permissions not in ["read_write", "read_only"]:
        permissions = "read_write"
    
    scopes = input("Enter scopes (default: steps:read,steps:write,profile:read): ").strip()
    if not scopes:
        scopes = "steps:read,steps:write,profile:read"
    
    try:
        expires_days = int(input("Enter expiration days (default: 30): ") or "30")
    except ValueError:
        expires_days = 30
    
    # Create token
    print(f"\n🔨 Creating MCP token for {selected_user['name']}...")
    result = admin.create_mcp_token(
        user_id=selected_user['id'],
        name=name,
        permissions=permissions,
        scopes=scopes,
        expires_days=expires_days
    )
    
    if "error" in result:
        print(f"❌ Error creating token: {result['error']}")
    else:
        print("✅ Token created successfully!")
        token_info = result.get("token", {})
        print(f"\n🎟️ Your MCP Token:")
        print("=" * 50)
        print(f"Token: {token_info.get('token')}")
        print(f"Name: {token_info.get('name')}")
        print(f"Permissions: {token_info.get('permissions')}")
        print(f"Scopes: {token_info.get('scopes')}")
        print(f"Expires: {token_info.get('expires_at')}")
        
        print(f"\n💡 Test your token with:")
        print(f"python test_mcp_python.py --token {token_info.get('token')}")

def main():
    parser = argparse.ArgumentParser(description="Manage MCP tokens for Step Challenge App")
    parser.add_argument("--base-url", default="https://step-app-4x-yhw.fly.dev",
                       help="Base URL for the Step Challenge app")
    parser.add_argument("--interactive", action="store_true",
                       help="Interactive token creation mode")
    parser.add_argument("--list", action="store_true",
                       help="List existing MCP tokens (requires admin login)")
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_token_creation()
    elif args.list:
        admin = StepChallengeAdmin(args.base_url)
        email = input("Enter admin email: ").strip()
        if admin.login_admin(email):
            tokens = admin.list_mcp_tokens()
            if "error" in tokens:
                print(f"❌ Error: {tokens['error']}")
            else:
                print_tokens(tokens)
        else:
            print("❌ Failed to authenticate")
    else:
        print("🎯 Step Challenge MCP Token Manager")
        print("=" * 50)
        print("This script helps you create and manage MCP tokens.")
        print("\nOptions:")
        print("  --interactive  Create a new MCP token interactively")
        print("  --list         List existing MCP tokens")
        print("\nFor comprehensive API testing:")
        print("  python test_mcp_python.py --token YOUR_TOKEN")

if __name__ == "__main__":
    main()