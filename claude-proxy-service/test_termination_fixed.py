#!/usr/bin/env python3
"""
Agent Termination Test Script (Fixed)

Tests the complete agent termination flow with the CORRECT API endpoint:
- Uses DELETE /api/agents/:id (not POST /api/agents/:id/terminate)

Test Flow:
1. Health checks (backend + proxy)
2. Launch agent
3. Verify RUNNING status
4. Send DELETE termination request
5. Verify TERMINATED status
6. Verify proxy cleanup
"""

import requests
import time
import sys
from typing import Optional, Dict


BASE_URL = "http://localhost:8000"
BACKEND_URL = "http://localhost:3000"


class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_section(title: str):
    """Print a section header"""
    print(f"\n{Colors.BLUE}{'='*70}")
    print(f"  {Colors.BOLD}{title}{Colors.RESET}{Colors.BLUE}")
    print(f"{'='*70}{Colors.RESET}\n")


def print_success(message: str):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {message}{Colors.RESET}")


def print_error(message: str):
    """Print error message"""
    print(f"{Colors.RED}✗ {message}{Colors.RESET}")


def print_info(message: str):
    """Print info message"""
    print(f"{Colors.YELLOW}⏳ {message}{Colors.RESET}")


def test_backend_health() -> bool:
    """Test if backend is healthy"""
    print_section("Step 1: Backend Health Check")

    try:
        response = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        health = response.json()

        print_success(f"Backend Status: {health['status']}")
        print_success(f"Active Agents: {health.get('activeAgents', 0)}")
        print_success(f"Database: {health.get('databaseStatus', 'unknown')}")
        print_success(f"PID: {health.get('pid', 'N/A')}")

        return health['status'] == 'ok'
    except Exception as e:
        print_error(f"Backend health check failed: {e}")
        return False


def test_proxy_health() -> bool:
    """Test if Python proxy is healthy"""
    print_section("Step 2: Python Proxy Health Check")

    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        health = response.json()

        print_success(f"Proxy Status: {health['status']}")
        print_success(f"Active Agents: {health['active_agents']}")
        print_success(f"Timestamp: {health['timestamp']}")

        return health['status'] == 'ok'
    except Exception as e:
        print_error(f"Proxy health check failed: {e}")
        return False


