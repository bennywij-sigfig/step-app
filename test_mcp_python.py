#!/usr/bin/env python3
"""
Step Challenge MCP API Test Script

This script demonstrates how to interact with the Step Challenge App's MCP API
using Python. It provides functions to test all available MCP methods.

Requirements:
    pip install requests

Usage:
    python test_mcp_python.py --token YOUR_MCP_TOKEN
    python test_mcp_python.py --interactive  # Interactive mode for testing
"""

import argparse
import json
import requests
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import sys

class StepChallengeMCP:
    """Client for interacting with Step Challenge MCP API"""
    
    def __init__(self, base_url: str = "https://step-app-4x-yhw.fly.dev", token: str = None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'StepChallenge-MCP-Test/1.0'
        })
    
    def _make_rpc_call(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make a JSON-RPC 2.0 call to the MCP API"""
        if not self.token:
            raise ValueError("MCP token is required for API calls")
        
        # Add token to parameters
        params_with_token = params.copy()
        params_with_token['token'] = self.token
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params_with_token,
            "id": 1
        }
        
        try:
            response = self.session.post(f"{self.base_url}/mcp/rpc", json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "error": {
                    "code": -32603,
                    "message": f"Network error: {str(e)}"
                }
            }
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get MCP server capabilities (no token required)"""
        try:
            response = self.session.get(f"{self.base_url}/mcp/capabilities")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": f"Failed to get capabilities: {str(e)}"}
    
    def add_steps(self, date: str, count: int, allow_overwrite: bool = False) -> Dict[str, Any]:
        """Add or update steps for a specific date"""
        params = {
            "date": date,
            "count": count,
            "allow_overwrite": allow_overwrite
        }
        return self._make_rpc_call("add_steps", params)
    
    def get_steps(self, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
        """Retrieve step history with optional date filtering"""
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._make_rpc_call("get_steps", params)
    
    def get_user_profile(self) -> Dict[str, Any]:
        """Get user profile information"""
        return self._make_rpc_call("get_user_profile", {})

def print_response(response: Dict[str, Any], title: str = "Response"):
    """Pretty print API response"""
    print(f"\n🔄 {title}")
    print("=" * 50)
    if "error" in response:
        print(f"❌ Error: {response['error']}")
        if isinstance(response['error'], dict):
            print(f"   Code: {response['error'].get('code', 'Unknown')}")
            print(f"   Message: {response['error'].get('message', 'No message')}")
            if 'data' in response['error']:
                print(f"   Data: {response['error']['data']}")
    elif "result" in response:
        print("✅ Success:")
        print(json.dumps(response["result"], indent=2))
    else:
        print(json.dumps(response, indent=2))
    print()

def test_capabilities(client: StepChallengeMCP):
    """Test MCP capabilities discovery"""
    print("🧪 Testing MCP Capabilities Discovery...")
    capabilities = client.get_capabilities()
    print_response(capabilities, "MCP Capabilities")
    
    if "capabilities" in capabilities and "tools" in capabilities["capabilities"]:
        tools = capabilities["capabilities"]["tools"]
        print(f"📋 Available Tools: {', '.join([tool['name'] for tool in tools])}")
        return True
    return False

def test_user_profile(client: StepChallengeMCP):
    """Test getting user profile"""
    print("🧪 Testing User Profile Retrieval...")
    profile = client.get_user_profile()
    print_response(profile, "User Profile")
    return "result" in profile

def test_add_steps(client: StepChallengeMCP):
    """Test adding steps"""
    print("🧪 Testing Step Addition...")
    
    # Test with today's date
    today = datetime.now().strftime("%Y-%m-%d")
    test_count = 8500
    
    print(f"Adding {test_count} steps for {today}")
    result = client.add_steps(today, test_count)
    print_response(result, f"Add Steps ({today})")
    
    # Test overwrite protection
    if "result" in result:
        print("🧪 Testing Overwrite Protection...")
        result2 = client.add_steps(today, 9000, allow_overwrite=False)
        print_response(result2, "Overwrite Protection Test")
        
        if "error" in result2:
            print("✅ Overwrite protection working correctly!")
            
            # Now test with overwrite allowed
            print("🧪 Testing Overwrite With Permission...")
            result3 = client.add_steps(today, 9500, allow_overwrite=True)
            print_response(result3, "Overwrite With Permission")
            return "result" in result3
    
    return "result" in result

def test_get_steps(client: StepChallengeMCP):
    """Test retrieving steps"""
    print("🧪 Testing Step Retrieval...")
    
    # Get all steps
    all_steps = client.get_steps()
    print_response(all_steps, "All Steps")
    
    # Get steps for last 7 days
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    
    recent_steps = client.get_steps(start_date, end_date)
    print_response(recent_steps, f"Steps ({start_date} to {end_date})")
    
    return "result" in all_steps

def run_comprehensive_test(client: StepChallengeMCP):
    """Run comprehensive MCP API tests"""
    print("🚀 Starting Comprehensive MCP API Test")
    print("=" * 50)
    
    results = {}
    
    # Test 1: Capabilities
    results["capabilities"] = test_capabilities(client)
    
    # Test 2: User Profile
    results["profile"] = test_user_profile(client)
    
    # Test 3: Add Steps
    results["add_steps"] = test_add_steps(client)
    
    # Test 4: Get Steps
    results["get_steps"] = test_get_steps(client)
    
    # Summary
    print("\n📊 Test Summary")
    print("=" * 50)
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title()}: {status}")
    
    total_tests = len(results)
    passed_tests = sum(results.values())
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! MCP API is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the output above for details.")

def interactive_mode():
    """Interactive mode for testing MCP API"""
    print("🎮 Interactive MCP Testing Mode")
    print("=" * 50)
    
    base_url = input("Enter base URL (default: https://step-app-4x-yhw.fly.dev): ").strip()
    if not base_url:
        base_url = "https://step-app-4x-yhw.fly.dev"
    
    token = input("Enter your MCP token: ").strip()
    if not token:
        print("❌ Token is required for testing")
        return
    
    client = StepChallengeMCP(base_url, token)
    
    while True:
        print("\n🎯 Available Actions:")
        print("1. Test Capabilities")
        print("2. Get User Profile")
        print("3. Add Steps")
        print("4. Get Steps")
        print("5. Run All Tests")
        print("6. Exit")
        
        choice = input("\nEnter your choice (1-6): ").strip()
        
        if choice == "1":
            test_capabilities(client)
        elif choice == "2":
            test_user_profile(client)
        elif choice == "3":
            date = input("Enter date (YYYY-MM-DD, default today): ").strip()
            if not date:
                date = datetime.now().strftime("%Y-%m-%d")
            try:
                count = int(input("Enter step count: "))
                overwrite = input("Allow overwrite? (y/n, default n): ").strip().lower() == 'y'
                result = client.add_steps(date, count, overwrite)
                print_response(result, f"Add Steps ({date})")
            except ValueError:
                print("❌ Invalid step count")
        elif choice == "4":
            start = input("Start date (YYYY-MM-DD, optional): ").strip() or None
            end = input("End date (YYYY-MM-DD, optional): ").strip() or None
            result = client.get_steps(start, end)
            print_response(result, "Get Steps")
        elif choice == "5":
            run_comprehensive_test(client)
        elif choice == "6":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice")

def main():
    parser = argparse.ArgumentParser(description="Test Step Challenge MCP API")
    parser.add_argument("--token", help="MCP authentication token")
    parser.add_argument("--base-url", default="https://step-app-4x-yhw.fly.dev", 
                       help="Base URL for the Step Challenge app")
    parser.add_argument("--interactive", action="store_true", 
                       help="Run in interactive mode")
    parser.add_argument("--test-all", action="store_true",
                       help="Run comprehensive test suite")
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_mode()
        return
    
    if not args.token:
        print("❌ Error: MCP token is required")
        print("\nTo obtain an MCP token:")
        print("1. Log into the admin panel at your Step Challenge app")
        print("2. Use the admin API to create a token (see README.md)")
        print("3. Or run this script with --interactive for guided setup")
        sys.exit(1)
    
    client = StepChallengeMCP(args.base_url, args.token)
    
    if args.test_all:
        run_comprehensive_test(client)
    else:
        # Quick verification
        print("🔍 Quick MCP Token Verification")
        profile = client.get_user_profile()
        print_response(profile, "Token Verification")
        
        if "result" in profile:
            print("✅ Token is valid and working!")
            print("💡 Use --test-all flag to run comprehensive tests")
        else:
            print("❌ Token verification failed")

if __name__ == "__main__":
    main()