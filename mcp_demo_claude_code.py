#!/usr/bin/env python3
"""
Direct MCP API Demo for Claude Code

This script demonstrates how to use the Step Challenge MCP API
directly within a Claude Code session or similar LLM environment.

Replace YOUR_MCP_TOKEN with an actual token from get_mcp_token.py
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://step-app-4x-yhw.fly.dev"
MCP_TOKEN = "YOUR_MCP_TOKEN"  # Replace with actual token

class StepChallengeMCPDemo:
    def __init__(self, token):
        self.token = token
        self.base_url = BASE_URL
    
    def call_mcp_api(self, method, params=None):
        """Make MCP API call"""
        if params is None:
            params = {}
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": {**params, "token": self.token},
            "id": 1
        }
        
        try:
            response = requests.post(f"{self.base_url}/mcp/rpc", json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": f"Network error: {str(e)}"}
    
    def get_capabilities(self):
        """Get MCP server capabilities (no token needed)"""
        try:
            response = requests.get(f"{self.base_url}/mcp/capabilities")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": f"Failed to get capabilities: {str(e)}"}
    
    def demo_basic_usage(self):
        """Demonstrate basic MCP usage"""
        print("🚀 Step Challenge MCP API Demo")
        print("=" * 50)
        
        # 1. Test capabilities
        print("1️⃣ Testing MCP Capabilities...")
        capabilities = self.get_capabilities()
        if "capabilities" in capabilities:
            tools = [tool["name"] for tool in capabilities["capabilities"]["tools"]]
            print(f"✅ Available tools: {', '.join(tools)}")
        else:
            print(f"❌ Failed to get capabilities: {capabilities}")
            return
        
        # 2. Test user profile
        print("\n2️⃣ Getting User Profile...")
        profile = self.call_mcp_api("get_user_profile")
        if "result" in profile:
            user = profile["result"]["user"]
            print(f"✅ User: {user['name']} ({user['email']})")
            if user.get('team'):
                print(f"   Team: {user['team']}")
            
            # Show token info
            token_info = profile["result"]["token"]
            print(f"   Token expires: {token_info['expires_at']}")
            print(f"   Permissions: {token_info['permissions']}")
        else:
            print(f"❌ Failed to get profile: {profile.get('error', 'Unknown error')}")
            return
        
        # 3. Test adding steps
        print("\n3️⃣ Adding Steps for Today...")
        today = datetime.now().strftime("%Y-%m-%d")
        test_steps = 8750
        
        add_result = self.call_mcp_api("add_steps", {
            "date": today,
            "count": test_steps,
            "allow_overwrite": False
        })
        
        if "result" in add_result:
            result = add_result["result"]
            print(f"✅ Added {result['count']} steps for {result['date']}")
            if result.get('was_overwrite'):
                print(f"   (Overwrote previous value: {result.get('old_count')})")
        else:
            error_msg = add_result.get('error', {}).get('data', 'Unknown error')
            print(f"ℹ️  Add steps result: {error_msg}")
            
            # If steps already exist, try with overwrite
            if "already exist" in error_msg:
                print("   Trying with overwrite enabled...")
                overwrite_result = self.call_mcp_api("add_steps", {
                    "date": today,
                    "count": test_steps + 250,  # Different value
                    "allow_overwrite": True
                })
                
                if "result" in overwrite_result:
                    result = overwrite_result["result"]
                    print(f"✅ Updated to {result['count']} steps (was {result.get('old_count', 'unknown')})")
        
        # 4. Test getting steps
        print("\n4️⃣ Retrieving Step History...")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        steps_result = self.call_mcp_api("get_steps", {
            "start_date": week_ago,
            "end_date": today
        })
        
        if "result" in steps_result:
            steps_data = steps_result["result"]["steps"]
            print(f"✅ Retrieved {len(steps_data)} days of step data")
            
            if steps_data:
                total_steps = sum(day["count"] for day in steps_data)
                avg_steps = total_steps / len(steps_data)
                print(f"   Total steps (last 7 days): {total_steps:,}")
                print(f"   Average per day: {avg_steps:,.0f}")
                
                # Show recent days
                print("   Recent activity:")
                for day in steps_data[-3:]:  # Last 3 days
                    print(f"     {day['date']}: {day['count']:,} steps")
        else:
            print(f"❌ Failed to get steps: {steps_result.get('error', 'Unknown error')}")
        
        print("\n🎉 Demo completed!")
        print("\nNext steps:")
        print("- Replace YOUR_MCP_TOKEN with a real token from get_mcp_token.py")
        print("- Modify the demo to test your specific use cases")
        print("- Integrate with your automation workflows")

def main():
    if MCP_TOKEN == "YOUR_MCP_TOKEN":
        print("❌ Please replace YOUR_MCP_TOKEN with an actual MCP token")
        print("\nTo get a token:")
        print("1. Run: python get_mcp_token.py --interactive")
        print("2. Follow the prompts to create a token")
        print("3. Replace YOUR_MCP_TOKEN in this script")
        return
    
    demo = StepChallengeMCPDemo(MCP_TOKEN)
    demo.demo_basic_usage()

if __name__ == "__main__":
    main()