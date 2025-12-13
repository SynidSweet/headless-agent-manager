#!/usr/bin/env python3
"""
Agent Count Test

Simple E2E test to verify that the backend correctly counts agents:
- activeAgents: Number of agents in RUNNING status
- totalAgents: Total number of agents regardless of status

Test Strategy:
1. Launch multiple agents
2. Terminate some agents
3. Verify health endpoint returns correct counts
"""

import httpx
import time
import asyncio


BASE_URL = "http://localhost:3000/api"


async def test_agent_count():
    """Test agent counting via health endpoint"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("\n" + "=" * 60)
        print("AGENT COUNT TEST")
        print("=" * 60)

        # Step 1: Get initial state
        print("\n[1] Getting initial health state...")
        health = await client.get(f"{BASE_URL}/health")
        assert health.status_code == 200
        initial_data = health.json()
        initial_active = initial_data["activeAgents"]
        initial_total = initial_data["totalAgents"]
        print(f"    Initial counts: active={initial_active}, total={initial_total}")

        # Step 2: Launch first agent
        print("\n[2] Launching first agent...")
        agent1 = await client.post(
            f"{BASE_URL}/agents",
            json={
                "type": "claude-code",
                "prompt": "Say hello and exit",
                "configuration": {},
            },
        )
        assert agent1.status_code == 201
        agent1_data = agent1.json()
        agent1_id = agent1_data["agentId"]
        print(f"    Agent 1 launched: {agent1_id}")

        # Wait for agent to start
        await asyncio.sleep(1)

        # Step 3: Check count after first agent
        print("\n[3] Checking count after first agent...")
        health = await client.get(f"{BASE_URL}/health")
        assert health.status_code == 200
        data = health.json()
        print(f"    Counts: active={data['activeAgents']}, total={data['totalAgents']}")
        assert data["activeAgents"] == initial_active + 1, "Should have 1 more active agent"
        assert data["totalAgents"] == initial_total + 1, "Should have 1 more total agent"

        # Step 4: Launch second agent
        print("\n[4] Launching second agent...")
        agent2 = await client.post(
            f"{BASE_URL}/agents",
            json={
                "type": "claude-code",
                "prompt": "Count to 5 and exit",
                "configuration": {},
            },
        )
        assert agent2.status_code == 201
        agent2_data = agent2.json()
        agent2_id = agent2_data["agentId"]
        print(f"    Agent 2 launched: {agent2_id}")

        # Wait for agent to start
        await asyncio.sleep(1)

        # Step 5: Check count after second agent
        print("\n[5] Checking count after second agent...")
        health = await client.get(f"{BASE_URL}/health")
        assert health.status_code == 200
        data = health.json()
        print(f"    Counts: active={data['activeAgents']}, total={data['totalAgents']}")
        assert data["activeAgents"] == initial_active + 2, "Should have 2 more active agents"
        assert data["totalAgents"] == initial_total + 2, "Should have 2 more total agents"

        # Step 6: Terminate first agent
        print(f"\n[6] Terminating first agent ({agent1_id})...")
        terminate = await client.delete(f"{BASE_URL}/agents/{agent1_id}")
        print(f"    Terminate response status: {terminate.status_code}")
        assert terminate.status_code == 204, f"Expected 204, got {terminate.status_code}"
        print(f"    Agent terminated")

        # Wait for termination to complete
        await asyncio.sleep(1)

        # Step 7: Check count after termination
        print("\n[7] Checking count after termination...")
        health = await client.get(f"{BASE_URL}/health")
        assert health.status_code == 200
        data = health.json()
        print(f"    Counts: active={data['activeAgents']}, total={data['totalAgents']}")
        assert (
            data["activeAgents"] == initial_active + 1
        ), "Should have 1 active agent (agent2)"
        assert (
            data["totalAgents"] == initial_total + 2
        ), "Should still have 2 total agents"

        # Step 8: Terminate second agent
        print(f"\n[8] Terminating second agent ({agent2_id})...")
        terminate = await client.delete(f"{BASE_URL}/agents/{agent2_id}")
        assert terminate.status_code == 204, f"Expected 204, got {terminate.status_code}"
        print(f"    Agent terminated")

        # Wait for termination to complete
        await asyncio.sleep(1)

        # Step 9: Final count check
        print("\n[9] Checking final count...")
        health = await client.get(f"{BASE_URL}/health")
        assert health.status_code == 200
        data = health.json()
        print(f"    Counts: active={data['activeAgents']}, total={data['totalAgents']}")
        assert (
            data["activeAgents"] == initial_active
        ), "Should be back to initial active count"
        assert (
            data["totalAgents"] == initial_total + 2
        ), "Should still have 2 total agents (terminated agents remain in DB)"

        # Success!
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        print("\nSummary:")
        print(f"  - Launched 2 agents")
        print(f"  - Terminated 2 agents")
        print(f"  - Active count correctly tracked: {initial_active} → {initial_active + 2} → {initial_active + 1} → {initial_active}")
        print(f"  - Total count correctly tracked: {initial_total} → {initial_total + 2}")
        print()


if __name__ == "__main__":
    print("\n⚡ Agent Count Test")
    print("Prerequisites:")
    print("  1. Backend running on http://localhost:3000")
    print("  2. Python proxy running on http://localhost:8000")
    print("  3. Claude authenticated")
    print()

    try:
        asyncio.run(test_agent_count())
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n\n❌ TEST FAILED: {e}")
        import traceback

        traceback.print_exc()
        exit(1)
