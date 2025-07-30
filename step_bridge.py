#!/usr/bin/env python3
"""
Step Challenge MCP Bridge Script

A Python bridge that connects Claude Desktop, Cursor, and Claude Code
to the Step Challenge API via the Model Context Protocol (MCP).

This script implements the MCP stdio protocol and forwards requests
to the Step Challenge remote API with rich tool descriptions for
optimal LLM integration.

Setup:
1. Set environment variable: STEP_TOKEN=your_mcp_token_here
2. Configure in Claude Desktop: ~/.claude_desktop_config.json
3. Add server: {"command": "python", "args": ["~/step_bridge.py"]}

Author: Step Challenge App
Version: 1.0.0
Requirements: pip install aiohttp
"""

import os
import sys
import json
import asyncio
import aiohttp
from typing import Dict, Any, Optional

# Configuration
API_BASE_URL = "https://step-app-4x-yhw.fly.dev"
MCP_ENDPOINT = f"{API_BASE_URL}/mcp"

# MCP Tool Definitions with Rich Descriptions (extracted from mcp-server.js)
TOOLS = [
    {
        "name": "add_steps",
        "description": "Record daily step count for fitness tracking. Use this when user wants to log their steps for a specific date. CRITICAL SAFETY: Never automatically overwrite existing data. If data exists, show user the conflict and ask for explicit confirmation before using allow_overwrite=true. Authentication via Authorization header.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                    "description": "Target date for step count in YYYY-MM-DD format ONLY. Examples: \"2025-07-30\", \"2025-12-25\". NEVER use \"today\" - always convert to actual date like \"2025-07-30\"."
                },
                "count": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 70000,
                    "description": "Number of steps taken (0-70,000). Typical daily counts: sedentary 2000-5000, active 7500-10000, very active 10000+"
                },
                "allow_overwrite": {
                    "type": "boolean",
                    "default": False,
                    "description": "DANGER: Only set to true after explicit user confirmation. NEVER set this automatically. User must explicitly agree to overwrite their existing data."
                }
            },
            "required": ["date", "count"]
        }
    },
    {
        "name": "get_steps",
        "description": "Retrieve step history and progress data. Use this to show user their step counts, analyze trends, check goal progress, or generate reports. Authentication via Authorization header.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                    "description": "Optional: Start date for date range filter in YYYY-MM-DD format. Omit to get all history."
                },
                "end_date": {
                    "type": "string",
                    "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                    "description": "Optional: End date for date range filter in YYYY-MM-DD format. Omit to get all history."
                }
            },
            "required": []
        }
    },
    {
        "name": "get_user_profile",
        "description": "Get comprehensive user information including profile details, active challenges, team information, and account status. Use this first to understand user context. Authentication via Authorization header.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]

class StepChallengeMCPBridge:
    def __init__(self):
        self.token = os.getenv('STEP_TOKEN')
        if not self.token:
            self.error_and_exit("STEP_TOKEN environment variable is required")
        
        self.session: Optional[aiohttp.ClientSession] = None
    
    def error_and_exit(self, message: str):
        """Print error to stderr and exit"""
        print(f"Error: {message}", file=sys.stderr)
        sys.exit(1)
    
    async def create_session(self):
        """Create aiohttp session if not exists"""
        if not self.session:
            self.session = aiohttp.ClientSession()
    
    async def close_session(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
    
    async def make_api_request(self, method: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make JSON-RPC 2.0 request to Step Challenge MCP API"""
        await self.create_session()
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.token}'
        }
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": 1
        }
        
        try:
            async with self.session.post(MCP_ENDPOINT, json=payload, headers=headers) as response:
                if response.status != 200:
                    return {
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32000,
                            "message": "Server error",
                            "data": f"HTTP {response.status}: {await response.text()}"
                        },
                        "id": 1
                    }
                
                return await response.json()
        
        except aiohttp.ClientError as e:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": "Server error",
                    "data": f"Network error: {str(e)}"
                },
                "id": 1
            }
    
    async def handle_initialize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP initialize request"""
        return {
            "protocolVersion": "2025-03-26",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "Step Challenge MCP Bridge",
                "version": "1.0.0"
            }
        }
    
    async def handle_tools_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP tools/list request with rich tool descriptions"""
        return {
            "tools": TOOLS
        }
    
    async def handle_tools_call(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP tools/call request by forwarding to API"""
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        
        if not tool_name:
            raise ValueError("Tool name is required")
        
        # Forward to remote MCP API
        api_response = await self.make_api_request("tools/call", {
            "name": tool_name,
            "arguments": tool_args
        })
        
        # Check for API errors
        if "error" in api_response:
            raise Exception(api_response["error"]["data"])
        
        # Return the result in MCP format
        return api_response.get("result", {})
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming MCP request"""
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        try:
            if method == "initialize":
                result = await self.handle_initialize(params)
            elif method == "tools/list":
                result = await self.handle_tools_list(params)
            elif method == "tools/call":
                result = await self.handle_tools_call(params)
            else:
                return {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32601,
                        "message": "Method not found",
                        "data": f"Unknown method: {method}"
                    },
                    "id": request_id
                }
            
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
        
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": "Server error",
                    "data": str(e)
                },
                "id": request_id
            }
    
    async def run(self):
        """Main stdio loop"""
        try:
            while True:
                # Read JSON-RPC request from stdin
                line = await asyncio.get_event_loop().run_in_executor(
                    None, sys.stdin.readline
                )
                
                if not line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                try:
                    request = json.loads(line)
                except json.JSONDecodeError as e:
                    # Send JSON-RPC parse error
                    error_response = {
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32700,
                            "message": "Parse error",
                            "data": str(e)
                        },
                        "id": None
                    }
                    print(json.dumps(error_response), flush=True)
                    continue
                
                # Handle the request
                response = await self.handle_request(request)
                
                # Send response to stdout
                print(json.dumps(response), flush=True)
        
        finally:
            await self.close_session()

async def main():
    """Main entry point"""
    bridge = StepChallengeMCPBridge()
    await bridge.run()

if __name__ == "__main__":
    # Check Python version
    if sys.version_info < (3, 7):
        print("Error: Python 3.7 or higher is required", file=sys.stderr)
        sys.exit(1)
    
    # Check for help
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help', 'help']:
        print("Step Challenge MCP Bridge")
        print("Usage: STEP_TOKEN=your_token python step_bridge.py")
        print("")
        print("Environment Variables:")
        print("  STEP_TOKEN    Your Step Challenge MCP token (required)")
        print("")
        print("Example:")
        print("  STEP_TOKEN=mcp_abc123... python step_bridge.py")
        print("")
        print("Get your token from: https://step-app-4x-yhw.fly.dev/mcp-setup")
        sys.exit(0)
    
    # Check for required token
    if not os.getenv('STEP_TOKEN'):
        print("Error: STEP_TOKEN environment variable is required", file=sys.stderr)
        print("", file=sys.stderr)
        print("Usage:", file=sys.stderr)
        print("  STEP_TOKEN=your_token_here python step_bridge.py", file=sys.stderr)
        print("", file=sys.stderr)
        print("Get your token from: https://step-app-4x-yhw.fly.dev/mcp-setup", file=sys.stderr)
        sys.exit(1)
    
    # Run the bridge
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)