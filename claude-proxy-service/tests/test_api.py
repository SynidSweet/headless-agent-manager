"""
Tests for FastAPI endpoints.
Following TDD - these tests are written FIRST.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from app.main import app
import json


class TestHealthEndpoint:
    """Tests for health check endpoint"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    def test_health_endpoint_returns_200(self):
        """Test that /health returns 200 OK"""
        response = self.client.get("/health")
        assert response.status_code == 200

    def test_health_endpoint_returns_status(self):
        """Test that health endpoint returns status"""
        response = self.client.get("/health")
        data = response.json()

        assert "status" in data
        assert data["status"] == "ok"

    def test_health_endpoint_includes_timestamp(self):
        """Test that health includes timestamp"""
        response = self.client.get("/health")
        data = response.json()

        assert "timestamp" in data
        assert isinstance(data["timestamp"], str)


class TestStartAgentEndpoint:
    """Tests for /agent/start endpoint"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    def test_start_agent_accepts_prompt(self, mock_start):
        """Test that start endpoint accepts prompt"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_start.return_value = mock_process

        # Act
        response = self.client.post(
            "/agent/start",
            json={"prompt": "test prompt"},
        )

        # Assert
        assert response.status_code == 200
        mock_start.assert_called_once()

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    def test_start_agent_returns_agent_id(self, mock_start):
        """Test that start returns agent ID"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_start.return_value = mock_process

        # Act
        response = self.client.post(
            "/agent/start",
            json={"prompt": "test"},
        )

        # Assert
        data = response.json()
        assert "agent_id" in data
        assert "pid" in data
        assert data["pid"] == 12345

    def test_start_agent_requires_prompt(self):
        """Test that prompt is required"""
        response = self.client.post("/agent/start", json={})

        assert response.status_code == 422  # Validation error

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    def test_start_agent_accepts_session_id(self, mock_start):
        """Test that session ID can be provided"""
        # Arrange
        mock_process = MagicMock()
        mock_start.return_value = mock_process

        # Act
        response = self.client.post(
            "/agent/start",
            json={"prompt": "test", "session_id": "session-123"},
        )

        # Assert
        assert response.status_code == 200
        call_args = mock_start.call_args
        assert call_args[0][1]["session_id"] == "session-123"

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    def test_start_agent_handles_error(self, mock_start):
        """Test error handling when Claude fails to start"""
        # Arrange
        mock_start.side_effect = RuntimeError("Claude not found")

        # Act
        response = self.client.post(
            "/agent/start",
            json={"prompt": "test"},
        )

        # Assert
        assert response.status_code == 500
        assert "Claude not found" in response.json()["detail"]


class TestStreamEndpoint:
    """Tests for /agent/stream endpoint"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    @patch("app.claude_runner.ClaudeRunner.read_stream")
    def test_stream_endpoint_returns_sse(self, mock_read, mock_start):
        """Test that stream endpoint returns Server-Sent Events"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_start.return_value = mock_process

        mock_read.return_value = iter([
            '{"type":"system","content":"init"}',
            '{"type":"assistant","content":"hello"}',
        ])

        # Act
        response = self.client.post(
            "/agent/stream",
            json={"prompt": "test"},
        )

        # Assert
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    @patch("app.claude_runner.ClaudeRunner.start_agent")
    @patch("app.claude_runner.ClaudeRunner.read_stream")
    def test_stream_endpoint_streams_lines(self, mock_read, mock_start):
        """Test that stream endpoint yields each line"""
        # Arrange
        mock_process = MagicMock()
        mock_start.return_value = mock_process

        test_lines = [
            '{"type":"system","content":"init"}',
            '{"type":"assistant","content":"response"}',
            '{"type":"result","content":"done"}',
        ]
        mock_read.return_value = iter(test_lines)

        # Act
        response = self.client.post(
            "/agent/stream",
            json={"prompt": "test"},
        )

        # Assert
        content = response.text
        for line in test_lines:
            assert line in content


class TestStopAgentEndpoint:
    """Tests for /agent/stop endpoint"""

    def setup_method(self):
        """Setup test client"""
        self.client = TestClient(app)

    @patch("app.main.active_processes")
    @patch("app.claude_runner.ClaudeRunner.stop_agent")
    def test_stop_agent_terminates_process(self, mock_stop, mock_processes):
        """Test that stop endpoint terminates the process"""
        # Arrange
        mock_process = MagicMock()
        mock_processes.get.return_value = mock_process

        # Act
        response = self.client.post("/agent/stop/test-agent-id")

        # Assert
        assert response.status_code == 200
        mock_stop.assert_called_once_with(mock_process)

    @patch("app.main.active_processes")
    def test_stop_agent_returns_404_when_not_found(self, mock_processes):
        """Test that stop returns 404 for non-existent agent"""
        # Arrange
        mock_processes.get.return_value = None

        # Act
        response = self.client.post("/agent/stop/non-existent")

        # Assert
        assert response.status_code == 404
