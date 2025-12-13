# Agent Termination Test Suite

**Created**: 2025-12-02
**Purpose**: Comprehensive testing of agent termination functionality
**Endpoint**: `DELETE /api/agents/:id`

---

## Test Files Available

### 1. ✅ `test_termination_fixed.py` (RECOMMENDED)

**Enhanced Python test with proper DELETE endpoint**

**Features:**
- ✓ Colored terminal output (ANSI colors)
- ✓ Clear step-by-step progress
- ✓ Comprehensive error handling
- ✓ Uses CORRECT endpoint: `DELETE /api/agents/:id`
- ✓ Detailed test result summary
- ✓ Keyboard interrupt handling

**Usage:**
```bash
python3 test_termination_fixed.py
```

**Expected Output:**
```
======================================================================
  AGENT TERMINATION TEST
  Testing DELETE /api/agents/:id endpoint
======================================================================

Step 1: Backend Health Check
✓ Backend Status: ok
✓ Active Agents: 0
✓ Database: connected

Step 2: Python Proxy Health Check
✓ Proxy Status: ok
✓ Active Agents: 0

Step 3: Launch Test Agent
⏳ Sending agent launch request...
✓ Agent launched successfully
  Agent ID: <uuid>

Step 4: Wait for RUNNING Status
⏳ Waiting up to 15 seconds for agent to start...
  Current status: running
✓ Agent is now RUNNING

Step 5: Terminate Agent (DELETE Request)
⏳ Sending DELETE request to /api/agents/<uuid>
✓ Termination request accepted (HTTP 204)

Step 6: Verify TERMINATED Status
⏳ Checking for TERMINATED status (up to 10s)...
  Current status: terminated
✓ Agent successfully reached TERMINATED status

Step 7: Verify Proxy Cleanup
✓ Proxy successfully cleaned up all agent processes

======================================================================
  TEST RESULTS SUMMARY
======================================================================

  Backend Health           ✓ PASS
  Proxy Health             ✓ PASS
  Agent Launch             ✓ PASS
  Agent Running            ✓ PASS
  Termination Request      ✓ PASS
  Terminated Status        ✓ PASS
  Proxy Cleanup            ✓ PASS

======================================================================
  ✓✓✓ ALL TESTS PASSED ✓✓✓
======================================================================
```

---

### 2. ⚡ `quick_termination_test.sh`

**Fast bash-based test for quick verification**

**Features:**
- ✓ Pure bash (no Python dependencies)
- ✓ Fast execution (~10 seconds)
- ✓ Simple output
- ✓ Good for CI/CD pipelines

**Usage:**
```bash
bash quick_termination_test.sh
```

**Expected Output:**
```
==========================================
  QUICK AGENT TERMINATION TEST
==========================================

Step 1: Backend Health Check
✓ Backend Status: ok

Step 2: Proxy Health Check
✓ Proxy Status: ok

Step 3: Launch Agent
✓ Agent launched: <uuid>

Step 4: Wait for RUNNING Status
✓ Current status: running

Step 5: Terminate Agent (DELETE /api/agents/<uuid>)
✓ Termination accepted (HTTP 204)

Step 6: Verify TERMINATED Status
✓ Final status: terminated
✓ Agent successfully terminated

Step 7: Verify Proxy Cleanup
✓ Active agents in proxy: 0

==========================================
  ✓✓✓ ALL TESTS PASSED ✓✓✓
==========================================
```

---

### 3. ⚠️ `test_termination.py` (DEPRECATED)

**Original test with incorrect endpoint**

**Issue:** Uses `POST /api/agents/:id/terminate` (WRONG)
**Should Use:** `DELETE /api/agents/:id` (CORRECT)

**Status:** Kept for reference, use `test_termination_fixed.py` instead

---

## Prerequisites

### Backend Must Be Running
```bash
cd ../backend
npm run dev
```

**Verify:**
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok",...}
```

### Python Proxy Must Be Running
```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

**Verify:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","active_agents":0,...}
```

---

## Complete Test Flow

### 1. Health Checks
- ✓ Backend API responding
- ✓ Python proxy responding
- ✓ Database connected
- ✓ No active agents

### 2. Agent Launch
```bash
POST /api/agents
{
  "type": "claude-code",
  "prompt": "Count from 1 to 3 and wait",
  "configuration": {
    "model": "claude-sonnet-4-5-20250929"
  }
}
```

**Expected:** HTTP 201, agent ID returned

### 3. Status Verification (Pre-Termination)
```bash
GET /api/agents/:id
```

**Expected:** `"status": "running"`

### 4. Termination Request
```bash
DELETE /api/agents/:id
```

**Expected:** HTTP 204 No Content

### 5. Status Verification (Post-Termination)
```bash
GET /api/agents/:id
```

**Expected:**
- `"status": "terminated"`
- `"completedAt"` timestamp present

### 6. Proxy Cleanup Verification
```bash
GET http://localhost:8000/health
```

**Expected:** `"active_agents": 0`

---

## Architecture Flow

```
Client DELETE Request
    ↓
