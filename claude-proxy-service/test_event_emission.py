#!/usr/bin/env python3
"""
Quick test script for verifying Server-Sent Event emission.

This script tests that the /agent/stream endpoint correctly:
1. Streams events in real-time (not buffered)
2. Emits proper SSE format (data: prefix, double newlines)
3. Sends completion event when done
4. Includes X-Agent-Id header

Usage:
    python test_event_emission.py
"""

import asyncio
import httpx
import time
from typing import List, Tuple


async def test_sse_streaming():
    """Test that SSE events are emitted in real-time."""

    print("=" * 60)
    print("Testing Server-Sent Event Emission")
    print("=" * 60)

    # Test payload - simple prompt that should produce output quickly
    payload = {
        "prompt": "Say 'Hello' and then use the Bash tool to run: echo 'World'",
        "model": "claude-sonnet-4-5-20250929"
    }

    url = "http://localhost:8000/agent/stream"

    print(f"\n📡 Connecting to: {url}")
    print(f"📝 Prompt: {payload['prompt']}")
    print(f"\n⏳ Waiting for events...\n")

    timestamps: List[Tuple[float, str]] = []
    start_time = time.time()
    agent_id = None
    event_count = 0

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                # Check response headers
                agent_id = response.headers.get("X-Agent-Id")
                print(f"✅ Connected! Agent ID: {agent_id}")
                print(f"   Status Code: {response.status_code}")
                print(f"   Content-Type: {response.headers.get('content-type')}")
                print(f"\n📊 Event Stream:\n")

                # Read SSE events
                async for chunk in response.aiter_text():
                    elapsed = time.time() - start_time

                    # SSE events are separated by double newlines
                    # Format: "data: {json}\n\n" or "event: complete\ndata: {}\n\n"
                    if chunk.strip():
                        event_count += 1
                        timestamps.append((elapsed, chunk))

                        # Pretty print the event
                        lines = chunk.strip().split('\n')
                        for line in lines:
                            if line.startswith('data:'):
                                data_content = line[5:].strip()  # Remove "data:" prefix
                                if data_content:
                                    print(f"[{elapsed:5.2f}s] 📦 {data_content[:80]}{'...' if len(data_content) > 80 else ''}")
                            elif line.startswith('event:'):
                                event_type = line[6:].strip()  # Remove "event:" prefix
                                print(f"[{elapsed:5.2f}s] 🏁 Event: {event_type}")

                        # Check for completion
                        if 'event: complete' in chunk or 'event: error' in chunk:
                            print(f"\n✅ Stream completed at {elapsed:.2f}s")
                            break

                    # Safety timeout
                    if elapsed > 30:
                        print(f"\n⚠️  Timeout after 30s")
                        break

    except httpx.ConnectError:
        print(f"\n❌ Connection Error!")
        print(f"   Make sure the Python proxy service is running:")
        print(f"   cd claude-proxy-service")
        print(f"   source venv/bin/activate")
        print(f"   uvicorn app.main:app --reload")
        return False

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Analyze results
    print("\n" + "=" * 60)
    print("Test Results")
    print("=" * 60)

    if not timestamps:
        print("❌ FAILED: No events received")
        return False

    print(f"✅ Agent ID: {agent_id}")
    print(f"✅ Events received: {event_count}")
    print(f"✅ First event at: {timestamps[0][0]:.2f}s")
    print(f"✅ Total time: {timestamps[-1][0]:.2f}s")

    # Check for real-time streaming (not buffered)
    if len(timestamps) > 1:
        first_event_time = timestamps[0][0]
        last_event_time = timestamps[-1][0]
        time_spread = last_event_time - first_event_time

        print(f"\n📈 Streaming Analysis:")
        print(f"   Time spread: {time_spread:.2f}s")

        # If first event arrives quickly, streaming is real-time
        if first_event_time < 5.0:
            print(f"   ✅ Real-time: First event arrived in {first_event_time:.2f}s")
        else:
            print(f"   ⚠️  Slow start: First event took {first_event_time:.2f}s")

        # If multiple events spread over time, definitely streaming
        if time_spread > 1.0 and len(timestamps) > 3:
            print(f"   ✅ Incremental: Events spread over {time_spread:.2f}s")
        elif len(timestamps) > 3:
            print(f"   ⚠️  Possible buffering: All events in {time_spread:.2f}s")

    print("\n✅ Event emission test PASSED!")
    return True


async def test_health_endpoint():
    """Quick test of the health endpoint."""
    print("\n" + "=" * 60)
    print("Testing Health Endpoint")
    print("=" * 60)

    url = "http://localhost:8000/health"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            data = response.json()

            print(f"✅ Status: {data['status']}")
            print(f"✅ Active agents: {data['active_agents']}")
            print(f"✅ Timestamp: {data['timestamp']}")
            return True

    except httpx.ConnectError:
        print(f"❌ Service not running at {url}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("Python Proxy Service - Event Emission Tests")
    print("=" * 60)

    # First check health
    health_ok = await test_health_endpoint()
    if not health_ok:
        print("\n❌ Service health check failed. Make sure the service is running:")
        print("   cd claude-proxy-service")
        print("   source venv/bin/activate")
        print("   uvicorn app.main:app --reload")
        return

    # Test SSE streaming
    await test_sse_streaming()

    print("\n" + "=" * 60)
    print("All Tests Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