def launch_test_agent() -> Optional[Dict]:
    """Launch a test agent via backend API"""
    print_section("Step 3: Launch Test Agent")

    payload = {
        "type": "claude-code",
        "prompt": "Count from 1 to 5, then wait for instructions",
        "configuration": {
            "model": "claude-sonnet-4-5-20250929"
        }
    }

    try:
        print_info("Sending agent launch request...")
        response = requests.post(
            f"{BACKEND_URL}/api/agents",
            json=payload,
            timeout=30
        )

        if response.status_code != 201:
            print_error(f"Launch failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            return None

        agent = response.json()
        print_success("Agent launched successfully")
        print(f"  Agent ID: {Colors.BOLD}{agent['id']}{Colors.RESET}")
        print(f"  Status: {agent['status']}")
        print(f"  Type: {agent['type']}")

        return agent

    except Exception as e:
        print_error(f"Launch failed: {e}")
        return None


def wait_for_running_status(agent_id: str, timeout: int = 15) -> bool:
    """Wait for agent to reach RUNNING status"""
    print_section("Step 4: Wait for RUNNING Status")

    print_info(f"Waiting up to {timeout} seconds for agent to start...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BACKEND_URL}/api/agents/{agent_id}")
            agent = response.json()
            status = agent['status']

            print(f"  Current status: {status}")

            if status == 'running':
                print_success("Agent is now RUNNING")
                return True
            elif status in ['failed', 'terminated', 'completed']:
                print_error(f"Agent reached unexpected terminal state: {status}")
                return False

            time.sleep(1)

        except Exception as e:
            print_error(f"Error checking status: {e}")
            time.sleep(1)

    print_error(f"Timeout waiting for RUNNING status")
    return False


def terminate_agent(agent_id: str) -> bool:
    """
    Terminate the agent using the CORRECT endpoint.

    CORRECT: DELETE /api/agents/:id
    WRONG: POST /api/agents/:id/terminate
    """
    print_section("Step 5: Terminate Agent (DELETE Request)")

    try:
        print_info(f"Sending DELETE request to /api/agents/{agent_id}")
        response = requests.delete(
            f"{BACKEND_URL}/api/agents/{agent_id}",
            timeout=10
        )

        # Expect 204 No Content
        if response.status_code == 204:
            print_success("Termination request accepted (HTTP 204)")
            return True
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            return False

    except Exception as e:
        print_error(f"Termination request failed: {e}")
        return False


def verify_terminated_status(agent_id: str, timeout: int = 10) -> bool:
    """Verify agent reaches TERMINATED status"""
    print_section("Step 6: Verify TERMINATED Status")

    print_info(f"Checking for TERMINATED status (up to {timeout}s)...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BACKEND_URL}/api/agents/{agent_id}")
            agent = response.json()
            status = agent['status']

            print(f"  Current status: {status}")

            if status == 'terminated':
                print_success("Agent successfully reached TERMINATED status")

                # Print lifecycle details
                print(f"\n  Lifecycle Details:")
                print(f"    Created: {agent.get('createdAt', 'N/A')}")
                print(f"    Started: {agent.get('startedAt', 'N/A')}")
                print(f"    Completed: {agent.get('completedAt', 'N/A')}")

                return True

            time.sleep(1)

        except Exception as e:
            print_error(f"Error checking status: {e}")
            time.sleep(1)

    print_error("Agent did not reach TERMINATED status within timeout")
    return False


def verify_proxy_cleanup() -> bool:
    """Verify Python proxy cleaned up the agent process"""
    print_section("Step 7: Verify Proxy Cleanup")

    try:
        response = requests.get(f"{BASE_URL}/health")
        health = response.json()

        active_agents = health['active_agents']

        print(f"  Active agents in proxy: {active_agents}")

        if active_agents == 0:
            print_success("Proxy successfully cleaned up all agent processes")
            return True
        else:
            print_error(f"Proxy still has {active_agents} active agent(s)")
            return False

    except Exception as e:
        print_error(f"Proxy health check failed: {e}")
        return False


def run_termination_test():
    """Run the complete termination test"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*70}")
    print(f"  AGENT TERMINATION TEST")
    print(f"  Testing DELETE /api/agents/:id endpoint")
    print(f"{'='*70}{Colors.RESET}\n")

    test_results = []

    # Test 1: Backend health
    result = test_backend_health()
    test_results.append(("Backend Health", result))
    if not result:
        print_error("\nTEST FAILED: Backend not healthy")
        return False

    # Test 2: Proxy health
    result = test_proxy_health()
    test_results.append(("Proxy Health", result))
    if not result:
        print_error("\nTEST FAILED: Proxy not healthy")
        return False

    # Test 3: Launch agent
    agent = launch_test_agent()
    test_results.append(("Agent Launch", agent is not None))
    if not agent:
        print_error("\nTEST FAILED: Could not launch agent")
        return False

    agent_id = agent['id']

    # Test 4: Wait for RUNNING
    result = wait_for_running_status(agent_id)
    test_results.append(("Agent Running", result))
    if not result:
        print_error("\nTEST FAILED: Agent did not start")
        return False

    # Give agent a moment to execute
    print_info("\nLetting agent run for 3 seconds...")
    time.sleep(3)

    # Test 5: Terminate agent
    result = terminate_agent(agent_id)
    test_results.append(("Termination Request", result))
    if not result:
        print_error("\nTEST FAILED: Could not terminate agent")
        return False

    # Test 6: Verify TERMINATED status
    result = verify_terminated_status(agent_id)
    test_results.append(("Terminated Status", result))
    if not result:
        print_error("\nTEST FAILED: Agent did not terminate properly")
        return False

    # Test 7: Verify cleanup
    result = verify_proxy_cleanup()
    test_results.append(("Proxy Cleanup", result))
    if not result:
        print_error("\nTEST FAILED: Proxy did not clean up")
        return False

    # Success summary
    print_section("TEST RESULTS SUMMARY")

    for test_name, passed in test_results:
        status = f"{Colors.GREEN}✓ PASS{Colors.RESET}" if passed else f"{Colors.RED}✗ FAIL{Colors.RESET}"
        print(f"  {test_name:<25} {status}")

    print(f"\n{Colors.GREEN}{Colors.BOLD}{'='*70}")
    print(f"  ✓✓✓ ALL TESTS PASSED ✓✓✓")
    print(f"{'='*70}{Colors.RESET}\n")

    print(f"{Colors.BOLD}Verified Agent Termination Flow:{Colors.RESET}")
    print(f"  1. Backend & Proxy services healthy")
    print(f"  2. Agent launches successfully")
    print(f"  3. Agent reaches RUNNING state")
    print(f"  4. DELETE /api/agents/:id sends termination signal")
    print(f"  5. Agent reaches TERMINATED state")
    print(f"  6. Python proxy cleans up subprocess")
    print(f"  7. Database state persisted correctly\n")

    return True


if __name__ == "__main__":
    try:
        success = run_termination_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Test interrupted by user{Colors.RESET}")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n{Colors.RED}Unexpected error: {e}{Colors.RESET}")
        sys.exit(1)
