# Claude Proxy Service

Python microservice that proxies Claude Code CLI for Node.js integration with Max subscription support.

## Why This Exists

**Problem**: Claude CLI doesn't work when spawned from Node.js `child_process` (GitHub #6775, #771)
**Solution**: Python's `subprocess` module works perfectly with Claude CLI
**Architecture**: HTTP proxy bridge between Node.js backend and Claude CLI

---

## Features

- ✅ Uses Claude Max subscription (no API costs)
- ✅ Real-time streaming via Server-Sent Events (SSE)
- ✅ Proper error handling and timeouts
- ✅ Health checks and monitoring
- ✅ Process lifecycle management (start/stop)
- ✅ Session resume support
- ✅ TDD with pytest

---

## Prerequisites

```bash
# Ubuntu/Debian
sudo apt install python3.12-venv python3-pip

# Or check if already installed
python3 --version  # Should be 3.9+
pip3 --version
```

---

## Setup

```bash
# Create virtual environment
cd claude-proxy-service
python3 -m venv venv

# Activate venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

## Run Tests (TDD)

```bash
# Activate venv first
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_claude_runner.py -v

# Watch mode (requires pytest-watch)
ptw
```

---

## Run Server

```bash
# Activate venv
source venv/bin/activate

# Development server (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## API Endpoints

### Health Check

```http
GET /health

Response 200:
{
  "status": "ok",
  "timestamp": "2025-11-09T12:00:00",
  "active_agents": 0
}
```

### Start Agent (Non-Streaming)

```http
POST /agent/start
Content-Type: application/json

{
  "prompt": "What is 2 + 2?",
  "session_id": "optional-session-id",
  "model": "claude-sonnet-4-5-20250929"
}

Response 200:
{
  "agent_id": "uuid",
  "pid": 12345,
  "status": "started"
}
```

### Stream Agent (SSE)

```http
POST /agent/stream
Content-Type: application/json

{
  "prompt": "Create a todo app"
}

Response 200 (text/event-stream):
data: {"type":"system","subtype":"init",...}

data: {"type":"assistant","message":{...}}

data: {"type":"result","subtype":"success",...}

event: complete
data: {}
```

### Stop Agent

```http
POST /agent/stop/{agent_id}

Response 200:
{
  "status": "stopped",
  "agent_id": "uuid"
}

Response 404:
{
  "detail": "Agent {agent_id} not found"
}
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│        Node.js Backend                   │
│                                          │
│  ClaudePythonProxyAdapter                │
│         │                                │
│         │ HTTP POST /agent/stream        │
│         ▼                                │
└─────────────────────────────────────────┘
          │
          │ HTTP (SSE Streaming)
          ▼
┌─────────────────────────────────────────┐
│    Python Proxy Service (Port 8000)     │
│                                          │
│  FastAPI App                             │
│    ├─ /agent/stream endpoint             │
│    └─ ClaudeRunner service               │
│           │                              │
│           │ subprocess.Popen()           │
│           ▼                              │
│      Claude CLI Process                  │
│      (Uses Max subscription)             │
│           │                              │
│           │ stdout (JSONL)               │
│           ▼                              │
│      Streams back via SSE                │
└─────────────────────────────────────────┘
```

---

## Project Structure

```
claude-proxy-service/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI app
│   └── claude_runner.py  # Claude CLI subprocess wrapper
├── tests/
│   ├── __init__.py
│   ├── test_claude_runner.py  # Runner tests
│   └── test_api.py             # API endpoint tests
├── requirements.txt
├── pyproject.toml
└── README.md
```

---

## Environment Variables

```bash
# Optional - defaults work for Claude Max
export CLAUDE_USE_SUBSCRIPTION=true

# Optional - override Claude CLI path
export CLAUDE_CLI_PATH=/path/to/claude
```

---

## Testing

### Unit Tests

```bash
pytest tests/test_claude_runner.py -v
```

### API Tests

```bash
pytest tests/test_api.py -v
```

### Integration Test (with real Claude CLI)

```bash
# Requires Claude CLI to be installed
pytest tests/test_integration.py -v
```

---

## Usage from Node.js

```typescript
// Example: Call Python proxy from Node.js
const response = await fetch('http://localhost:8000/agent/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'What is TypeScript?' })
});

// Read SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));
      console.log('Message:', data);
    }
  }
}
```

---

## Deployment

### Docker

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install Claude CLI
RUN wget https://get.claude.com/install.sh && bash install.sh

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app/ ./app/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose

See `../docker-compose.yml` for full stack deployment.

---

## Development

### Code Quality

```bash
# Format code
black app/ tests/

# Lint
ruff check app/ tests/

# Type checking
mypy app/
```

---

## Troubleshooting

### Claude CLI not found
```
Error: Failed to start Claude CLI: FileNotFoundError
Solution: Install Claude CLI or set CLAUDE_CLI_PATH
```

### No output from Claude
```
Symptom: SSE stream empty
Check: Is Claude CLI logged in? Run `claude` manually first
```

### Stream connection closed
```
Symptom: Connection closes prematurely
Check: Client timeout settings, nginx buffer configuration
```

---

**Version**: 0.1.0
**Status**: Ready for deployment (requires python3-venv package)
