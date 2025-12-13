# Agent Termination - Quick Reference Card

## Run Tests

```bash
# Option 1: Enhanced Python test (RECOMMENDED)
python3 test_termination_fixed.py

# Option 2: Quick bash test
bash quick_termination_test.sh
```

## Manual Testing

```bash
# 1. Health checks
curl http://localhost:3000/api/health  # Backend
curl http://localhost:8000/health      # Proxy

# 2. Launch agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "claude-code",
    "prompt": "Count from 1 to 5",
    "configuration": {"model": "claude-sonnet-4-5-20250929"}
  }'
# Copy the agent ID from response

# 3. Check status
curl http://localhost:3000/api/agents/AGENT_ID

# 4. Terminate agent (CORRECT ENDPOINT)
curl -X DELETE http://localhost:3000/api/agents/AGENT_ID

# 5. Verify terminated
curl http://localhost:3000/api/agents/AGENT_ID
# Should show: "status": "terminated"
```

## Correct API Endpoint

✅ **CORRECT**: `DELETE /api/agents/:id`
❌ **WRONG**: `POST /api/agents/:id/terminate`

## Expected Flow

```
Launch → RUNNING → DELETE → TERMINATED → Cleanup
  ↓        ↓         ↓         ↓          ↓
 201      200       204       200      active=0
```

## Troubleshooting

```bash
# Backend not running?
cd ../backend && npm run dev

# Proxy not running?
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload

# Force cleanup stuck agent
curl -X DELETE "http://localhost:3000/api/agents/ID?force=true"
```

## Files

- `test_termination_fixed.py` - Enhanced test ⭐
- `quick_termination_test.sh` - Fast bash test
- `TERMINATION_TEST_SUITE.md` - Complete documentation
- `TERMINATION_TEST_RESULTS.md` - Test results from 2025-12-02
