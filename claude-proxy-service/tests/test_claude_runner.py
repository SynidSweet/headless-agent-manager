"""
Tests for Claude CLI runner service.
Following TDD - these tests are written FIRST.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig
import subprocess


class TestClaudeRunner:
    """Test suite for ClaudeRunner service"""

    def setup_method(self):
        """Setup for each test"""
        self.config = ClaudeRunnerConfig(
            claude_cli_path="claude",
            use_subscription=True,
            default_model="claude-sonnet-4-5-20250929",
            default_max_tokens=4096,
        )
        self.runner = ClaudeRunner(self.config)

    def test_init_creates_runner_with_config(self):
        """Test that runner initializes with configuration"""
        assert self.runner.config == self.config
        assert self.runner.config.use_subscription is True

    @patch("subprocess.Popen")
    def test_start_agent_spawns_claude_cli(self, mock_popen):
        """Test that start_agent spawns Claude CLI with correct arguments"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_process.stdout = []
        mock_popen.return_value = mock_process

        # Act
        process = self.runner.start_agent("test prompt", {})

        # Assert
        mock_popen.assert_called_once()
        call_args = mock_popen.call_args

        # Verify command includes claude
        assert "claude" in call_args[0][0]

        # Verify prompt is included
        assert "test prompt" in call_args[0][0]

        # Verify output format
        assert "--output-format" in call_args[0][0]
        assert "stream-json" in call_args[0][0]

        # Verify process returned
        assert process.pid == 12345

    @patch("subprocess.Popen")
    def test_start_agent_removes_api_key_from_env(self, mock_popen):
        """Test that ANTHROPIC_API_KEY is removed from environment"""
        # Arrange
        mock_process = MagicMock()
        mock_popen.return_value = mock_process

        # Act
        self.runner.start_agent("test", {})

        # Assert
        call_args = mock_popen.call_args
        env = call_args[1]["env"]

        assert "ANTHROPIC_API_KEY" not in env

    @patch("subprocess.Popen")
    def test_start_agent_sets_subscription_flag(self, mock_popen):
        """Test that CLAUDE_USE_SUBSCRIPTION is set when configured"""
        # Arrange
        mock_process = MagicMock()
        mock_popen.return_value = mock_process

        # Act
        self.runner.start_agent("test", {})

        # Assert
        call_args = mock_popen.call_args
        env = call_args[1]["env"]

        assert env["CLAUDE_USE_SUBSCRIPTION"] == "true"

    @patch("subprocess.Popen")
    def test_start_agent_includes_verbose_flag(self, mock_popen):
        """Test that --verbose is included for stream-json"""
        # Arrange
        mock_process = MagicMock()
        mock_popen.return_value = mock_process

        # Act
        self.runner.start_agent("test", {})

        # Assert
        call_args = mock_popen.call_args
        assert "--verbose" in call_args[0][0]

    @patch("subprocess.Popen")
    def test_start_agent_with_session_id(self, mock_popen):
        """Test that session ID is passed when provided"""
        # Arrange
        mock_process = MagicMock()
        mock_popen.return_value = mock_process

        # Act
        self.runner.start_agent("test", {"session_id": "session-123"})

        # Assert
        call_args = mock_popen.call_args
        command = call_args[0][0]

        assert "--session-id" in command
        assert "session-123" in command

    @patch("subprocess.Popen")
    def test_start_agent_returns_process(self, mock_popen):
        """Test that start_agent returns subprocess"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 99999
        mock_popen.return_value = mock_process

        # Act
        result = self.runner.start_agent("test", {})

        # Assert
        assert result == mock_process
        assert result.pid == 99999

    @patch("subprocess.Popen")
    def test_start_agent_raises_on_spawn_error(self, mock_popen):
        """Test that errors during spawn are raised"""
        # Arrange
        mock_popen.side_effect = FileNotFoundError("claude not found")

        # Act & Assert
        with pytest.raises(RuntimeError) as exc_info:
            self.runner.start_agent("test", {})

        assert "Failed to start Claude CLI" in str(exc_info.value)

    def test_stop_agent_kills_process(self):
        """Test that stop_agent terminates process"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_process.poll.return_value = None  # Still running

        # Act
        self.runner.stop_agent(mock_process)

        # Assert
        mock_process.terminate.assert_called_once()

    def test_stop_agent_force_kills_if_terminate_fails(self):
        """Test that force kill is used if terminate doesn't work"""
        # Arrange
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_process.poll.side_effect = [None, None, None, 0]  # Doesn't die immediately

        # Act
        self.runner.stop_agent(mock_process, timeout=0.1)

        # Assert
        mock_process.terminate.assert_called_once()
        # After timeout, should call kill
        mock_process.kill.assert_called_once()

    def test_read_stream_yields_lines(self):
        """Test that read_stream yields lines from stdout"""
        # Arrange
        mock_process = MagicMock()
        mock_process.stdout = [
            b'{"type":"system","content":"init"}\n',
            b'{"type":"assistant","content":"hello"}\n',
            b'{"type":"result","content":"done"}\n',
        ]

        # Act
        lines = list(self.runner.read_stream(mock_process))

        # Assert
        assert len(lines) == 3
        assert lines[0] == '{"type":"system","content":"init"}'
        assert lines[1] == '{"type":"assistant","content":"hello"}'
        assert lines[2] == '{"type":"result","content":"done"}'

    def test_read_stream_handles_utf8_encoding(self):
        """Test that stream handles UTF-8 properly"""
        # Arrange
        mock_process = MagicMock()
        mock_process.stdout = [b'{"content":"\xe2\x9c\x85 Success"}\n']  # UTF-8 checkmark

        # Act
        lines = list(self.runner.read_stream(mock_process))

        # Assert
        assert len(lines) == 1
        assert "✅" in lines[0]
