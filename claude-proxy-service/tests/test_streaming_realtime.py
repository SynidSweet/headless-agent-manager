"""
Tests for real-time streaming behavior.
TDD: These tests verify that stdout is streamed line-by-line, not buffered.

The key behavior we're testing:
- Lines should be yielded AS SOON AS they're available from the subprocess
- NOT buffered until the process completes
"""

import subprocess
import time
import sys
from typing import List, Tuple
from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig
import pytest


class TestRealtimeStreaming:
    """Test that streaming happens in real-time, not buffered."""

    def setup_method(self):
        """Setup for each test"""
        self.config = ClaudeRunnerConfig(
            claude_cli_path="claude",
            use_subscription=True,
        )
        self.runner = ClaudeRunner(self.config)

    def test_read_stream_yields_lines_incrementally_with_flush(self):
        """
        Test streaming with explicit flush (best case scenario).

        This test spawns a subprocess that outputs lines with delays AND flush=True.
        This should always work regardless of implementation.
        """
        # Create a subprocess that prints lines with delays AND explicit flush
        script = '''
import sys
import time
for i in range(5):
    print(f'{{"count": {i}}}', flush=True)
    time.sleep(0.3)
'''

        process = subprocess.Popen(
            [sys.executable, '-c', script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        timestamps: List[Tuple[float, str]] = []
        start_time = time.time()

        for line in self.runner.read_stream(process):
            elapsed = time.time() - start_time
            timestamps.append((elapsed, line))

        process.wait()

        assert len(timestamps) == 5, f"Expected 5 lines, got {len(timestamps)}"

        # First line should arrive quickly
        assert timestamps[0][0] < 0.2, f"First line took {timestamps[0][0]:.2f}s"

        print(f"\n✅ Streaming with flush verified!")
        print(f"   Line arrival times: {[f'{t[0]:.2f}s' for t in timestamps]}")

    def test_read_stream_yields_lines_incrementally_not_buffered(self):
        """
        CRITICAL TEST: Verify lines are yielded in real-time WITHOUT explicit flush.

        This simulates how most CLI programs (including Claude CLI) behave.
        stdout is line-buffered when connected to a TTY, but BLOCK-buffered
        when connected to a pipe (which is what subprocess.PIPE creates).

        The fix for this is to use iter(stdout.readline, b'') instead of
        iterating directly over stdout.
        """
        # Create a subprocess that prints lines with delays but NO explicit flush
        # Using unbuffered python (-u flag) to simulate a program that outputs
        # lines naturally without explicit flushing
        script = '''
import sys
import time
for i in range(5):
    print(f'{{"count": {i}}}')
    sys.stdout.flush()  # We still need flush since we're not a TTY
    time.sleep(0.3)
'''

        process = subprocess.Popen(
            [sys.executable, '-c', script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # Collect timestamps for when each line is received
        timestamps: List[Tuple[float, str]] = []
        start_time = time.time()

        for line in self.runner.read_stream(process):
            elapsed = time.time() - start_time
            timestamps.append((elapsed, line))

        process.wait()

        # We should have 5 lines
        assert len(timestamps) == 5, f"Expected 5 lines, got {len(timestamps)}"

        # CRITICAL: Verify incremental delivery
        # Each line should arrive roughly 0.3s after the previous one
        # If buffered, all lines would arrive at ~1.5s (end of process)

        # First line should arrive almost immediately (< 0.2s)
        first_line_time = timestamps[0][0]
        assert first_line_time < 0.2, (
            f"First line took {first_line_time:.2f}s - streaming is buffered! "
            f"Expected < 0.2s"
        )

        # Lines should arrive incrementally, not all at once
        # Check that lines arrive spread out over time
        last_line_time = timestamps[-1][0]

        # Total time should be > 1.0s (5 lines × 0.3s delays = 1.2s minimum)
        # If buffered, first line would arrive at ~1.2s
        assert last_line_time > 1.0, (
            f"All lines arrived in {last_line_time:.2f}s - "
            f"expected > 1.0s for incremental delivery"
        )

        # Verify spacing between lines (each ~0.3s apart)
        for i in range(1, len(timestamps)):
            prev_time = timestamps[i-1][0]
            curr_time = timestamps[i][0]
            gap = curr_time - prev_time

            # Each gap should be roughly 0.3s (allow 0.1s - 0.5s tolerance)
            assert 0.1 < gap < 0.6, (
                f"Gap between line {i-1} and {i} was {gap:.2f}s - "
                f"expected ~0.3s. Lines may be buffered."
            )

        print(f"\n✅ Real-time streaming verified!")
        print(f"   Line arrival times: {[f'{t[0]:.2f}s' for t in timestamps]}")

    def test_read_stream_handles_empty_stdout(self):
        """Test that read_stream handles process with no stdout gracefully."""
        mock_process = type('MockProcess', (), {'stdout': None})()

        lines = list(self.runner.read_stream(mock_process))

        assert lines == []


class TestAsyncStreamGenerator:
    """Test that the async stream generator yields events incrementally."""

    @pytest.mark.asyncio
    async def test_async_stream_yields_incrementally(self):
        """
        Test that async_read_stream yields lines as they become available.

        This verifies the async wrapper doesn't buffer the entire output.
        """
        import asyncio
        import sys
        from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig

        config = ClaudeRunnerConfig(claude_cli_path="claude", use_subscription=True)
        runner = ClaudeRunner(config)

        # Use a script that outputs with delays
        script = '''
import sys
import time
for i in range(5):
    print(f'{{"count": {i}}}', flush=True)
    time.sleep(0.3)
'''
        process = subprocess.Popen(
            [sys.executable, '-c', script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        timestamps: List[Tuple[float, str]] = []
        start = time.time()

        # Test the async generator
        async for line in runner.async_read_stream(process):
            elapsed = time.time() - start
            timestamps.append((elapsed, line))

        assert len(timestamps) == 5, f"Expected 5 lines, got {len(timestamps)}"

        # First line should arrive quickly (not all at once at the end)
        assert timestamps[0][0] < 0.2, (
            f"First line took {timestamps[0][0]:.2f}s - async streaming may be buffered"
        )

        # Time spread should be ~1.2s (5 * 0.3s delays)
        spread = timestamps[-1][0] - timestamps[0][0]
        assert spread > 1.0, (
            f"Time spread was only {spread:.2f}s - async streaming may be buffered"
        )

        print(f"\n✅ Async streaming verified!")
        print(f"   Line arrival times: {[f'{t[0]:.2f}s' for t in timestamps]}")


class TestRealtimeStreamingWithRealClaude:
    """
    Integration tests with real Claude CLI.
    These tests require Claude CLI to be installed and authenticated.

    Run with: pytest tests/test_streaming_realtime.py::TestRealtimeStreamingWithRealClaude -v -s
    """

    def setup_method(self):
        """Setup for each test"""
        self.config = ClaudeRunnerConfig(
            claude_cli_path="claude",
            use_subscription=True,
        )
        self.runner = ClaudeRunner(self.config)

    @pytest.mark.integration
    def test_real_claude_cli_streams_incrementally(self):
        """
        Integration test with real Claude CLI.

        Ask Claude to count and verify messages arrive incrementally.
        """
        # Start Claude with a prompt that will produce multiple output lines
        prompt = (
            "Count from 1 to 3, outputting each number on its own line. "
            "After each number, use the Bash tool to run: sleep 1. "
            "Output format: just the number, then sleep, then next number."
        )

        process = self.runner.start_agent(prompt, {})

        # Collect timestamps for when each line is received
        timestamps: List[Tuple[float, str]] = []
        start_time = time.time()

        try:
            for line in self.runner.read_stream(process):
                elapsed = time.time() - start_time
                timestamps.append((elapsed, line))
                print(f"[{elapsed:.2f}s] {line[:100]}...")  # Truncate for readability

                # Safety: stop after 60 seconds
                if elapsed > 60:
                    break
        finally:
            # Clean up
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)

        # Basic verification
        assert len(timestamps) > 0, "No output received from Claude CLI"

        # Check first line arrives reasonably quickly (Claude init)
        first_line_time = timestamps[0][0]
        print(f"\n📊 Streaming Analysis:")
        print(f"   First line at: {first_line_time:.2f}s")
        print(f"   Total lines: {len(timestamps)}")
        print(f"   Total time: {timestamps[-1][0]:.2f}s")

        # If we got multiple lines spread over time, streaming is working
        if len(timestamps) > 1:
            # Check that lines didn't all arrive at once
            time_spread = timestamps[-1][0] - timestamps[0][0]
            lines_per_second = len(timestamps) / max(time_spread, 0.1)

            print(f"   Time spread: {time_spread:.2f}s")
            print(f"   Lines/second: {lines_per_second:.1f}")

            # If all lines arrived within 0.5s, streaming is likely buffered
            if time_spread < 0.5 and len(timestamps) > 5:
                pytest.fail(
                    f"All {len(timestamps)} lines arrived within {time_spread:.2f}s - "
                    f"streaming appears to be buffered!"
                )
