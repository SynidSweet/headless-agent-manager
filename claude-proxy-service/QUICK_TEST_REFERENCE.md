# Quick Test Reference

## Run All E2E Tests
```bash
python -m pytest tests/test_e2e_full_lifecycle.py -v
```

## Run Specific Test Categories

### Infrastructure Tests
```bash
python -m pytest tests/test_e2e_prompt.py -v
```

### Agent Lifecycle
```bash
python -m pytest tests/test_e2e_full_lifecycle.py::TestFullAgentLifecycle -v
```

### Tool Filtering
```bash
python -m pytest tests/test_e2e_full_lifecycle.py::TestToolFiltering -v
```

### Termination & Cleanup
```bash
python -m pytest tests/test_e2e_full_lifecycle.py::TestAgentTermination -v
```

### Error Handling
```bash
python -m pytest tests/test_e2e_full_lifecycle.py::TestErrorHandling -v
```

### Concurrency
```bash
python -m pytest tests/test_e2e_full_lifecycle.py::TestConcurrency -v
```

## Run All Tests
```bash
# Exclude manual tests
python -m pytest tests/ -k "not manual" -v

# Include everything
python -m pytest tests/ -v
```

## Coverage Reports
```bash
# With coverage
python -m pytest tests/test_e2e_full_lifecycle.py --cov=app --cov-report=html

# View HTML report
open htmlcov/index.html
```

## Watch Mode (Development)
```bash
python -m pytest tests/test_e2e_full_lifecycle.py --looponfail
```

## Quick Health Check
```bash
# Test if service is running
curl http://localhost:8000/health

# Or with Python
python -c "from fastapi.testclient import TestClient; from app.main import app; print(TestClient(app).get('/health').json())"
```

## Test Results Summary

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| Infrastructure | 7 | ✅ Passing | 100% |
| Full Lifecycle | 21 | ✅ Passing | 85% |
| Tool Filtering | 4 | ✅ Passing | 100% |
| **Total** | **28+** | **✅ Passing** | **85%** |

## Common Test Patterns

### Test Agent Startup
```python
response = self.client.post("/agent/start", json={
    "prompt": "Your prompt",
    "working_directory": "/tmp"
})
assert response.status_code == 200
assert "agent_id" in response.json()
```

### Test Tool Filtering
```python
response = self.client.post("/agent/start", json={
    "prompt": "Test",
    "allowed_tools": ["Read", "Grep"],
    "disallowed_tools": ["Bash"]
})
assert response.status_code == 200
```

### Test MCP Configuration
```python
mcp_config = {
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
        }
    }
}
response = self.client.post("/agent/start", json={
    "prompt": "Test",
    "mcp_config": json.dumps(mcp_config),
    "mcp_strict": True
})
```

## Troubleshooting

### Tests Failing?
1. Check Python environment: `source venv/bin/activate`
2. Install dependencies: `pip install -r requirements.txt`
3. Verify app imports: `python -c "from app.main import app; print('OK')"`

### Slow Tests?
```bash
# Run with timing info
python -m pytest tests/test_e2e_full_lifecycle.py -v --durations=10
```

### Debug Single Test
```bash
# With print statements visible
python -m pytest tests/test_e2e_full_lifecycle.py::TestClass::test_name -s

# With debugger
python -m pytest tests/test_e2e_full_lifecycle.py::TestClass::test_name --pdb
```
