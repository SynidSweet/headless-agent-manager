#!/usr/bin/env python3
"""
Event Emission Test Script
Tests WebSocket event emission in the Headless Agent Manager system

Events tested:
- connected: Client connection confirmation
- subscribed: Agent subscription confirmation
- agent:message: Real-time agent output streaming
- agent:completed: Agent completion event
- agent:failed: Agent failure event (if applicable)
- unsubscribed: Unsubscription confirmation

Prerequisites:
1. Backend running: cd backend && npm run dev
2. Python dependencies: pip install socketio requests
"""

import socketio
import requests
import time
import json
import sys
from typing import Dict, List, Any

# Configuration
BACKEND_URL = "http://localhost:3000"
WEBSOCKET_URL = "http://localhost:3000"

# Colors for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_success(msg: str):
    print(f"{Colors.GREEN}✓{Colors.RESET} {msg}")

def print_error(msg: str):
    print(f"{Colors.RED}✗{Colors.RESET} {msg}")

def print_info(msg: str):
    print(f"{Colors.BLUE}ℹ{Colors.RESET} {msg}")

def print_event(event: str, data: Any):
    print(f"{Colors.CYAN}📡 Event:{Colors.RESET} {Colors.BOLD}{event}{Colors.RESET}")
    print(f"{Colors.CYAN}   Data:{Colors.RESET} {json.dumps(data, indent=2)}")

class EventCollector:
    """Collects events for verification"""
    def __init__(self):
        self.events: List[Dict[str, Any]] = []
        self.connected = False
        self.subscribed = False
        self.messages_received = 0
        self.completed = False
        self.failed = False

    def record(self, event: str, data: Any):
        """Record an event"""
        self.events.append({
            'event': event,
            'data': data,
            'timestamp': time.time()
        })

        # Update flags
        if event == 'connected':
            self.connected = True
        elif event == 'subscribed':
            self.subscribed = True
        elif event == 'agent:message':
            self.messages_received += 1
        elif event == 'agent:completed':
            self.completed = True
        elif event == 'agent:failed':
            self.failed = True

    def get_events_by_type(self, event_type: str) -> List[Dict[str, Any]]:
        """Get all events of a specific type"""
        return [e for e in self.events if e['event'] == event_type]

    def print_summary(self):
        """Print event summary"""
        print(f"\n{Colors.BOLD}Event Summary:{Colors.RESET}")
        print(f"  Connected: {self.connected}")
        print(f"  Subscribed: {self.subscribed}")
        print(f"  Messages received: {self.messages_received}")
        print(f"  Completed: {self.completed}")
        print(f"  Failed: {self.failed}")
        print(f"  Total events: {len(self.events)}")

