"""
Step Challenge Integration for Claude Code

This demonstrates how to use the Step Challenge MCP API directly 
within Claude Code sessions for step tracking automation.

Usage: Replace YOUR_TOKEN and run this code in Claude Code
"""

import requests
import json
from datetime import datetime, timedelta

class StepChallengeAPI:
    def __init__(self, token, base_url="https://step-app-4x-yhw.fly.dev"):
        self.token = token
        self.base_url = base_url
    
    def _call_api(self, method, params=None):
        """Make API call to Step Challenge MCP endpoint"""
        if params is None:
            params = {}
        
        payload = {
            "jsonrpc": "2.0",
            "method": method, 
            "params": {**params, "token": self.token},
            "id": 1
        }
        
        response = requests.post(f"{self.base_url}/mcp/rpc", json=payload)
        return response.json()
    
    def add_steps(self, date, count, allow_overwrite=False):
        """Add steps for a specific date"""
        return self._call_api("add_steps", {
            "date": date,
            "count": count, 
            "allow_overwrite": allow_overwrite
        })
    
    def get_steps(self, start_date=None, end_date=None):
        """Get step history with optional date filtering"""
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._call_api("get_steps", params)
    
    def get_profile(self):
        """Get user profile and token information"""
        return self._call_api("get_user_profile")

# Replace with your actual token from get_mcp_token.py
STEP_TOKEN = "YOUR_MCP_TOKEN_HERE"

# Initialize the API client
step_api = StepChallengeAPI(STEP_TOKEN)

# Example usage functions
def log_daily_steps(steps):
    """Log steps for today"""
    today = datetime.now().strftime("%Y-%m-%d")
    result = step_api.add_steps(today, steps)
    
    if "result" in result:
        print(f"✅ Logged {steps:,} steps for {today}")
        return True
    else:
        error = result.get("error", {}).get("data", "Unknown error")
        print(f"❌ Failed to log steps: {error}")
        return False

def get_weekly_summary():
    """Get weekly step summary"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    result = step_api.get_steps(
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d")
    )
    
    if "result" in result:
        steps_data = result["result"]["steps"]
        if steps_data:
            total = sum(day["count"] for day in steps_data)
            avg = total / len(steps_data)
            print(f"📊 Weekly Summary:")
            print(f"   Total steps: {total:,}")
            print(f"   Average per day: {avg:,.0f}")
            print(f"   Days logged: {len(steps_data)}")
            return steps_data
        else:
            print("📊 No step data found for the past week")
            return []
    else:
        print("❌ Failed to get weekly data")
        return []

def check_profile():
    """Check user profile and token status"""
    result = step_api.get_profile()
    
    if "result" in result:
        user = result["result"]["user"]
        token = result["result"]["token"]
        challenge = result["result"]["active_challenge"]
        
        print(f"👤 User: {user['name']} ({user['email']})")
        if user.get('team'):
            print(f"🏆 Team: {user['team']}")
        print(f"🎟️ Token expires: {token['expires_at']}")
        
        if challenge:
            print(f"🏃 Active Challenge: {challenge['name']}")
            print(f"   Period: {challenge['start_date']} to {challenge['end_date']}")
        else:
            print("🏃 No active challenge")
        
        return result["result"]
    else:
        print("❌ Failed to get profile")
        return None

# Quick test function
def test_connection():
    """Test the API connection"""
    print("🔗 Testing Step Challenge API connection...")
    profile = check_profile()
    if profile:
        print("✅ Connection successful!")
        return True
    else:
        print("❌ Connection failed - check your token")
        return False

# Example automation workflows
def daily_goal_check(goal=10000):
    """Check if daily step goal is met"""
    today = datetime.now().strftime("%Y-%m-%d")
    result = step_api.get_steps(start_date=today, end_date=today)
    
    if "result" in result and result["result"]["steps"]:
        today_steps = result["result"]["steps"][0]["count"]
        if today_steps >= goal:
            print(f"🎯 Daily goal achieved! {today_steps:,} steps (goal: {goal:,})")
        else:
            remaining = goal - today_steps
            print(f"📈 {remaining:,} more steps needed to reach daily goal")
        return today_steps
    else:
        print("📊 No steps logged for today yet")
        return 0

def batch_update_steps(step_data):
    """Update multiple days of step data
    
    Args:
        step_data: dict of {"YYYY-MM-DD": step_count}
    """
    results = []
    for date, steps in step_data.items():
        result = step_api.add_steps(date, steps, allow_overwrite=True)
        if "result" in result:
            print(f"✅ Updated {date}: {steps:,} steps")
            results.append(True)
        else:
            error = result.get("error", {}).get("data", "Unknown error")
            print(f"❌ Failed {date}: {error}")
            results.append(False)
    
    success_count = sum(results)
    print(f"\n📊 Batch update complete: {success_count}/{len(step_data)} successful")
    return results

# Ready-to-use example
if __name__ == "__main__":
    if STEP_TOKEN == "YOUR_MCP_TOKEN_HERE":
        print("❌ Please replace YOUR_MCP_TOKEN_HERE with your actual token")
        print("\nTo get a token:")
        print("1. Run: python get_mcp_token.py --interactive")
        print("2. Copy the token from the output")
        print("3. Replace YOUR_MCP_TOKEN_HERE in this script")
    else:
        # Test the connection
        if test_connection():
            print("\n🎯 Ready to use! Try these functions:")
            print("- log_daily_steps(12000)")
            print("- get_weekly_summary()")
            print("- daily_goal_check(10000)")
            print("- batch_update_steps({'2025-01-28': 9500, '2025-01-29': 11200})")