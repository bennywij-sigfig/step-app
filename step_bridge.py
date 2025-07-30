#!/usr/bin/env python3
"""
Step Challenge MCP Bridge
A local MCP server that bridges Claude Desktop/Cursor to the Step Challenge API

Security: Token passed via environment variable STEP_TOKEN
Usage: STEP_TOKEN=your_token python step_bridge.py

Requirements: pip install aiohttp
"""

import asyncio
import json
import os
import sys
import aiohttp
import logging
from typing import Any, Dict, List, Union

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("step-challenge-bridge")

class StepChallengeBridge:
    def __init__(self):
        # Security: Use environment variable for token
        self.token = os.getenv('STEP_TOKEN')
        if not self.token:
            logger.error("STEP_TOKEN environment variable is required")
            print("Error: STEP_TOKEN environment variable is required", file=sys.stderr)
            print("Usage: STEP_TOKEN=your_token python step_bridge.py", file=sys.stderr)
            sys.exit(1)
        
        self.api_url = "https://step-app-4x-yhw.fly.dev/mcp"
        logger.info("Step Challenge MCP Bridge initialized")
        
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
        """Handle MCP tools/list request by proxying to remote API"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            payload = {
                "jsonrpc": "2.0",
                "method": "tools/list",
                "params": {},
                "id": 1
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        raise Exception(f"API error: HTTP {response.status}")
                    
                    data = await response.json()
                    if "error" in data:
                        raise Exception(f"API error: {data['error']['message']}")
                    
                    return data["result"]
                    
        except Exception as e:
            logger.error(f"Error listing tools: {e}")
            raise
    
    async def handle_tools_call(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP tools/call request by proxying to remote API"""
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            payload = {
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": params,
                "id": 1
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        raise Exception(f"API error: HTTP {response.status}")
                    
                    data = await response.json()
                    if "error" in data:
                        raise Exception(f"API error: {data['error']['message']}")
                    
                    return data["result"]
                    
        except Exception as e:
            logger.error(f"Error calling tool: {e}")
            # Return error in MCP format
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error: {str(e)}"
                }]
            }
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming MCP request"""
        try:
            method = request.get("method")
            params = request.get("params", {})
            request_id = request.get("id")
            
            logger.info(f"Handling request: {method}")
            
            if method == "initialize":
                result = await self.handle_initialize(params)
            elif method == "tools/list":
                result = await self.handle_tools_list(params)
            elif method == "tools/call":
                result = await self.handle_tools_call(params)
            else:
                raise Exception(f"Unknown method: {method}")
            
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
            
        except Exception as e:
            logger.error(f"Request error: {e}")
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": str(e)
                },
                "id": request.get("id")
            }
    
    async def run(self):
        """Run the MCP bridge server via stdio"""
        logger.info("Starting MCP bridge server...")
        
        try:
            while True:
                # Read JSON-RPC request from stdin
                line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
                if not line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                try:
                    request = json.loads(line)
                    response = await self.handle_request(request)
                    
                    # Write JSON-RPC response to stdout
                    print(json.dumps(response), flush=True)
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
                    error_response = {
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32700,
                            "message": "Parse error"
                        },
                        "id": None
                    }
                    print(json.dumps(error_response), flush=True)
                    
        except KeyboardInterrupt:
            logger.info("Bridge stopped by user")
        except Exception as e:
            logger.error(f"Bridge error: {e}")
            sys.exit(1)

async def main():
    """Main entry point"""
    bridge = StepChallengeBridge()
    await bridge.run()

if __name__ == "__main__":
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
        sys.exit(0)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBridge stopped.", file=sys.stderr)
        sys.exit(0)