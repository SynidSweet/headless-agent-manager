# Test Payload Reference Guide

Complete reference for all test payload structures in the Claude Proxy Service.

---

## Table of Contents

1. [API Request Payloads](#api-request-payloads)
2. [API Response Payloads](#api-response-payloads)
3. [Test Fixtures](#test-fixtures)
4. [Test Helper Patterns](#test-helper-patterns)
5. [Common Test Scenarios](#common-test-scenarios)

---

## API Request Payloads

### 1. Start Agent Request

**Endpoint**: `POST /agent/start`

**Basic Payload:**
```json
{
  "prompt": "What is 2 + 2?"
}
```

**Full Payload with All Options:**
```json
{
  "prompt": "Create a todo app",
  "session_id": "session-abc-123",
  "model": "claude-sonnet-4-5-20250929",
  "working_directory": "/home/user/projects/my-app",
  "mcp_config": "{\"mcpServers\":{\"filesystem\":{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-filesystem\",\"/path\"]}}}",
  "mcp_strict": true,
  "allowed_tools": ["Read", "Write", "Grep"],
  "disallowed_tools": ["Bash", "Edit"]
}
```

**Field Reference:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `prompt` | `string` | ✅ Yes | The prompt to send to Claude | `"What is TypeScript?"` |
| `session_id` | `string` | ❌ No | Resume a previous session | `"session-123"` |
| `model` | `string` | ❌ No | Claude model to use | `"claude-sonnet-4-5-20250929"` |
| `working_directory` | `string` | ❌ No | Working directory for CLI | `"/tmp/test"` |
| `mcp_config` | `string` | ❌ No | MCP configuration (JSON string) | See MCP section below |
| `mcp_strict` | `boolean` | ❌ No | Enable strict MCP mode | `true` |
| `allowed_tools` | `array[string]` | ❌ No | Whitelist of allowed tools | `["Read", "Write"]` |
| `disallowed_tools` | `array[string]` | ❌ No | Blacklist of disallowed tools | `["Bash"]` |

---

### 2. Stream Agent Request

**Endpoint**: `POST /agent/stream`

**Payload**: Same structure as `/agent/start` (see above)

```json
{
  "prompt": "Create a React component",
  "model": "claude-sonnet-4-5-20250929"
}
```

---

### 3. Stop Agent Request

**Endpoint**: `POST /agent/stop/{agent_id}`

**No JSON payload required** - agent_id is in the URL path.

**Example:**
```bash
POST /agent/stop/550e8400-e29b-41d4-a716-446655440000
```

---

## API Response Payloads

### 1. Health Check Response

**Endpoint**: `GET /health`

```json
{
  "status": "ok",
  "timestamp": "2025-11-09T12:00:00.123456",
  "active_agents": 2
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Service status (`"ok"` or `"error"`) |
| `timestamp` | `string` | ISO 8601 timestamp |
| `active_agents` | `number` | Count of running agents |

---

### 2. Start Agent Response

**Endpoint**: `POST /agent/start`

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "pid": 12345,
  "status": "started"
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | `string` | UUID for this agent |
| `pid` | `number` | Process ID of Claude CLI |
| `status` | `string` | Always `"started"` |

---

### 3. Stream Agent Response (SSE)

**Endpoint**: `POST /agent/stream`

**Content-Type**: `text/event-stream`

**Format**: Server-Sent Events (SSE)

**Example Stream:**
```
data: {"type":"system","subtype":"init","content":"Claude initialized"}

data: {"type":"user","content":"Create a todo app"}

data: {"type":"assistant","message":{"type":"text","text":"I'll help you create a todo app"}}

data: {"type":"assistant","message":{"type":"text","text":"Let me start by creating the HTML structure"}}

data: {"type":"tool_use","name":"Write","input":{"file_path":"todo.html","content":"<!DOCTYPE html>..."}}

data: {"type":"result","subtype":"success","stats":{"tokens":123,"time":5.2}}

event: complete
data: {}
```

**SSE Event Types:**

| Event Type | Description | Example |
|------------|-------------|---------|
| `data: {...}` | Standard message (default) | `data: {"type":"assistant",...}` |
| `event: complete` | Stream completed successfully | `event: complete\ndata: {}` |
| `event: error` | Stream encountered error | `event: error\ndata: {"error":"..."}` |

**Message Types in Data:**

| Type | Description | Fields |
|------|-------------|--------|
| `system` | System messages | `type`, `subtype`, `content` |
| `user` | User prompts | `type`, `content` |
| `assistant` | Assistant responses | `type`, `message` |
| `tool_use` | Tool executions | `type`, `name`, `input` |
| `result` | Final result | `type`, `subtype`, `stats` |

---

### 4. Stop Agent Response

**Endpoint**: `POST /agent/stop/{agent_id}`

**Success (200):**
```json
{
  "status": "stopped",
  "agent_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Not Found (404):**
```json
{
  "detail": "Agent 550e8400-e29b-41d4-a716-446655440000 not found"
}
```

---

## Test Fixtures

### Basic Test Payloads

**Minimal Request:**
```python
payload = {"prompt": "test prompt"}
```

**Test with Session ID:**
```python
payload = {
    "prompt": "test prompt",
    "session_id": "test-session-123"
}
```

**Test with Model:**
```python
payload = {
    "prompt": "test prompt",
    "model": "claude-sonnet-4-5-20250929"
}
```

**Test with Working Directory:**
```python
payload = {
    "prompt": "Run pwd and show current directory",
    "working_directory": "/tmp/test-dir"
}
```

---

### MCP Configuration Payloads

**Single MCP Server:**
```python
mcp_json = json.dumps({
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
        }
    }
})

payload = {
    "prompt": "List files in current directory",
    "mcp_config": mcp_json
}
```

**Multiple MCP Servers:**
```python
mcp_json = json.dumps({
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem"]
        },
        "brave-search": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-brave-search"],
            "env": {
                "BRAVE_API_KEY": "test-api-key"
            }
        }
    }
})

payload = {
    "prompt": "Search the web for Python tutorials",
    "mcp_config": mcp_json,
    "mcp_strict": true
}
```

---

### Tool Filtering Payloads

**Allowed Tools Only:**
```python
payload = {
    "prompt": "Read package.json",
    "allowed_tools": ["Read", "Grep"]
}
```

**Disallowed Tools:**
```python
payload = {
    "prompt": "Analyze the codebase",
    "disallowed_tools": ["Bash", "Edit", "Write"]
}
```

**Both Allowed and Disallowed:**
```python
payload = {
    "prompt": "Search for TODO comments",
    "allowed_tools": ["Read", "Grep", "Glob"],
    "disallowed_tools": ["Bash", "Write"]
}
```

**Tool Filtering with MCP:**
```python
mcp_json = json.dumps({
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem"]
        }
    }
})

payload = {
    "prompt": "List and read files",
    "mcp_config": mcp_json,
    "allowed_tools": ["Read", "mcp__filesystem__read_file"],
    "disallowed_tools": ["Bash"]
}
```

---

### Complete Payload Examples

**Full Feature Test:**
```python
payload = {
    "prompt": "Create a Python script that lists files",
    "session_id": "test-session-full-123",
    "model": "claude-sonnet-4-5-20250929",
    "working_directory": "/tmp/test-workspace",
    "mcp_config": json.dumps({
        "mcpServers": {
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }
        }
    }),
    "mcp_strict": True,
    "allowed_tools": ["Read", "Write", "Grep"],
    "disallowed_tools": ["Bash"]
}
```

---

## Test Helper Patterns

### Pytest Fixtures

**Test Client Fixture:**
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    """Provide test client for all tests"""
    return TestClient(app)
```

**Mock Process Fixture:**
```python
from unittest.mock import MagicMock

@pytest.fixture
def mock_process():
    """Mock subprocess.Popen"""
    process = MagicMock()
    process.pid = 12345
    process.returncode = None
    return process
```

**Runner Fixture:**
```python
from app.claude_runner import ClaudeRunner, ClaudeRunnerConfig

@pytest.fixture
def runner():
    """Create ClaudeRunner instance"""
    config = ClaudeRunnerConfig(
        claude_cli_path="claude",
        use_subscription=True
    )
    return ClaudeRunner(config)
```

---

### Mock Patterns

**Mock Start Agent:**
```python
from unittest.mock import patch, MagicMock

@patch("app.claude_runner.ClaudeRunner.start_agent")
def test_example(mock_start, client):
    # Arrange
    mock_process = MagicMock()
    mock_process.pid = 12345
    mock_start.return_value = mock_process

    # Act
    response = client.post("/agent/start", json={"prompt": "test"})

    # Assert
    assert response.status_code == 200
    assert response.json()["pid"] == 12345
```

**Mock Stream Response:**
```python
@patch("app.claude_runner.ClaudeRunner.start_agent")
@patch("app.claude_runner.ClaudeRunner.async_read_stream")
def test_stream(mock_read, mock_start, client):
    # Arrange
    mock_process = MagicMock()
    mock_start.return_value = mock_process

    async def mock_gen(process):
        yield '{"type":"system","content":"init"}'
        yield '{"type":"assistant","content":"response"}'

    mock_read.side_effect = mock_gen

    # Act
    response = client.post("/agent/stream", json={"prompt": "test"})

    # Assert
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
```

---

### Assertion Patterns

**JSON Response Assertions:**
```python
# Check status code
assert response.status_code == 200

# Check JSON structure
data = response.json()
assert "agent_id" in data
assert "pid" in data
assert isinstance(data["agent_id"], str)
assert isinstance(data["pid"], int)

# Check specific values
assert data["status"] == "started"
```

**SSE Stream Assertions:**
```python
# Check headers
assert response.status_code == 200
assert "text/event-stream" in response.headers["content-type"]
assert response.headers.get("X-Agent-Id")

# Check stream content
content = response.text
assert "data: " in content
assert '{"type":"system"' in content
```

**Error Response Assertions:**
```python
# Check error status
assert response.status_code == 500

# Check error detail
data = response.json()
assert "detail" in data
assert "Claude not found" in data["detail"]
```

---

## Common Test Scenarios

### 1. Basic API Tests

**Health Check:**
```python
def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data
```

**Start Agent:**
```python
@patch("app.claude_runner.ClaudeRunner.start_agent")
def test_start_agent(mock_start, client):
    # Arrange
    mock_process = MagicMock()
    mock_process.pid = 12345
    mock_start.return_value = mock_process

    # Act
    response = client.post("/agent/start", json={"prompt": "test"})

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["pid"] == 12345
    assert "agent_id" in data
```

---

### 2. Validation Tests

**Missing Required Field:**
```python
def test_start_requires_prompt(client):
    response = client.post("/agent/start", json={})
    assert response.status_code == 422  # Validation error
```

**Invalid Field Type:**
```python
def test_invalid_allowed_tools_type(client):
    response = client.post(
        "/agent/start",
        json={"prompt": "test", "allowed_tools": "not-an-array"}
    )
    assert response.status_code == 422
```

---

### 3. Error Handling Tests

**Runtime Error:**
```python
@patch("app.claude_runner.ClaudeRunner.start_agent")
def test_start_error(mock_start, client):
    # Arrange
    mock_start.side_effect = RuntimeError("Claude not found")

    # Act
    response = client.post("/agent/start", json={"prompt": "test"})

    # Assert
    assert response.status_code == 500
    assert "Claude not found" in response.json()["detail"]
```

**Agent Not Found:**
```python
@patch("app.main.active_processes")
def test_stop_not_found(mock_processes, client):
    # Arrange
    mock_processes.get.return_value = None

    # Act
    response = client.post("/agent/stop/non-existent")

    # Assert
    assert response.status_code == 404
```

---

### 4. Feature Integration Tests

**Session Resume:**
```python
@patch("app.claude_runner.ClaudeRunner.start_agent")
def test_session_resume(mock_start, client):
    # Arrange
    mock_process = MagicMock()
    mock_start.return_value = mock_process

    # Act
    response = client.post(
        "/agent/start",
        json={
            "prompt": "Continue from before",
            "session_id": "session-123"
        }
    )

    # Assert
    assert response.status_code == 200
    call_args = mock_start.call_args
    assert call_args[0][1]["session_id"] == "session-123"
```

**Tool Filtering:**
```python
def test_tool_filtering(runner):
    # Arrange
    prompt = "test"
    options = {"allowed_tools": ["Read", "Write"]}

    # Act
    command = runner._build_command(prompt, options)

    # Assert
    assert "--allowed-tools Read,Write" in command
```

**MCP Configuration:**
```python
def test_mcp_config(runner):
    # Arrange
    prompt = "test"
    mcp_json = json.dumps({
        "mcpServers": {
            "test": {"command": "node"}
        }
    })
    options = {"mcp_config": mcp_json, "mcp_strict": True}

    # Act
    command = runner._build_command(prompt, options)

    # Assert
    assert "--mcp-config" in command
    assert "--strict-mcp-config" in command
```

---

## Testing Best Practices

### 1. Use Fixtures for Repeated Setup
```python
@pytest.fixture
def standard_payload():
    return {
        "prompt": "test prompt",
        "model": "claude-sonnet-4-5-20250929"
    }

def test_with_fixture(client, standard_payload):
    response = client.post("/agent/start", json=standard_payload)
    assert response.status_code == 200
```

### 2. Parametrize Similar Tests
```python
@pytest.mark.parametrize("endpoint", ["/health"])
def test_endpoints(endpoint, client):
    response = client.get(endpoint)
    assert response.status_code in [200, 404]
```

### 3. Test Edge Cases
```python
def test_empty_allowed_tools(runner):
    command = runner._build_command("test", {"allowed_tools": []})
    assert "--allowed-tools" not in command
```

### 4. Mock External Dependencies
```python
# Always mock ClaudeRunner.start_agent in API tests
# Only use real subprocess in integration tests
```

---

## Reference Links

- **API Documentation**: See `README.md`
- **Test Files**:
  - `tests/test_api.py` - API endpoint tests
  - `tests/test_claude_runner.py` - Runner unit tests
  - `tests/test_tool_filtering.py` - Tool filtering tests
- **Source Code**:
  - `app/main.py` - API endpoints and models
  - `app/claude_runner.py` - CLI wrapper logic

---

**Last Updated**: 2025-12-12
**Version**: 1.0.0
