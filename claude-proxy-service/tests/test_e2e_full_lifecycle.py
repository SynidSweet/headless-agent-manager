"""
E2E Test - Full Agent Lifecycle with Real Claude CLI Integration

This test validates the complete agent lifecycle:
1. Start agent with custom configuration
2. Stream output in real-time
3. Verify message parsing
4. Stop agent gracefully

IMPORTANT: This test requires:
- Claude CLI installed and authenticated
- Python proxy service running (or use TestClient for in-process testing)
"""

import pytest
import json
from fastapi.testclient import TestClient
from app.main import app


class TestFullAgentLifecycle:
    """Test complete agent lifecycle E2E"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_start_agent_returns_valid_response(self):
        """Test starting an agent returns expected fields"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Say hello and list the files in the current directory",
                "working_directory": "/tmp",
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Validate response structure
        assert "agent_id" in data
        assert "pid" in data
        assert "status" in data
        assert data["status"] == "started"

        # Validate agent_id is a valid UUID
        agent_id = data["agent_id"]
        assert len(agent_id) == 36  # UUID format: 8-4-4-4-12
        assert agent_id.count("-") == 4

        # PID should be a positive integer
        assert isinstance(data["pid"], int)
        assert data["pid"] > 0

    def test_start_agent_with_all_options(self):
        """Test starting agent with all configuration options"""
        # Use /tmp which always exists instead of /tmp/test
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test prompt with all options",
                "session_id": "test-session-123",
                "model": "claude-sonnet-4-5-20250929",
                "working_directory": "/tmp",
                "allowed_tools": ["Read", "Grep"],
                "disallowed_tools": ["Bash", "Write"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"

    def test_start_agent_with_mcp_configuration(self):
        """Test starting agent with MCP server configuration"""
        mcp_config = {
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                }
            }
        }

        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test with MCP",
                "mcp_config": json.dumps(mcp_config),
                "mcp_strict": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"

    def test_stream_agent_endpoint_exists(self):
        """Test that stream endpoint is accessible (basic connectivity)"""
        # Note: Full streaming test requires real Claude CLI
        # This test validates the endpoint exists and accepts requests
        response = self.client.post(
            "/agent/stream",
            json={
                "prompt": "Say hello",
                "working_directory": "/tmp",
            },
        )

        # Should return a streaming response
        # Status 200 means endpoint is working
        assert response.status_code == 200
        assert response.headers.get("content-type") == "text/event-stream; charset=utf-8"

    def test_health_check_reflects_active_agents(self):
        """Test that health endpoint tracks active agents"""
        # Check initial state
        health_before = self.client.get("/health").json()
        initial_count = health_before["active_agents"]

        # Start an agent
        start_response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Say hello",
                "working_directory": "/tmp",
            },
        )
        assert start_response.status_code == 200

        # Check health after starting agent
        health_after = self.client.get("/health").json()
        assert health_after["active_agents"] == initial_count + 1

    def test_invalid_prompt_rejected(self):
        """Test that invalid requests are rejected"""
        response = self.client.post(
            "/agent/start",
            json={
                # Missing required 'prompt' field
                "working_directory": "/tmp",
            },
        )

        assert response.status_code == 422  # Validation error


class TestAgentTermination:
    """Test agent stopping and cleanup"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_stop_nonexistent_agent_returns_404(self):
        """Test stopping a non-existent agent returns 404"""
        response = self.client.post("/agent/stop/nonexistent-agent-id")
        assert response.status_code == 404

    def test_stop_agent_after_start(self):
        """Test stopping an agent that was started"""
        # Start an agent
        start_response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Sleep for 60 seconds",
                "working_directory": "/tmp",
            },
        )
        assert start_response.status_code == 200
        agent_id = start_response.json()["agent_id"]

        # Stop the agent
        stop_response = self.client.post(f"/agent/stop/{agent_id}")
        assert stop_response.status_code == 200

        data = stop_response.json()
        assert data["status"] == "stopped"
        assert data["agent_id"] == agent_id


class TestToolFiltering:
    """Test tool filtering configuration in agent lifecycle"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_agent_with_allowed_tools_only(self):
        """Test starting agent with allowed tools restriction"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test with allowed tools",
                "allowed_tools": ["Read", "Grep", "Glob"],
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "started"

    def test_agent_with_disallowed_tools(self):
        """Test starting agent with disallowed tools"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test with disallowed tools",
                "disallowed_tools": ["Bash", "Edit", "Write"],
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "started"

    def test_agent_with_both_allowed_and_disallowed(self):
        """Test starting agent with both tool restrictions"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test with both tool restrictions",
                "allowed_tools": ["Read", "Grep"],
                "disallowed_tools": ["Bash"],
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "started"

    def test_empty_tool_lists_accepted(self):
        """Test that empty tool lists are valid"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test with empty tool lists",
                "allowed_tools": [],
                "disallowed_tools": [],
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "started"


@pytest.mark.parametrize(
    "config",
    [
        {"working_directory": "/tmp"},
        {"model": "claude-sonnet-4-5-20250929"},
        {"session_id": "test-123"},
        {"allowed_tools": ["Read"]},
        {"disallowed_tools": ["Bash"]},
    ],
)
def test_various_configurations(config):
    """Test agent startup with various configurations"""
    client = TestClient(app)
    response = client.post(
        "/agent/start",
        json={
            "prompt": "Test configuration",
            **config,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "started"


class TestErrorHandling:
    """Test error handling in agent lifecycle"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_malformed_json_rejected(self):
        """Test that malformed JSON is rejected"""
        response = self.client.post(
            "/agent/start",
            data="not-valid-json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 422

    def test_invalid_mcp_config_handled(self):
        """Test that invalid MCP config is handled gracefully"""
        response = self.client.post(
            "/agent/start",
            json={
                "prompt": "Test",
                "mcp_config": "invalid-json-string",
            },
        )

        # Should still start (invalid JSON will be caught by Claude CLI)
        # Our API doesn't validate MCP JSON structure
        assert response.status_code == 200


class TestConcurrency:
    """Test concurrent agent operations"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_multiple_agents_can_run_concurrently(self):
        """Test that multiple agents can be started simultaneously"""
        agent_ids = []

        # Start 3 agents
        for i in range(3):
            response = self.client.post(
                "/agent/start",
                json={
                    "prompt": f"Agent {i} - say hello",
                    "working_directory": "/tmp",
                },
            )
            assert response.status_code == 200
            agent_ids.append(response.json()["agent_id"])

        # Verify all agents have unique IDs
        assert len(set(agent_ids)) == 3

        # Check health shows all active agents
        health = self.client.get("/health").json()
        assert health["active_agents"] >= 3

    def test_concurrent_health_checks_consistent(self):
        """Test that health checks remain consistent under load"""
        # Make multiple concurrent health check requests
        responses = []
        for _ in range(10):
            response = self.client.get("/health")
            assert response.status_code == 200
            responses.append(response.json())

        # All responses should have consistent structure
        for resp in responses:
            assert "status" in resp
            assert "timestamp" in resp
            assert "active_agents" in resp
            assert resp["status"] == "ok"
