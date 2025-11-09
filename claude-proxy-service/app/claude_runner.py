"""
Claude CLI Runner Service
Handles spawning and managing Claude CLI processes with Max subscription support.
"""

import os
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterator, Optional


@dataclass
class ClaudeRunnerConfig:
    """Configuration for Claude CLI runner"""

    claude_cli_path: str = "claude"
    use_subscription: bool = True
    default_model: str = "claude-sonnet-4-5-20250929"
    default_max_tokens: int = 4096


class ClaudeRunner:
    """
    Service for running Claude CLI processes.
    Handles Max subscription authentication and subprocess management.
    """

    def __init__(self, config: ClaudeRunnerConfig):
        """Initialize Claude runner with configuration"""
        self.config = config

    def start_agent(
        self, prompt: str, options: Dict[str, Any]
    ) -> subprocess.Popen[bytes]:
        """
        Start a Claude CLI agent process.

        Args:
            prompt: The user prompt
            options: Additional options (session_id, model, etc.)

        Returns:
            subprocess.Popen: The running process

        Raises:
            RuntimeError: If Claude CLI fails to start
        """
        try:
            # Build command
            command = self._build_command(prompt, options)

            # Prepare environment
            env = self._prepare_environment()

            # Spawn process
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                shell=True,  # Required for Claude CLI to work
            )

            return process

        except (FileNotFoundError, OSError) as e:
            raise RuntimeError(f"Failed to start Claude CLI: {e}") from e

    def stop_agent(
        self, process: subprocess.Popen[bytes], timeout: float = 5.0
    ) -> None:
        """
        Stop a running Claude CLI process.

        Args:
            process: The process to stop
            timeout: How long to wait before force kill (seconds)
        """
        if process.poll() is not None:
            # Already stopped
            return

        # Try graceful termination
        process.terminate()

        # Wait for termination
        start_time = time.time()
        while time.time() - start_time < timeout:
            if process.poll() is not None:
                return
            time.sleep(0.1)

        # Force kill if still running
        process.kill()
        process.wait()

    def read_stream(self, process: subprocess.Popen[bytes]) -> Iterator[str]:
        """
        Read lines from process stdout.

        Args:
            process: The subprocess to read from

        Yields:
            str: Lines from stdout
        """
        if not process.stdout:
            return

        for line in process.stdout:
            # Decode from bytes to string
            decoded = line.decode("utf-8").strip()
            if decoded:
                yield decoded

    def _build_command(self, prompt: str, options: Dict[str, Any]) -> str:
        """Build Claude CLI command string"""
        parts = [
            self.config.claude_cli_path,
            "-p",
            f'"{prompt}"',  # Quote prompt for shell safety
            "--output-format",
            "stream-json",
            "--verbose",  # Required for stream-json
        ]

        # Add session ID if provided
        if "session_id" in options:
            parts.extend(["--session-id", options["session_id"]])

        # Add model if provided
        if "model" in options:
            parts.extend(["--model", options["model"]])

        return " ".join(parts)

    def _prepare_environment(self) -> Dict[str, str]:
        """
        Prepare environment variables for Claude CLI.
        Removes API key and enables subscription mode.
        """
        env = os.environ.copy()

        # Remove API key to force subscription auth
        env.pop("ANTHROPIC_API_KEY", None)

        # Enable subscription mode
        if self.config.use_subscription:
            env["CLAUDE_USE_SUBSCRIPTION"] = "true"

        return env
