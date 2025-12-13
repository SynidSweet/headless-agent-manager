# Python Proxy Tests - Quick Reference

## Overview

Some E2E tests require the Python proxy service to be running for real Claude CLI integration. These tests will **skip gracefully** if the service is unavailable.

## Quick Start

### Option 1: Run Tests Without Python Proxy (Tests Skip)
```bash
# Just run tests normally
cd frontend
npm run test:e2e -- fullstack/

# Result: Python proxy tests will skip with clear messaging
# ⚠️  17 tests skipped (Python proxy not available)
```

### Option 2: Run Tests With Python Proxy (Full Integration)
```bash
# Terminal 1: Start Python proxy
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2: Run tests
cd frontend
npm run test:e2e -- fullstack/

# Result: All tests run with real Claude CLI
# ✅ 17+ tests pass (full integration validation)
```

## Which Tests Require Python Proxy?

### Tests That REQUIRE Python Proxy (will skip if unavailable)
- ✅ `fullstack/real-agent-flow.spec.ts` (6 tests)
- ✅ `fullstack/database-verification.spec.ts` (4 tests)
- ✅ `fullstack/diagnostic-websocket.spec.ts` (1 test)
- ✅ `fullstack/streaming-deduplication.spec.ts` (2 tests)
- ✅ `fullstack/event-driven.spec.ts` (multiple tests)

**Total**: 17 tests

### Tests That DON'T Require Python Proxy (always run)
- ✅ `fullstack/event-driven-core.spec.ts`
- ✅ `fullstack/event-driven-advanced.spec.ts`
- ✅ `fullstack/synthetic-agents.spec.ts`
- ✅ `fullstack/phase1-verification.spec.ts`

**These use synthetic agents and run without Python proxy**

## Console Messages

### When Python Proxy Is Unavailable
```
⚠️  Python proxy not running at http://localhost:8000
   Tests requiring Python proxy will be skipped
   Start it: cd claude-proxy-service && uvicorn app.main:app --reload

✅ Required services running:
   Backend:      http://localhost:3000
   Frontend:     http://localhost:5173
   Python Proxy: http://localhost:8000 ⚠️  (not available - tests will skip)

⚠️  Python proxy not available - skipping all tests in real-agent-flow.spec.ts
   Start service: cd claude-proxy-service && uvicorn app.main:app --reload

Results:
  17 skipped   ← Python proxy tests
  X passed     ← Other tests
```

### When Python Proxy Is Available
```
✅ All services running:
   Backend:      http://localhost:3000
   Frontend:     http://localhost:5173
   Python Proxy: http://localhost:8000 ✅

Results:
  X passed     ← All tests run
```

## Troubleshooting

### "How do I start the Python proxy service?"
```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

### "How do I check if Python proxy is running?"
```bash
# Check if port 8000 is in use
lsof -ti:8000

# Or try health check
curl http://localhost:8000/health
```

### "Can I run just the tests that don't need Python proxy?"
```bash
# Run synthetic agent tests only
npm run test:e2e -- fullstack/synthetic-agents.spec.ts
npm run test:e2e -- fullstack/event-driven-core.spec.ts
npm run test:e2e -- fullstack/event-driven-advanced.spec.ts
```

### "I want to run Python proxy tests - how do I know if service is working?"
```bash
# Check Python proxy health
curl http://localhost:8000/health

# Expected response:
{"status": "ok"}

# If not running, start it:
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

## Implementation Details

### Skip Logic Pattern
```typescript
test.beforeAll(async () => {
  env = await setupFullStackTest();

  // Check if Python proxy is available
  if (!env.pythonProxyAvailable) {
    console.log('⚠️  Python proxy not available - skipping tests');
  }
});

test.beforeEach(async () => {
  // Skip test if Python proxy not available
  test.skip(!env.pythonProxyAvailable, 'Requires Python proxy service on port 8000');
});
```

### Helper Function
```typescript
// frontend/e2e/helpers/pythonProxyHelper.ts
export async function isPythonProxyAvailable(url?: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

## When to Run Python Proxy Tests

### Regular Development
- Skip them (run tests without Python proxy)
- Faster feedback loop
- Focus on synthetic agent tests

### Before Releases
- Run them (start Python proxy service)
- Full integration validation
- Ensure real Claude CLI works

### CI/CD
- Can be configured to skip or run
- Set up Python proxy service in CI if needed
- Or mark as optional/manual tests

## Benefits

✅ **No false failures** - Tests skip cleanly when proxy unavailable
✅ **Clear messaging** - Developers know exactly what's needed
✅ **Optional validation** - Run full integration when needed
✅ **Faster development** - Don't block on Python proxy setup
✅ **Production confidence** - Can validate real Claude CLI before release

## Questions?

See full implementation details in:
- `/PYTHON_PROXY_TEST_SKIP_SUMMARY.md` - Complete implementation summary
- `/E2E_TESTING_GUIDE.md` - Full E2E testing guide
- `CLAUDE.md` - Project documentation

---

**Status**: ✅ Implemented
**Tests Affected**: 17 tests across 5 files
**Outcome**: Graceful skipping with helpful messages
