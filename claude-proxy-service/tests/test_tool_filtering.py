"""
Tests for tool filtering functionality in Claude runner.
Validates that allowed_tools and disallowed_tools are properly
converted to CLI arguments.
"""

import pytest
from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig


@pytest.fixture
def runner():
    """Create a ClaudeRunner instance for testing"""
    config = ClaudeRunnerConfig(
        claude_cli_path="claude",
        use_subscription=True,
    )
    return ClaudeRunner(config)


class TestToolFilteringCommandBuilding:
    """Test that tool filtering options are correctly added to CLI commands"""

    def test_allowed_tools_single(self, runner):
        """Test command building with a single allowed tool"""
        prompt = "Test prompt"
        options = {"allowed_tools": ["Read"]}

        command = runner._build_command(prompt, options)

        assert "--allowed-tools" in command
        assert "Read" in command
        # Verify format: --allowed-tools Read
        assert "--allowed-tools Read" in command

    def test_allowed_tools_multiple(self, runner):
        """Test command building with multiple allowed tools"""
        prompt = "Test prompt"
        options = {"allowed_tools": ["Read", "Write", "Bash"]}

        command = runner._build_command(prompt, options)

        assert "--allowed-tools" in command
        # Should be comma-separated
        assert "Read,Write,Bash" in command

    def test_disallowed_tools_single(self, runner):
        """Test command building with a single disallowed tool"""
        prompt = "Test prompt"
        options = {"disallowed_tools": ["Bash"]}

        command = runner._build_command(prompt, options)

        assert "--disallowed-tools" in command
        assert "Bash" in command

    def test_disallowed_tools_multiple(self, runner):
        """Test command building with multiple disallowed tools"""
        prompt = "Test prompt"
        options = {"disallowed_tools": ["Bash", "Edit", "Write"]}

        command = runner._build_command(prompt, options)

        assert "--disallowed-tools" in command
        # Should be comma-separated
        assert "Bash,Edit,Write" in command

    def test_both_allowed_and_disallowed(self, runner):
        """Test command building with both allowed and disallowed tools"""
        prompt = "Test prompt"
        options = {
            "allowed_tools": ["Read", "Grep"],
            "disallowed_tools": ["Bash", "Write"],
        }

        command = runner._build_command(prompt, options)

        # Both should be present
        assert "--allowed-tools" in command
        assert "Read,Grep" in command
        assert "--disallowed-tools" in command
        assert "Bash,Write" in command

    def test_empty_allowed_tools_not_added(self, runner):
        """Test that empty allowed_tools list is not added to command"""
        prompt = "Test prompt"
        options = {"allowed_tools": []}

        command = runner._build_command(prompt, options)

        # Empty list should not add the flag
        assert "--allowed-tools" not in command

    def test_empty_disallowed_tools_not_added(self, runner):
        """Test that empty disallowed_tools list is not added to command"""
        prompt = "Test prompt"
        options = {"disallowed_tools": []}

        command = runner._build_command(prompt, options)

        # Empty list should not add the flag
        assert "--disallowed-tools" not in command

    def test_no_tool_filtering_options(self, runner):
        """Test command building without any tool filtering"""
        prompt = "Test prompt"
        options = {}

        command = runner._build_command(prompt, options)

        assert "--allowed-tools" not in command
        assert "--disallowed-tools" not in command

    def test_tool_filtering_with_other_options(self, runner):
        """Test that tool filtering works alongside other options"""
        prompt = "Test prompt"
        options = {
            "session_id": "test-session-123",
            "model": "claude-sonnet-4-5-20250929",
            "allowed_tools": ["Read", "Write"],
            "working_directory": "/tmp/test",
        }

        command = runner._build_command(prompt, options)

        # All options should be present
        assert "--session-id test-session-123" in command
        assert "--model claude-sonnet-4-5-20250929" in command
        assert "--allowed-tools Read,Write" in command
        assert '"Test prompt"' in command

    def test_tool_filtering_with_mcp_config(self, runner):
        """Test that tool filtering works with MCP configuration"""
        prompt = "Test prompt"
        mcp_json = '{"mcpServers":{"test":{"command":"node","args":["server.js"]}}}'
        options = {
            "mcp_config": mcp_json,
            "mcp_strict": True,
            "allowed_tools": ["Read"],
            "disallowed_tools": ["Bash"],
        }

        command = runner._build_command(prompt, options)

        # All options should be present
        assert "--mcp-config" in command
        assert "--strict-mcp-config" in command
        assert "--allowed-tools Read" in command
        assert "--disallowed-tools Bash" in command

    def test_tool_names_with_special_characters(self, runner):
        """Test tool names are properly handled (no special shell escaping needed for tool names)"""
        prompt = "Test prompt"
        options = {"allowed_tools": ["mcp__server__tool", "Read", "custom-tool"]}

        command = runner._build_command(prompt, options)

        assert "--allowed-tools" in command
        assert "mcp__server__tool,Read,custom-tool" in command


class TestCommandStructure:
    """Test the overall command structure with tool filtering"""

    def test_command_has_required_base_flags(self, runner):
        """Test that base command structure is maintained with tool filtering"""
        prompt = "Test prompt"
        options = {"allowed_tools": ["Read"]}

        command = runner._build_command(prompt, options)

        # Verify base command structure
        assert command.startswith("claude")
        assert "-p" in command
        assert "--output-format stream-json" in command
        assert "--verbose" in command
        assert "--include-partial-messages" in command

    def test_tool_filtering_position_in_command(self, runner):
        """Test that tool filtering options are added in the correct position"""
        prompt = "Test prompt"
        options = {
            "session_id": "test-123",
            "model": "claude-sonnet-4-5-20250929",
            "allowed_tools": ["Read"],
        }

        command = runner._build_command(prompt, options)

        # Tool filtering should come after other options
        parts = command.split()

        # Find indices
        session_idx = parts.index("--session-id")
        model_idx = parts.index("--model")
        allowed_idx = parts.index("--allowed-tools")

        # Tool filtering should be after session and model
        assert allowed_idx > session_idx
        assert allowed_idx > model_idx
