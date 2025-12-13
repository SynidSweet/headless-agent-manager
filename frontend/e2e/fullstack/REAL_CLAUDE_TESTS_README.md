# Real Claude Code E2E Tests

## Overview

This test suite validates the **complete end-to-end integration** with **real Claude Code CLI** agents via the Python proxy service. These tests use reactive waiting strategies and deterministic prompts to ensure reliable validation of the full stack.

## File

- **Test File**: `real-claude-integration.spec.ts` (678 lines)
- **Test Count**: 8 tests (7 integration + 1 diagnostic)
- **Expected Duration**: 2-5 minutes

## Prerequisites

### 1. Python Proxy Service (REQUIRED)

```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

**Verify**: `curl http://localhost:8000/health` should return `{"status":"ok"}`

### 2. Backend Service (REQUIRED)

```bash
cd backend
npm run dev
```

**Verify**: `curl http://localhost:3000/api/agents` should return `[]`

**Environment**: Ensure `.env` has:
```bash
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
```

### 3. Frontend Service (REQUIRED)

```bash
cd frontend
npm run dev
```

**Verify**: Navigate to `http://localhost:5173` in browser

### 4. Claude CLI Authentication (REQUIRED)

```bash
claude auth login
```

**Verify**: `claude auth status` should show authenticated user

## Running Tests

### Run All Tests

```bash
cd frontend
npm run test:e2e -- real-claude-integration.spec.ts
```

### Run Specific Test

```bash
# Basic execution test
npm run test:e2e -- real-claude-integration.spec.ts -g "Real Claude agent executes command"

# Termination test
npm run test:e2e -- real-claude-integration.spec.ts -g "terminated mid-execution"

# Multi-agent test
npm run test:e2e -- real-claude-integration.spec.ts -g "Multiple real Claude agents"

# Persistence test
npm run test:e2e -- real-claude-integration.spec.ts -g "persist to database"

# UI update test
npm run test:e2e -- real-claude-integration.spec.ts -g "UI updates in real-time"

# Error handling test
npm run test:e2e -- real-claude-integration.spec.ts -g "handles errors gracefully"

# Long-running test
npm run test:e2e -- real-claude-integration.spec.ts -g "Long-Running Task"

# Diagnostic test
npm run test:e2e -- real-claude-integration.spec.ts -g "diagnostic"
```

### Run with Debug Output

```bash
DEBUG=pw:api npm run test:e2e -- real-claude-integration.spec.ts
```

## Test Descriptions

### 1. Basic Agent Launch and Message ⚡

**Duration**: ~30-60 seconds

**Validates**:
- Real Claude CLI can be launched via Python proxy
- Agent executes simple bash command (`echo "E2E_TEST_MARKER_12345"`)
- WebSocket events are emitted correctly (`agent:created`, `agent:message`, `agent:updated`)
- Messages contain expected content
- Agent completes successfully

**Strategy**: Deterministic bash command with unique marker, reactive waiting for events

### 2. Agent Termination 🛑

**Duration**: ~15-30 seconds

**Validates**:
- Real agents can be terminated mid-execution
- Termination works even during long-running commands (30s sleep)
- Status updates correctly to 'terminated'
- Backend cleanup works properly

**Strategy**: Launch long-running task, terminate after 5s, wait for status change

### 3. Multiple Agents Concurrently 🔀

**Duration**: ~60-90 seconds

**Validates**:
- Multiple real agents can run simultaneously
- Messages don't cross-contaminate between agents
- WebSocket filtering works correctly (agentId filtering)
- Database stores messages per agent correctly

**Strategy**: Launch 2 agents with different markers, verify no cross-contamination

### 4. Message Persistence 🗄️

**Duration**: ~30-60 seconds

**Validates**:
- Real Claude messages persist to database
- Messages can be retrieved via GET endpoint
- Database is the single source of truth
- WebSocket and database are in sync

