#!/usr/bin/env python3
"""
Anthropic MCP Server for Step Challenge Integration

This implements the official Anthropic Model Context Protocol (MCP) 
to connect Claude Code to the Step Challenge App.

Installation:
    pip install mcp

Usage:
    python mcp_server_anthropic.py

Then add to your Claude Code MCP configuration:
{
  "mcpServers": {
    "step-challenge": {
      "command": "python",
      "args": ["/path/to/mcp_server_anthropic.py"],
      "env": {
        "STEP_CHALLENGE_TOKEN": "your_mcp_token_here"
      }
    }
  }
}
"""

import os
import asyncio
import requests
from datetime import datetime
from typing import Any, Sequence
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)
import mcp.server.stdio
import mcp.types as types

# Configuration
STEP_CHALLENGE_URL = os.getenv("STEP_CHALLENGE_URL", "https://step-app-4x-yhw.fly.dev")
STEP_CHALLENGE_TOKEN = os.getenv("STEP_CHALLENGE_TOKEN")

class StepChallengeClient:
    """Client for Step Challenge API"""
    
    def __init__(self, token: str, base_url: str = STEP_CHALLENGE_URL):
        self.token = token
        self.base_url = base_url
    
    def _call_api(self, method: str, params: dict = None) -> dict:
        """Make API call to Step Challenge"""
        if params is None:
            params = {}
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": {**params, "token": self.token},
            "id": 1
        }
        
        try:
            response = requests.post(f"{self.base_url}/mcp/rpc", json=payload, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": {"message": f"API call failed: {str(e)}"}}
    
    def add_steps(self, date: str, count: int, allow_overwrite: bool = False) -> dict:
        return self._call_api("add_steps", {
            "date": date,
            "count": count,
            "allow_overwrite": allow_overwrite
        })
    
    def get_steps(self, start_date: str = None, end_date: str = None) -> dict:
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._call_api("get_steps", params)
    
    def get_profile(self) -> dict:
        return self._call_api("get_user_profile")

# Initialize the server
server = Server("step-challenge")

# Initialize the client
if not STEP_CHALLENGE_TOKEN:
    print("Warning: STEP_CHALLENGE_TOKEN environment variable not set")
    step_client = None
else:
    step_client = StepChallengeClient(STEP_CHALLENGE_TOKEN)

@server.list_resources()
async def handle_list_resources() -> list[Resource]:
    """List available resources"""
    return [
        Resource(
            uri="step-challenge://profile",
            name="User Profile", 
            description="Current user profile and challenge information",
            mimeType="application/json",
        ),
        Resource(
            uri="step-challenge://steps/recent",
            name="Recent Steps",
            description="Recent step data for the user",
            mimeType="application/json",
        ),
    ]

@server.read_resource()
async def handle_read_resource(uri: str) -> str:
    """Read resource content"""
    if not step_client:
        return "Error: Step Challenge token not configured"
    
    if uri == "step-challenge://profile":
        result = step_client.get_profile()
        if "result" in result:
            return f"User Profile: {result['result']}"
        else:
            return f"Error getting profile: {result.get('error', 'Unknown error')}"
    
    elif uri == "step-challenge://steps/recent":
        # Get last 7 days of steps
        from datetime import datetime, timedelta
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        result = step_client.get_steps(start_date, end_date)
        if "result" in result:
            return f"Recent Steps: {result['result']}"
        else:
            return f"Error getting steps: {result.get('error', 'Unknown error')}"
    
    return f"Unknown resource: {uri}"

@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="add_steps",
            description="Add or update daily step count",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                        "description": "Date in YYYY-MM-DD format"
                    },
                    "count": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 70000,
                        "description": "Number of steps (0-70,000)"
                    },
                    "allow_overwrite": {
                        "type": "boolean",
                        "default": False,
                        "description": "Allow overwriting existing step data"
                    }
                },
                "required": ["date", "count"]
            },
        ),
        Tool(
            name="get_steps",
            description="Retrieve step history with optional date filtering",
            inputSchema={
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                        "description": "Start date filter (optional)"
                    },
                    "end_date": {
                        "type": "string", 
                        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                        "description": "End date filter (optional)"
                    }
                },
                "required": []
            },
        ),
        Tool(
            name="get_step_summary",
            description="Get a summary of step data for a date range",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 365,
                        "default": 7,
                        "description": "Number of days to summarize (default: 7)"
                    }
                },
                "required": []
            },
        ),
        Tool(
            name="check_daily_goal",
            description="Check progress toward daily step goal",
            inputSchema={
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "integer",
                        "minimum": 1000,
                        "maximum": 50000,
                        "default": 10000,
                        "description": "Daily step goal (default: 10,000)"
                    },
                    "date": {
                        "type": "string",
                        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                        "description": "Date to check (default: today)"
                    }
                },
                "required": []
            },
        ),
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    """Handle tool calls"""
    if not step_client:
        return [types.TextContent(type="text", text="Error: Step Challenge token not configured")]
    
    if arguments is None:
        arguments = {}
    
    try:
        if name == "add_steps":
            date = arguments["date"]
            count = arguments["count"] 
            allow_overwrite = arguments.get("allow_overwrite", False)
            
            result = step_client.add_steps(date, count, allow_overwrite)
            
            if "result" in result:
                res = result["result"]
                message = f"✅ Successfully added {res['count']} steps for {res['date']}"
                if res.get('was_overwrite'):
                    message += f" (overwrote previous value: {res.get('old_count')})"
                return [types.TextContent(type="text", text=message)]
            else:
                error = result.get("error", {}).get("data", "Unknown error")
                return [types.TextContent(type="text", text=f"❌ Failed to add steps: {error}")]
        
        elif name == "get_steps":
            start_date = arguments.get("start_date")
            end_date = arguments.get("end_date")
            
            result = step_client.get_steps(start_date, end_date)
            
            if "result" in result:
                steps_data = result["result"]["steps"]
                if steps_data:
                    total = sum(day["count"] for day in steps_data)
                    message = f"📊 Retrieved {len(steps_data)} days of step data\n"
                    message += f"Total steps: {total:,}\n"
                    message += f"Average per day: {total/len(steps_data):,.0f}\n\n"
                    message += "Recent activity:\n"
                    for day in steps_data[-5:]:  # Last 5 days
                        message += f"  {day['date']}: {day['count']:,} steps\n"
                    return [types.TextContent(type="text", text=message)]
                else:
                    return [types.TextContent(type="text", text="📊 No step data found for the specified period")]
            else:
                error = result.get("error", {}).get("data", "Unknown error")
                return [types.TextContent(type="text", text=f"❌ Failed to get steps: {error}")]
        
        elif name == "get_step_summary":
            days = arguments.get("days", 7)
            from datetime import datetime, timedelta
            
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days-1)
            
            result = step_client.get_steps(
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d")
            )
            
            if "result" in result:
                steps_data = result["result"]["steps"]
                if steps_data:
                    total = sum(day["count"] for day in steps_data)
                    avg = total / len(steps_data)
                    max_day = max(steps_data, key=lambda x: x["count"])
                    min_day = min(steps_data, key=lambda x: x["count"])
                    
                    message = f"📊 {days}-Day Step Summary:\n"
                    message += f"• Total steps: {total:,}\n"
                    message += f"• Average per day: {avg:,.0f}\n"
                    message += f"• Highest day: {max_day['date']} ({max_day['count']:,} steps)\n"
                    message += f"• Lowest day: {min_day['date']} ({min_day['count']:,} steps)\n"
                    message += f"• Days with data: {len(steps_data)}/{days}"
                    
                    return [types.TextContent(type="text", text=message)]
                else:
                    return [types.TextContent(type="text", text=f"📊 No step data found for the last {days} days")]
            else:
                error = result.get("error", {}).get("data", "Unknown error")
                return [types.TextContent(type="text", text=f"❌ Failed to get step summary: {error}")]
        
        elif name == "check_daily_goal":
            goal = arguments.get("goal", 10000)
            date = arguments.get("date", datetime.now().strftime("%Y-%m-%d"))
            
            result = step_client.get_steps(start_date=date, end_date=date)
            
            if "result" in result and result["result"]["steps"]:
                day_steps = result["result"]["steps"][0]["count"]
                if day_steps >= goal:
                    message = f"🎯 Daily goal achieved for {date}!\n"
                    message += f"Steps: {day_steps:,} (goal: {goal:,})\n"
                    message += f"Exceeded by: {day_steps - goal:,} steps"
                else:
                    remaining = goal - day_steps
                    progress = (day_steps / goal) * 100
                    message = f"📈 Progress toward daily goal for {date}:\n"
                    message += f"Steps: {day_steps:,} / {goal:,} ({progress:.1f}%)\n"
                    message += f"Remaining: {remaining:,} steps"
                
                return [types.TextContent(type="text", text=message)]
            else:
                return [types.TextContent(type="text", text=f"📊 No step data found for {date}")]
        
        else:
            return [types.TextContent(type="text", text=f"Unknown tool: {name}")]
    
    except Exception as e:
        return [types.TextContent(type="text", text=f"❌ Tool execution failed: {str(e)}")]

async def main():
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="step-challenge",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=None,  
                    experimental_capabilities=None,
                ),
            ),
        )

if __name__ == "__main__":
    print("Starting Step Challenge MCP Server...")
    if not STEP_CHALLENGE_TOKEN:
        print("Warning: STEP_CHALLENGE_TOKEN environment variable not set")
        print("Set it to your MCP token from get_mcp_token.py")
    asyncio.run(main())