def check_backend_health() -> bool:
    """Check if backend is running"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        if response.status_code == 200:
            print_success("Backend is running")
            return True
        else:
            print_error(f"Backend returned status {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Backend not reachable: {e}")
        return False

def launch_agent() -> str:
    """Launch a test agent"""
    print_info("Launching test agent...")

    try:
        response = requests.post(
            f"{BACKEND_URL}/api/agents",
            json={
                "type": "claude-code",
                "prompt": "Say 'Hello from event test' and then say 'Event test complete'",
                "configuration": {}
            },
            timeout=10
        )

        if response.status_code == 201:
            data = response.json()
            agent_id = data['id']
            print_success(f"Agent launched: {agent_id}")
            return agent_id
        else:
            print_error(f"Failed to launch agent: {response.status_code}")
            print_error(response.text)
            return None

    except Exception as e:
        print_error(f"Error launching agent: {e}")
        return None

def test_event_emission():
    """Test WebSocket event emission"""
    print(f"\n{Colors.BOLD}=== Event Emission Test ==={Colors.RESET}\n")

    # Check backend
    if not check_backend_health():
        print_error("Please start the backend: cd backend && npm run dev")
        sys.exit(1)

    # Create event collector
    collector = EventCollector()

    # Create Socket.IO client
    sio = socketio.Client()

    # Event handlers
    @sio.on('connected')
    def on_connected(data):
        print_event('connected', data)
        collector.record('connected', data)

    @sio.on('subscribed')
    def on_subscribed(data):
        print_event('subscribed', data)
        collector.record('subscribed', data)

    @sio.on('agent:message')
    def on_agent_message(data):
        print_event('agent:message', data)
        collector.record('agent:message', data)

    @sio.on('agent:completed')
    def on_agent_completed(data):
        print_event('agent:completed', data)
        collector.record('agent:completed', data)

    @sio.on('agent:failed')
    def on_agent_failed(data):
        print_event('agent:failed', data)
        collector.record('agent:failed', data)

    @sio.on('unsubscribed')
    def on_unsubscribed(data):
        print_event('unsubscribed', data)
        collector.record('unsubscribed', data)

    @sio.on('error')
    def on_error(data):
        print_event('error', data)
        collector.record('error', data)

    try:
        # Connect to WebSocket
        print_info(f"Connecting to {WEBSOCKET_URL}...")
        sio.connect(WEBSOCKET_URL)

        # Wait for connection
        time.sleep(1)

        if not collector.connected:
            print_error("Did not receive 'connected' event")
            sio.disconnect()
            sys.exit(1)

        print_success("WebSocket connected")

        # Launch agent
        agent_id = launch_agent()
        if not agent_id:
            sio.disconnect()
            sys.exit(1)

        # Wait a bit for agent to initialize
        time.sleep(2)

        # Subscribe to agent
        print_info(f"Subscribing to agent {agent_id}...")
        sio.emit('subscribe', {'agentId': agent_id})

        # Wait for subscription
        time.sleep(1)

        if not collector.subscribed:
            print_error("Did not receive 'subscribed' event")
            sio.disconnect()
            sys.exit(1)

        print_success("Subscribed to agent")

        # Wait for agent messages
        print_info("Waiting for agent messages (max 30 seconds)...")
        start_time = time.time()
        max_wait = 30

        while time.time() - start_time < max_wait:
            if collector.completed or collector.failed:
                break
            time.sleep(1)

        # Check results
        print(f"\n{Colors.BOLD}Test Results:{Colors.RESET}\n")

        tests_passed = 0
        tests_total = 0

        # Test 1: Connected event
        tests_total += 1
        if collector.connected:
            print_success("Received 'connected' event")
            tests_passed += 1
        else:
            print_error("Did NOT receive 'connected' event")

        # Test 2: Subscribed event
        tests_total += 1
        if collector.subscribed:
            print_success("Received 'subscribed' event")
            tests_passed += 1
        else:
            print_error("Did NOT receive 'subscribed' event")

        # Test 3: Agent messages
        tests_total += 1
        if collector.messages_received > 0:
            print_success(f"Received {collector.messages_received} agent messages")
            tests_passed += 1
        else:
            print_error("Did NOT receive any agent messages")

        # Test 4: Completion/failure event
        tests_total += 1
        if collector.completed or collector.failed:
            status = "completed" if collector.completed else "failed"
            print_success(f"Received 'agent:{status}' event")
            tests_passed += 1
        else:
            print_error("Did NOT receive completion/failure event")

        # Test 5: Unsubscribe
        tests_total += 1
        print_info("Testing unsubscribe...")
        sio.emit('unsubscribe', {'agentId': agent_id})
        time.sleep(1)

        unsubscribe_events = collector.get_events_by_type('unsubscribed')
        if len(unsubscribe_events) > 0:
            print_success("Received 'unsubscribed' event")
            tests_passed += 1
        else:
            print_error("Did NOT receive 'unsubscribed' event")

        # Print summary
        collector.print_summary()

        # Final results
        print(f"\n{Colors.BOLD}Final Score:{Colors.RESET} {tests_passed}/{tests_total} tests passed")

        if tests_passed == tests_total:
            print(f"\n{Colors.GREEN}{Colors.BOLD}✓ ALL TESTS PASSED!{Colors.RESET}")
            exit_code = 0
        else:
            print(f"\n{Colors.RED}{Colors.BOLD}✗ SOME TESTS FAILED{Colors.RESET}")
            exit_code = 1

        # Disconnect
        sio.disconnect()

        sys.exit(exit_code)

    except Exception as e:
        print_error(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()

        try:
            sio.disconnect()
        except:
            pass

        sys.exit(1)

if __name__ == "__main__":
    test_event_emission()