┌─────────────────────────────────────────┐
│ AgentController.terminateAgent()        │
│   - Receives DELETE /api/agents/:id     │
│   - Validates agent exists               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ AgentOrchestrationService.terminate()   │
│   - Get agent from repository            │
│   - Get runner from factory              │
│   - Call runner.stop()                   │
│   - Mark agent as terminated             │
│   - Save to database                     │
│   - Remove from active runners           │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ ClaudePythonProxyAdapter.stop()         │
│   - Extract Python agent ID              │
│   - Call proxy stop endpoint             │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Python Proxy: POST /agent/stop/:id      │
│   - Get process from active_processes    │
│   - Call process.terminate() (SIGTERM)  │
│   - Wait for graceful shutdown           │
│   - Force kill if needed (SIGKILL)      │
│   - Remove from active_processes         │
└─────────────────────────────────────────┘
    ↓
✓ Agent terminated successfully
```

---

## Expected Behavior

### ✅ Success Criteria

1. **HTTP Response**
   - DELETE returns HTTP 204 No Content
   - No error message

2. **Status Transition**
   - `running` → `terminated`
   - Timestamp: `completedAt` added

3. **Process Cleanup**
   - Python subprocess terminated
   - Removed from `active_processes`
   - Proxy health shows 0 active agents

4. **Database Persistence**
   - Agent status persisted as `terminated`
   - Timestamps correctly saved
   - Agent retrievable via GET endpoint

5. **WebSocket Event**
   - `agent:deleted` event broadcast
   - Frontend receives update

### ❌ Failure Scenarios

**Agent Not Found:**
```bash
DELETE /api/agents/invalid-id
# HTTP 404: Agent not found
```

**Agent Already Terminated:**
```bash
DELETE /api/agents/:id
# First call: HTTP 204 ✓
# Second call: HTTP 400 (Agent must be running to terminate)
```

**Force Delete (Testing):**
```bash
DELETE /api/agents/:id?force=true
# Deletes regardless of status (for cleanup)
```

---

## Troubleshooting

### Test Fails: "Backend not healthy"
```bash
# Check if backend is running
lsof -ti:3000

# Start backend
cd ../backend
npm run dev
```

### Test Fails: "Proxy not healthy"
```bash
# Check if proxy is running
lsof -ti:8000

# Start proxy
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

### Test Fails: "Agent did not terminate"
```bash
# Check backend logs
cd ../backend
tail -f /tmp/backend-*.log

# Check proxy logs
# Proxy logs appear in terminal where uvicorn is running
```

### Clean Up Stuck Agents
```bash
# Force delete all agents (requires backend running)
curl -X DELETE "http://localhost:3000/api/agents/AGENT_ID?force=true"

# Or restart both services
pkill -f "node.*backend"
pkill -f "uvicorn.*app.main"
```

---

## Performance Metrics

**Typical Test Duration:** ~15-20 seconds

**Breakdown:**
- Health checks: ~1 second
- Agent launch: ~1 second
- Wait for RUNNING: ~3 seconds
- Agent execution: ~3 seconds
- Termination: ~1 second
- Status verification: ~2 seconds
- Cleanup verification: ~1 second

**Process Termination:**
- SIGTERM timeout: 5 seconds
- SIGKILL fallback: Immediate

---

## Integration with Existing Tests

### Backend Tests
```bash
cd ../backend
npm test
```

**Includes:**
- Unit tests: Domain, Application, Infrastructure layers
- Integration tests: API endpoints, database
- E2E tests: Full agent lifecycle

### Frontend E2E Tests
```bash
cd ../frontend
npm run test:e2e
```

**File:** `frontend/e2e/agent-termination.spec.ts`

**Tests:**
1. Terminate button only shows for running agents
2. Completed agents do not show terminate button
3. Failed agents do not show terminate button
4. Clicking terminate does not select the agent

---

## Related Documentation

- **Main Test Results**: `TERMINATION_TEST_RESULTS.md`
- **E2E Guide**: `E2E_TEST_GUIDE.md`
- **API Reference**: `../docs/api-reference.md`
- **Architecture**: `../SPECIFICATION.md`

---

## Summary

✅ **Three test options available:**
1. **Recommended**: `test_termination_fixed.py` - Full featured, colored output
2. **Quick**: `quick_termination_test.sh` - Fast bash test
3. **Deprecated**: `test_termination.py` - Old version (wrong endpoint)

✅ **All tests verify:**
- Correct DELETE endpoint usage
- Status transitions
- Process cleanup
- Database persistence
- Proxy health

✅ **All tests passing as of 2025-12-02**

**Next Steps:**
1. Run `python3 test_termination_fixed.py`
2. Verify all steps pass
3. Check `TERMINATION_TEST_RESULTS.md` for detailed findings

---

**Last Updated**: 2025-12-02
**Test Status**: ✅ All Passing
**Maintainer**: Development Team
