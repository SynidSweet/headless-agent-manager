# E2E Testing Guide - Claude Proxy Service

## Overview

This guide covers End-to-End (E2E) testing for the Claude Proxy Service, which acts as a bridge between Node.js and the Claude CLI.

---

## Test Structure

```
tests/
├── __init__.py
├── test_api.py                    # API endpoint tests (unit-level)
├── test_claude_runner.py          # Claude runner tests (unit-level)
├── test_streaming_realtime.py     # Real-time streaming tests
└── (future) test_e2e_integration.py  # Full E2E integration tests
```

---

## Quick Start

### Run All Tests

```bash
# Option 1: Using pytest directly
source venv/bin/activate
pytest -v

# Option 2: Using the test runner script
./run_e2e_tests.sh

# Option 3: With coverage report
pytest --cov=app --cov-report=html
```

### Run Specific Test Files

```bash
# API endpoint tests
pytest tests/test_api.py -v

# Claude runner tests
pytest tests/test_claude_runner.py -v

# Streaming tests
pytest tests/test_streaming_realtime.py -v
```

### Run Specific Test Classes

```bash
# Test health endpoint
pytest tests/test_api.py::TestHealthEndpoint -v

# Test start agent endpoint
pytest tests/test_api.py::TestStartAgentEndpoint -v

# Test stream endpoint
pytest tests/test_api.py::TestStreamEndpoint -v

# Test stop agent endpoint
pytest tests/test_api.py::TestStopAgentEndpoint -v
```

---

## Current Test Coverage

### 1. Health Endpoint Tests (`test_api.py::TestHealthEndpoint`)

Tests the `/health` endpoint:
- ✅ Returns 200 OK status
- ✅ Returns status field with "ok" value
- ✅ Includes timestamp

### 2. Start Agent Endpoint Tests (`test_api.py::TestStartAgentEndpoint`)

Tests the `/agent/start` endpoint:
- ✅ Accepts prompt parameter
- ✅ Returns agent ID and PID
- ✅ Requires prompt (422 validation error)
- ✅ Accepts optional session_id
- ✅ Handles errors (500 on failure)

### 3. Stream Endpoint Tests (`test_api.py::TestStreamEndpoint`)

Tests the `/agent/stream` endpoint:
- ✅ Returns Server-Sent Events (SSE)
- ✅ Streams JSONL lines in real-time
- ✅ Uses correct content-type (text/event-stream)

### 4. Stop Agent Endpoint Tests (`test_api.py::TestStopAgentEndpoint`)

Tests the `/agent/stop/{agent_id}` endpoint:
- ✅ Terminates running process
- ✅ Returns 404 for non-existent agents

---

## E2E Testing Strategy

### Current Tests (Unit-Level with Mocks)

The existing tests use **mocking** to isolate the API layer from the Claude CLI:

```python
@patch("app.claude_runner.ClaudeRunner.start_agent")
def test_start_agent_accepts_prompt(self, mock_start):
    # Mock prevents actual Claude CLI execution
    mock_process = MagicMock()
    mock_process.pid = 12345
    mock_start.return_value = mock_process

    response = self.client.post("/agent/start", json={"prompt": "test"})
    assert response.status_code == 200
```

**Benefits:**
- Fast execution (no CLI spawning)
- No external dependencies
- Reliable CI/CD
- Test API logic in isolation

**Limitations:**
- Doesn't test actual Claude CLI integration
- Doesn't verify real streaming behavior
- Doesn't catch CLI-specific issues

### Future E2E Tests (Full Integration)

For complete E2E coverage, we need tests that:

1. **Actually spawn Claude CLI** (no mocks)
2. **Verify real streaming** (JSONL parsing)
3. **Test error scenarios** (CLI not found, auth failures)
4. **Validate process lifecycle** (start, stream, stop)

Example future E2E test:

```python
# tests/test_e2e_integration.py (to be created)

@pytest.mark.e2e
@pytest.mark.slow
def test_full_agent_lifecycle():
    """
    Full E2E test: Start Claude CLI, receive real output, stop process

    Prerequisites:
    - Claude CLI must be installed
    - User must be authenticated (`claude login`)
    """
    client = TestClient(app)

    # 1. Start agent with real prompt
    response = client.post(
        "/agent/stream",
        json={"prompt": "What is 2 + 2? Reply with just the number."}
    )

    # 2. Verify SSE streaming
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    # 3. Parse streamed output
    lines = response.text.split("\n")
    messages = [json.loads(line[6:]) for line in lines if line.startswith("data: ")]

    # 4. Verify message structure
    assert any(msg["type"] == "assistant" for msg in messages)
    assert any("4" in msg.get("content", "") for msg in messages)

    # 5. Verify completion
    assert any(msg["type"] == "result" for msg in messages)
```