**Strategy**: Wait for WebSocket message, then verify in database via API

### 5. UI Updates from Real Events 🖥️

**Duration**: ~60-90 seconds

**Validates**:
- Real Claude messages appear in UI
- UI updates in real-time from WebSocket events
- Agent cards display correctly
- Message display works with real data
- Full end-to-end flow works (API → Backend → WebSocket → Frontend → UI)

**Strategy**: Launch via API, wait for UI elements to appear, verify visibility

### 6. Error Handling ⚠️

**Duration**: ~60-90 seconds

**Validates**:
- Real agents handle errors gracefully
- Error messages are captured and displayed
- Agent status updates appropriately on error
- System remains stable after agent failure (can launch another agent)

**Strategy**: Launch agent with failing command (`exit 1`), verify status update, launch second agent

### 7. Long-Running Task 🕐

**Duration**: ~2-2.5 minutes

**Validates**:
- Real agents can handle longer tasks
- Streaming works for extended durations
- No timeout issues with real Claude responses
- Progressive message updates work correctly

**Strategy**: Multi-step task with sleeps, track message count during execution

### 8. Diagnostic Test 🔍

**Duration**: ~60 seconds

**Validates**:
- Captures all events and logs for debugging
- WebSocket message inspection
- Console log inspection
- Database state inspection
- Screenshot capture

**Strategy**: Launch agent and capture all diagnostic info for troubleshooting

## Test Strategy

### Reactive Waiting (NOT Hardcoded Timeouts)

All tests use **reactive event-driven waiting**:

```typescript
// ❌ BAD: Hardcoded timeout
await page.waitForTimeout(30000); // Hope 30s is enough?

// ✅ GOOD: Reactive waiting for specific event
await waitForWebSocketEvent(page, 'agent:message', {
  agentId,
  predicate: (data) => data.content?.includes('EXPECTED_TEXT'),
  timeout: 90000, // Generous timeout, but reactive
});
```

### Deterministic Prompts

All tests use **simple bash commands** with unique markers:

```typescript
// ✅ Deterministic prompt
prompt: 'Execute: echo "E2E_TEST_MARKER_12345"'

// NOT: Complex AI tasks with unpredictable outputs
// ❌ prompt: 'Write a Python script to analyze data'
```

### Agent ID Filtering

All WebSocket event waiting uses **agentId filtering** to prevent cross-contamination:

```typescript
// ✅ Filtered by agent ID
await waitForWebSocketEvent(page, 'agent:message', {
  agentId: 'specific-agent-id', // Only events from this agent
  timeout: 90000,
});
```

### Generous Timeouts

Real Claude is **slow** (~30-60 seconds to respond), so we use generous timeouts:

- **Creation events**: 10s (backend creates immediately)
- **Message events**: 90s (Claude processing time)
- **Completion events**: 120s (full agent lifecycle)

## Expected Results

### Success Criteria

When all tests pass, you should see:

```
✅ 8 passed (2-5 minutes)

Tests:
  ✓ Real Claude agent executes command and sends message
  ✓ Real Claude agent can be terminated mid-execution
  ✓ Multiple real Claude agents run concurrently without interference
  ✓ Real Claude messages persist to database
  ✓ UI updates in real-time from real Claude agent
  ✓ Real Claude agent handles errors gracefully
  ✓ Real Claude agent handles longer task with streaming
  ✓ diagnostic: capture all events and logs from real agent
```

### What This Proves

✅ **Full Stack Integration**: Real Claude CLI → Python Proxy → Backend → WebSocket → Frontend → UI
✅ **Event-Driven Architecture**: WebSocket events work correctly
✅ **Message Persistence**: Database is single source of truth
✅ **UI Reactivity**: Frontend updates in real-time
✅ **Concurrent Agents**: No cross-contamination
✅ **Error Handling**: System remains stable after failures
✅ **Lifecycle Management**: Start, run, stop, cleanup all work

