"""
FastAPI application for Claude Code proxy service.
Provides HTTP endpoints for spawning and streaming Claude CLI agents.
"""

import uuid
from datetime import datetime
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig
import subprocess

# Initialize FastAPI app
app = FastAPI(
    title="Claude Proxy Service",
    description="Microservice for proxying Claude Code CLI with Max subscription support",
    version="0.1.0",
)

# Initialize Claude runner
runner_config = ClaudeRunnerConfig(
    claude_cli_path="claude",
    use_subscription=True,
)
claude_runner = ClaudeRunner(runner_config)

# Track active processes
active_processes: Dict[str, subprocess.Popen[bytes]] = {}


# Request/Response models
class StartAgentRequest(BaseModel):
    """Request to start a new agent"""

    prompt: str
    session_id: Optional[str] = None
    model: Optional[str] = None
    working_directory: Optional[str] = None
    mcp_config: Optional[str] = None  # JSON string of MCP configuration
    mcp_strict: Optional[bool] = False  # Whether to use --strict-mcp-config


class StartAgentResponse(BaseModel):
    """Response after starting agent"""

    agent_id: str
    pid: int
    status: str = "started"


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    timestamp: str
    active_agents: int = 0


# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.utcnow().isoformat(),
        active_agents=len(active_processes),
    )


@app.post("/agent/start", response_model=StartAgentResponse)
async def start_agent(request: StartAgentRequest) -> StartAgentResponse:
    """
    Start a new Claude CLI agent.

    Returns agent_id and pid for tracking.
    """
    try:
        # Build options
        options: Dict[str, any] = {}
        if request.session_id:
            options["session_id"] = request.session_id
        if request.model:
            options["model"] = request.model
        if request.working_directory:
            options["working_directory"] = request.working_directory
        if request.mcp_config:
            options["mcp_config"] = request.mcp_config
        if request.mcp_strict:
            options["mcp_strict"] = request.mcp_strict

        # Start Claude process
        process = claude_runner.start_agent(request.prompt, options)

        # Generate agent ID
        agent_id = str(uuid.uuid4())

        # Track process
        active_processes[agent_id] = process

        return StartAgentResponse(agent_id=agent_id, pid=process.pid)

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/stream")
async def stream_agent(request: StartAgentRequest) -> StreamingResponse:
    """
    Start a Claude CLI agent and stream output via Server-Sent Events.

    Streams JSONL output from Claude CLI in real-time.
    """
    try:
        # Build options
        options: Dict[str, any] = {}
        if request.session_id:
            options["session_id"] = request.session_id
        if request.model:
            options["model"] = request.model
        if request.working_directory:
            options["working_directory"] = request.working_directory
        if request.mcp_config:
            options["mcp_config"] = request.mcp_config
        if request.mcp_strict:
            options["mcp_strict"] = request.mcp_strict

        # Start Claude process
        process = claude_runner.start_agent(request.prompt, options)

        # Generate agent ID
        agent_id = str(uuid.uuid4())
        active_processes[agent_id] = process

        # Stream generator - using async for true real-time streaming
        async def event_generator():
            """Generate SSE events from Claude CLI output in real-time"""
            try:
                # CRITICAL: Use async_read_stream for non-blocking reads
                # This yields each line as it arrives, not buffered
                async for line in claude_runner.async_read_stream(process):
                    # Send as SSE event immediately
                    yield f"data: {line}\n\n"

                # Send completion event
                yield "event: complete\n"
                yield "data: {}\n\n"

            except Exception as e:
                # Send error event
                yield "event: error\n"
                yield f'data: {{"error": "{str(e)}"}}\n\n'

            finally:
                # Cleanup
                if agent_id in active_processes:
                    del active_processes[agent_id]

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
                "X-Agent-Id": agent_id,  # Send agent ID to Node.js
            },
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/stop/{agent_id}")
async def stop_agent(agent_id: str) -> Dict[str, str]:
    """
    Stop a running Claude CLI agent.

    Args:
        agent_id: The agent ID returned from start_agent

    Returns:
        Status message
    """
    process = active_processes.get(agent_id)

    if not process:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    try:
        claude_runner.stop_agent(process)
        del active_processes[agent_id]

        return {"status": "stopped", "agent_id": agent_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
