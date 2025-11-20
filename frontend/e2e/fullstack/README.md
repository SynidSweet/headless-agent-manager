# Full-Stack Integration Tests

## Overview

These tests validate the **COMPLETE real-world user flow** from browser to Claude CLI and back:

```
Browser (Playwright)
  ↓ HTTP/WS
Frontend (Vite)
  ↓ HTTP/WS
Backend (NestJS)
  ↓ HTTP
Python Proxy
  ↓ subprocess
Claude CLI
```

**Unlike other tests**, these tests use:
- ✅ Real browser with Playwright
- ✅ Real frontend dev server
- ✅ Real backend server
- ✅ Real Python proxy service
- ✅ Real Claude CLI subprocess
- ✅ Real WebSocket streaming
- ✅ Real DOM rendering

## Prerequisites

**All three services must be running before tests:**

```bash
# Terminal 1: Python Proxy
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

**Claude CLI must be authenticated:**
```bash
claude auth login
```

## Running Tests

```bash
# Run all full-stack tests
npm run test:fullstack

# Run with debug mode (opens browser)
npm run test:fullstack:debug

# Run specific test
npx playwright test e2e/fullstack/real-agent-flow.spec.ts -g "should display real Claude messages"
```

## Test Suite

### 1. Message Display Test ⭐ CRITICAL
**What it tests:**
- User launches agent in browser
- Real Claude CLI executes
- Messages stream back via WebSocket
- **Messages appear in browser DOM**

**Why it's critical:**
- This is what users actually see
- Would have caught the subscription bug
- Validates end-to-end integration

### 2. WebSocket Events Test
**What it tests:**
- WebSocket connection established
- Subscription confirmed
- Message events received
- Event payload structure

**Why it's important:**
- Validates real-time streaming
- Catches WebSocket configuration issues
- Confirms event broadcasting

### 3. Status Updates Test
**What it tests:**
- Agent status changes in real-time
- UI updates reflect backend state
- Status transitions work correctly

### 4. Agent Termination Test
**What it tests:**
- User can stop running agents
- Termination propagates to CLI
- UI updates correctly

### 5. Multiple Agents Test
**What it tests:**
- System handles concurrent agents
- WebSocket subscriptions isolated
- UI renders multiple agents correctly

### 6. Diagnostic Test 🔍
**What it does:**
- Captures ALL events (HTTP, WS, console)
- Takes screenshots
- Outputs detailed diagnostic info
- **Use this when debugging issues**

## Output

**Successful test:**
```
✅ Step 1: Page loaded
✅ Step 2: Form filled
✅ Step 3: Agent launched (ID: abc-123)
✅ Step 4: Agent card visible
✅ Step 5: Agent clicked
✅ Step 6: Messages found with selector: [data-message-type]
✅ Step 7: Message content verified
🎉 FULL-STACK TEST PASSED: Real Claude messages displayed!
```

**Failed test (messages not appearing):**
```
❌ NO MESSAGES APPEARED IN UI after 40 seconds
Screenshot saved: fullstack-test-failure.png
```

## Debugging

### If Tests Fail

1. **Check all services are running:**
   ```bash
   curl http://localhost:8000/health  # Python proxy
   curl http://localhost:3000/api/agents  # Backend
   curl http://localhost:5173  # Frontend
   ```

2. **Run diagnostic test:**
   ```bash
   npx playwright test e2e/fullstack/real-agent-flow.spec.ts -g "diagnostic"
   ```

   This will output:
   - All HTTP requests/responses
   - All WebSocket messages
   - Console logs
   - Screenshot (diagnostic-screenshot.png)

3. **Check browser console:**
   ```bash
   npm run test:fullstack:debug
   ```
   Opens browser so you can see console logs in real-time

4. **Check backend logs:**
   Look for:
   - "WebSocket client connected"
   - "Client subscribed to agent"
   - "Proxy message received"

### Common Issues

**Issue:** Tests timeout waiting for messages
**Cause:** WebSocket not broadcasting messages
**Debug:** Run diagnostic test, check if `agent:message` events exist

**Issue:** "Python proxy not running"
**Solution:** Start proxy: `cd claude-proxy-service && uvicorn app.main:app --reload`

**Issue:** "Backend not running"
**Solution:** Start backend: `cd backend && npm run dev`

**Issue:** Messages in WebSocket but not in DOM
**Cause:** Frontend not listening to correct event
**Debug:** Check browser console for WebSocket events

## Cost

**$0 per test run** (uses Claude Max subscription)

Typical run:
- 5 tests × ~20s each = ~100 seconds
- Uses ~5 Claude prompts
- Within Max quota limits

## CI/CD Integration

**Not recommended for every PR** (requires all services running)

**Recommended usage:**
- Run locally before releases
- Run in nightly builds
- Run when changing streaming/WebSocket code
- Run when adding new agent adapters

**GitHub Actions Example:**
```yaml
name: Full-Stack Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  fullstack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-python@v4

      # Start all services
      - name: Start Python Proxy
        run: |
          cd claude-proxy-service
          pip install -r requirements.txt
          uvicorn app.main:app &
          sleep 5

      - name: Start Backend
        run: |
          cd backend
          npm ci
          npm run dev &
          sleep 5

      - name: Start Frontend
        run: |
          cd frontend
          npm ci
          npm run dev &
          sleep 5

      # Run tests
      - name: Run Full-Stack Tests
        run: |
          cd frontend
          npm run test:fullstack

      - name: Upload Screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: frontend/*.png
```

## Comparison with Other Tests

| Test Type | Browser | Backend | Claude CLI | WebSocket | Cost | Speed |
|-----------|---------|---------|------------|-----------|------|-------|
| Unit | ❌ | ❌ | ❌ | ❌ | $0 | Fast |
| Integration | ❌ | ✅ (mocked) | ❌ | ❌ | $0 | Fast |
| Backend E2E | ❌ | ✅ (real) | ❌ | ❌ | $0 | Medium |
| Frontend E2E | ✅ | ✅ (mocked) | ❌ | ✅ (mocked) | $0 | Medium |
| Backend Smoke | ❌ | ✅ (real) | ✅ (real) | ❌ | $0 | Slow |
| **Full-Stack** | ✅ | ✅ | ✅ | ✅ | $0 | Slow |

**Full-stack tests** are the only tests that validate what users actually experience.

## When to Use

✅ **Use full-stack tests when:**
- Adding new features affecting message display
- Modifying WebSocket implementation
- Changing streaming logic
- Adding new agent types
- Before major releases
- Debugging user-reported issues

❌ **Don't use full-stack tests for:**
- Unit logic testing (too slow)
- Rapid TDD cycles (use unit tests)
- Every commit (use CI/CD integration tests)
- Testing non-streaming features

## Related Documentation

- `/TEST_INFRASTRUCTURE_AUDIT.md` - Complete test strategy
- `/FULLSTACK_INTEGRATION_TESTING.md` - Detailed explanation
- `/E2E_TESTING_GUIDE.md` - Frontend E2E test guide
- `backend/test/e2e/smoke/README.md` - Backend smoke tests

---

**Last Updated:** 2025-11-10
**Status:** Production Ready
**Test Count:** 6 tests (5 functional + 1 diagnostic)