## Troubleshooting

### Tests Skip with "Requires Python proxy"

**Cause**: Python proxy service not running or not accessible

**Fix**:
```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

Verify: `curl http://localhost:8000/health`

### Tests Timeout Waiting for Messages

**Cause**: Claude CLI not authenticated or API quota exceeded

**Fix**:
```bash
# Check authentication
claude auth status

# Re-authenticate if needed
claude auth login
```

### WebSocket Connection Issues

**Cause**: Backend not running or environment variables incorrect

**Fix**:
```bash
# Check backend .env
cat backend/.env | grep CLAUDE

# Should have:
# CLAUDE_ADAPTER=python-proxy
# CLAUDE_PROXY_URL=http://localhost:8000

# Restart backend
cd backend && npm run dev
```

### Agent Creation Fails

**Cause**: Backend can't reach Python proxy

**Fix**:
```bash
# Check backend logs for connection errors
cd backend && npm run dev

# Check Python proxy logs
cd claude-proxy-service && uvicorn app.main:app --reload

# Test connectivity
curl -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
```

### Messages Don't Appear in UI

**Cause**: WebSocket subscription not working or message filtering issue

**Fix**:
1. Run diagnostic test to capture all events: `npm run test:e2e -- real-claude-integration.spec.ts -g "diagnostic"`
2. Check `test-results/diagnostic-real-claude.png` screenshot
3. Review WebSocket messages in diagnostic output
4. Verify `window.socket` is available in browser console

## Cost

**$0** - All tests use Claude Max subscription via Python proxy (no API charges)

## Artifacts

Tests generate screenshots for debugging:

- `test-results/real-claude-ui-update.png` - UI update test screenshot
- `test-results/diagnostic-real-claude.png` - Diagnostic test screenshot

## Integration with CI/CD

### Skip in CI (Optional)

If you don't want these tests in CI (due to Claude authentication requirements):

```yaml
# .github/workflows/test.yml
- name: E2E Tests
  run: npm run test:e2e
  env:
    SKIP_REAL_CLAUDE_TESTS: true
```

Update test file:
```typescript
test.beforeAll(async () => {
  if (process.env.SKIP_REAL_CLAUDE_TESTS === 'true') {
    test.skip(true, 'Skipping real Claude tests in CI');
    return;
  }
  // ... rest of setup
});
```

### Run in CI (Recommended for Staging/Production)

1. Set up Claude CLI authentication in CI environment
2. Start Python proxy service as background job
3. Run tests with proper environment variables

```yaml
- name: Setup Claude CLI
  run: |
    # Install Claude CLI
    # Authenticate with service account

- name: Start Python Proxy
  run: |
    cd claude-proxy-service
    uvicorn app.main:app &

- name: Run Real Claude Tests
  run: npm run test:e2e -- real-claude-integration.spec.ts
```

## Related Documentation

- **E2E Testing Guide**: `/E2E_TESTING_GUIDE.md` - Complete E2E test setup
- **Python Proxy Solution**: `/PYTHON_PROXY_SOLUTION.md` - Python proxy architecture
- **Message State Architecture**: `/MESSAGE_STATE_ARCHITECTURE.md` - Message flow design
- **Existing Real Agent Tests**: `real-agent-flow.spec.ts` - Older real agent tests

## Contributing

When adding new real Claude tests:

1. ✅ Use deterministic prompts (bash commands with unique markers)
2. ✅ Use reactive waiting (waitForWebSocketEvent, not setTimeout)
3. ✅ Filter by agentId to prevent cross-contamination
4. ✅ Use generous timeouts (90s+ for message events)
5. ✅ Add test to TestContext for automatic cleanup
6. ✅ Add descriptive console logging for debugging
7. ✅ Document what the test validates in comments

## Questions?

See `/E2E_TESTING_GUIDE.md` or ask in #testing channel.