---

## Running E2E Tests Against Real Claude CLI

### Prerequisites

1. **Install Claude CLI:**
   ```bash
   curl -sS https://get.claude.com/install.sh | bash
   ```

2. **Authenticate:**
   ```bash
   claude login
   ```

3. **Verify authentication:**
   ```bash
   claude -p "What is 2 + 2?"
   # Should return a response
   ```

### Run Integration Tests

```bash
# Run only E2E tests (when implemented)
pytest -v -m e2e

# Skip E2E tests (for CI/CD)
pytest -v -m "not e2e"
```

---

## Testing the Full Stack (Node.js + Python)

For **full system E2E tests** (Node.js backend → Python proxy → Claude CLI):

### Option 1: Backend Smoke Tests

The Node.js backend has smoke tests that test the full stack:

```bash
# In backend directory
cd ../backend
npm run test:smoke
```

This runs tests like:
- `backend/test/e2e/smoke/python-proxy.smoke.spec.ts`
- Tests `ClaudePythonProxyAdapter` → Python service → Claude CLI

### Option 2: Manual E2E Test

```bash
# Terminal 1: Start Python proxy
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start Node.js backend
cd ../backend
npm run dev

# Terminal 3: Test with curl
curl -N http://localhost:8000/agent/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is TypeScript?"}'

# Expected: Real-time SSE stream from Claude CLI
```

---

## Common Test Commands

```bash
# Run all tests with verbose output
pytest -v

# Run with coverage report
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_api.py::TestHealthEndpoint::test_health_endpoint_returns_200 -v

# Run tests matching pattern
pytest -k "health" -v

# Show print statements
pytest -v -s

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf

# Run tests in parallel (requires pytest-xdist)
pytest -n auto
```

---

## Troubleshooting

### Tests Fail: "ModuleNotFoundError: No module named 'app'"

**Solution:**
```bash
# Ensure you're in claude-proxy-service directory
cd claude-proxy-service

# Activate venv
source venv/bin/activate

# Verify Python path
python3 -c "import sys; print(sys.path)"
```

### Tests Fail: "pytest: command not found"

**Solution:**
```bash
# Install pytest in venv
source venv/bin/activate
pip install pytest pytest-cov
```

### Tests Fail: "FastAPI not found"

**Solution:**
```bash
# Install dependencies
source venv/bin/activate
pip install -r requirements.txt
```

### E2E Tests Fail: "Claude CLI not found"

**Solution:**
```bash
# Install Claude CLI
curl -sS https://get.claude.com/install.sh | bash

# Authenticate
claude login

# Verify
claude -p "test"
```

---

## Test Development Workflow (TDD)

Following Test-Driven Development (TDD) principles:

### RED → GREEN → REFACTOR

1. **RED**: Write failing test first
   ```bash
   # Create new test in tests/test_api.py
   def test_new_feature():
       response = client.post("/new-endpoint")
       assert response.status_code == 200

   # Run test (should fail)
   pytest tests/test_api.py::test_new_feature -v
   ```

2. **GREEN**: Implement minimal code to pass
   ```python
   # In app/main.py
   @app.post("/new-endpoint")
   async def new_endpoint():
       return {"status": "ok"}

   # Run test (should pass)
   pytest tests/test_api.py::test_new_feature -v
   ```

3. **REFACTOR**: Improve code quality
   ```python
   # Add validation, error handling, etc.
   # Re-run tests to ensure they still pass
   pytest -v
   ```

---

## Next Steps

### Recommended E2E Tests to Add

1. **Full Agent Lifecycle Test**
   - Start agent → Stream output → Stop agent
   - Verify process cleanup

2. **Error Handling Test**
   - Claude CLI not found
   - Authentication failure
   - Invalid prompt format

3. **Session Resume Test**
   - Start agent with session_id
   - Resume conversation
   - Verify context preservation

4. **Concurrent Agent Test**
   - Start multiple agents simultaneously
   - Verify isolation
   - Verify no resource leaks

5. **Load Test**
   - Stress test with many concurrent requests
   - Verify graceful degradation
   - Verify proper cleanup

---

## Resources

- **Project Documentation**: `../SPECIFICATION.md`
- **Backend Tests**: `../backend/test/e2e/smoke/`
- **Python Proxy README**: `./README.md`
- **FastAPI Testing Docs**: https://fastapi.tiangolo.com/tutorial/testing/
- **Pytest Documentation**: https://docs.pytest.org/

---

**Last Updated**: 2025-12-02
**Status**: Unit tests complete, E2E integration tests recommended
**Test Count**: 20+ unit tests, 0 full E2E tests (yet)
