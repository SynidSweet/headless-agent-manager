#!/usr/bin/env python3
"""
Agent Termination Test Script

Tests the complete agent termination flow:
1. Start an agent via Python proxy
2. Verify it's running
3. Send termination signal
4. Verify agent stops gracefully
5. Verify cleanup occurs
"""

import requests
import time
import json
import sys


BASE_URL = "http://localhost:8000"
BACKEND_URL = "http://localhost:3000"


def print_section(title: str):
    """Print a section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_proxy_health() -> bool:
    """Test if Python proxy is healthy"""
    print_section("1. Testing Python Proxy Health")

    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        health = response.json()

        print(f"✓ Proxy Status: {health['status']}")
        print(f"✓ Active Agents: {health['active_agents']}")
        print(f"✓ Timestamp: {health['timestamp']}")

        return health['status'] == 'ok'
    except Exception as e:
        print(f"✗ Proxy health check failed: {e}")
        return False


def test_backend_health() -> bool:
    """Test if backend is healthy"""
    print_section("2. Testing Backend Health")

    try:
        response = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        health = response.json()

        print(f"✓ Backend Status: {health['status']}")
        print(f"✓ Active Agents: {health.get('activeAgents', 0)}")
        print(f"✓ Database: {health.get('databaseStatus', 'unknown')}")

        return health['status'] == 'ok'
    except Exception as e:
        print(f"✗ Backend health check failed: {e}")
        return False


def launch_test_agent() -> dict:
    """Launch a test agent via backend API"""
    print_section("3. Launching Test Agent")

    payload = {
        "type": "claude-code",
        "prompt": "Please count from 1 to 10 slowly with 2 second pauses between each number. After counting, wait for further instructions.",
        "configuration": {
            "model": "claude-sonnet-4-5-20250929"
        }
    }

    try:
        print("Sending launch request...")
        response = requests.post(
            f"{BACKEND_URL}/api/agents",
            json=payload,
            timeout=30
        )

        if response.status_code != 201:
            print(f"✗ Launch failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return None

        agent = response.json()
        print(f"✓ Agent launched successfully")
        print(f"  Agent ID: {agent['id']}")
        print(f"  Status: {agent['status']}")
        print(f"  Type: {agent['type']}")

        return agent

    except Exception as e:
        print(f"✗ Launch failed: {e}")
        return None


def wait_for_agent_running(agent_id: str, timeout: int = 15) -> bool:
    """Wait for agent to reach RUNNING status"""
    print(f"\n⏳ Waiting for agent to start (up to {timeout}s)...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BACKEND_URL}/api/agents/{agent_id}")
            agent = response.json()
            status = agent['status']

            print(f"  Status: {status}")

            if status == 'running':
                print("✓ Agent is now RUNNING")
                return True
            elif status in ['failed', 'terminated', 'completed']:
                print(f"✗ Agent reached terminal state: {status}")
                return False

            time.sleep(1)

        except Exception as e:
            print(f"  Error checking status: {e}")
            time.sleep(1)

    print(f"✗ Timeout waiting for agent to start")
    return False


def terminate_agent(agent_id: str) -> bool:
    """Terminate the agent"""
    print_section("4. Terminating Agent")

    try:
        print(f"Sending termination request for agent {agent_id}...")
        response = requests.post(
            f"{BACKEND_URL}/api/agents/{agent_id}/terminate",
            timeout=10
        )

        if response.status_code != 200:
            print(f"✗ Termination failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return False

        print("✓ Termination request accepted")
        return True

    except Exception as e:
        print(f"✗ Termination request failed: {e}")
        return False


def verify_agent_terminated(agent_id: str, timeout: int = 10) -> bool:
    """Verify agent reaches TERMINATED status"""
    print(f"\n⏳ Verifying agent termination (up to {timeout}s)...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BACKEND_URL}/api/agents/{agent_id}")
            agent = response.json()
            status = agent['status']

            print(f"  Status: {status}")

            if status == 'terminated':
                print("✓ Agent successfully terminated")
                return True

            time.sleep(1)

        except Exception as e:
            print(f"  Error checking status: {e}")
            time.sleep(1)

    print(f"✗ Agent did not reach TERMINATED state within timeout")
    return False


def verify_proxy_cleanup() -> bool:
    """Verify Python proxy cleaned up the agent"""
    print_section("5. Verifying Proxy Cleanup")

    try:
        response = requests.get(f"{BASE_URL}/health")
        health = response.json()

        active_agents = health['active_agents']
        print(f"Active agents in proxy: {active_agents}")

        if active_agents == 0:
            print("✓ Proxy successfully cleaned up agent")
            return True
        else:
            print(f"✗ Proxy still has {active_agents} active agent(s)")
            return False

    except Exception as e:
        print(f"✗ Proxy health check failed: {e}")
        return False


def get_agent_details(agent_id: str):
    """Get and print agent details"""
    print_section("6. Final Agent Details")

    try:
        response = requests.get(f"{BACKEND_URL}/api/agents/{agent_id}")
        agent = response.json()

        print(f"Agent ID: {agent['id']}")
        print(f"Status: {agent['status']}")
        print(f"Type: {agent['type']}")
        print(f"Created At: {agent.get('createdAt', 'N/A')}")
        print(f"Updated At: {agent.get('updatedAt', 'N/A')}")

        if 'session' in agent:
            session = agent['session']
            print(f"\nSession:")
            print(f"  Prompt: {session.get('prompt', 'N/A')[:100]}...")
            print(f"  Session ID: {session.get('sessionId', 'N/A')}")

    except Exception as e:
        print(f"✗ Failed to get agent details: {e}")


def run_termination_test():
    """Run the complete termination test"""
    print("\n" + "="*60)
    print("  AGENT TERMINATION TEST")
    print("="*60)

    # Step 1: Check proxy health
    if not test_proxy_health():
        print("\n✗ TEST FAILED: Proxy not healthy")
        return False

    # Step 2: Check backend health
    if not test_backend_health():
        print("\n✗ TEST FAILED: Backend not healthy")
        return False

    # Step 3: Launch agent
    agent = launch_test_agent()
    if not agent:
        print("\n✗ TEST FAILED: Could not launch agent")
        return False

    agent_id = agent['id']

    # Step 4: Wait for agent to start
    if not wait_for_agent_running(agent_id):
        print("\n✗ TEST FAILED: Agent did not start")
        return False

    # Give agent a moment to actually do something
    print("\n⏳ Letting agent run for 3 seconds...")
    time.sleep(3)

    # Step 5: Terminate agent
    if not terminate_agent(agent_id):
        print("\n✗ TEST FAILED: Could not terminate agent")
        return False

    # Step 6: Verify termination
    if not verify_agent_terminated(agent_id):
        print("\n✗ TEST FAILED: Agent did not terminate properly")
        return False

    # Step 7: Verify cleanup
    if not verify_proxy_cleanup():
        print("\n✗ TEST FAILED: Proxy did not clean up")
        return False

    # Step 8: Get final details
    get_agent_details(agent_id)

    # Success!
    print_section("TEST RESULT")
    print("✓✓✓ ALL TESTS PASSED ✓✓✓")
    print("\nAgent termination flow works correctly:")
    print("  1. Agent launches successfully")
    print("  2. Agent reaches RUNNING state")
    print("  3. Termination signal sent successfully")
    print("  4. Agent reaches TERMINATED state")
    print("  5. Python proxy cleans up process")
    print("  6. Database state updated correctly")

    return True


if __name__ == "__main__":
    success = run_termination_test()
    sys.exit(0 if success else 1)
