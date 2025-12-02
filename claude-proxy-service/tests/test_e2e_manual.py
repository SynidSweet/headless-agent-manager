"""
Manual E2E Test for Claude Proxy Service

This is a MANUAL test that requires:
1. Claude CLI to be installed
2. User to be authenticated (claude login)
3. Python proxy service to be running

Run with: pytest tests/test_e2e_manual.py -v -s --tb=short

NOTE: This is marked as @pytest.mark.skip by default.
To run it, remove the skip decorator or use: pytest -v -m manual
"""

import pytest
import json
from fastapi.testclient import TestClient
from app.main import app


@pytest.mark.skip(reason="Manual E2E test - requires Claude CLI and authentication")
class TestManualE2E:
    """
    Manual E2E tests that require real Claude CLI integration.

    These tests are skipped by default because they require:
    - Claude CLI installed
    - User authenticated
    - May take 10-30 seconds to complete
    """

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_health_check_with_real_service(self):
        """Test health endpoint returns correctly"""
        response = self.client.get("/health")

        assert response.status_code == 200
        data = response.json()

        print("\n✅ Health check response:")
        print(json.dumps(data, indent=2))

        assert data["status"] == "ok"
        assert "timestamp" in data
        assert "active_agents" in data

    def test_simple_prompt_streaming(self):
        """
        Test streaming a simple prompt to Claude CLI

        This test will:
        1. Send a simple math prompt
        2. Stream the response
        3. Verify we get assistant messages
        4. Verify we get a completion event
        """
        response = self.client.post(
            "/agent/stream",
            json={
                "prompt": "What is 2 + 2? Reply with just the number.",
                "model": "claude-sonnet-4-5-20250929"
            }
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        print("\n✅ Starting stream...")

        # Parse SSE stream
        content = response.text
        lines = [line for line in content.split("\n") if line.strip()]

        messages = []
        for line in lines:
            if line.startswith("data: "):
                try:
                    data = json.loads(line[6:])  # Remove "data: " prefix
                    messages.append(data)
                    print(f"  📦 {data.get('type', 'unknown')}: {str(data)[:80]}...")
                except json.JSONDecodeError:
                    pass

        # Verify we got messages
        assert len(messages) > 0, "Should receive at least one message"

        # Verify we got assistant messages
        assistant_messages = [m for m in messages if m.get("type") == "assistant"]
        assert len(assistant_messages) > 0, "Should receive assistant messages"

        print(f"\n✅ Received {len(messages)} total messages")
        print(f"✅ Received {len(assistant_messages)} assistant messages")

    def test_start_and_stop_agent(self):
        """
        Test starting and stopping an agent

        This test will:
        1. Start an agent with a prompt
        2. Verify we get an agent ID and PID
        3. Stop the agent
        4. Verify the agent is stopped
        """
        # Start agent
        start_response = self.client.post(
            "/agent/start",
            json={"prompt": "Count to 3 slowly"}
        )

        assert start_response.status_code == 200
        start_data = start_response.json()

        assert "agent_id" in start_data
        assert "pid" in start_data

        agent_id = start_data["agent_id"]
        pid = start_data["pid"]

        print(f"\n✅ Started agent: {agent_id} (PID: {pid})")

        # Stop agent
        stop_response = self.client.post(f"/agent/stop/{agent_id}")

        assert stop_response.status_code == 200
        stop_data = stop_response.json()

        assert stop_data["status"] == "stopped"
        assert stop_data["agent_id"] == agent_id

        print(f"✅ Stopped agent: {agent_id}")


@pytest.mark.manual
class TestManualE2EEnabled:
    """
    Same tests as above, but enabled when running with -m manual

    Run with: pytest -v -m manual -s
    """

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_health_check(self):
        """Test health endpoint"""
        response = self.client.get("/health")
        assert response.status_code == 200
        print("\n✅ Health check passed")

    def test_simple_streaming(self):
        """Test simple streaming prompt"""
        response = self.client.post(
            "/agent/stream",
            json={"prompt": "Say 'Hello, E2E test!'"}
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        print("\n✅ Streaming test passed")
        print(f"   Response length: {len(response.text)} chars")


def test_documentation():
    """
    Documentation test that always runs

    This test provides information about how to run manual E2E tests.
    """
    print("\n" + "="*60)
    print("Claude Proxy Service - Manual E2E Testing")
    print("="*60)
    print("\nThese tests require:")
    print("  1. Claude CLI installed: curl -sS https://get.claude.com/install.sh | bash")
    print("  2. User authenticated: claude login")
    print("  3. Python service running: uvicorn app.main:app --reload")
    print("\nTo run manual E2E tests:")
    print("  pytest -v -m manual -s")
    print("\nTo run specific manual test:")
    print("  pytest -v tests/test_e2e_manual.py::TestManualE2EEnabled::test_health_check -s")
    print("\nTo run ALL tests including skipped:")
    print("  pytest -v --run-skipped -s")
    print("="*60)

    # This test always passes
    assert True


if __name__ == "__main__":
    print("Run this file with: pytest tests/test_e2e_manual.py -v -s")
