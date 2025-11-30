# Smoke Tests - Real Claude CLI Integration

## Overview

Smoke tests validate **real end-to-end integration** with Claude CLI via the Python proxy service. Unlike unit and integration tests that mock external dependencies, smoke tests use:

- ✅ **Real Claude CLI** (spawned via Python proxy)
- ✅ **Real streaming output** (actual JSONL from Claude)
- ✅ **Real authentication** (Claude Max subscription)
- ✅ **Real process management** (spawn, terminate, cleanup)

**Purpose**: Catch issues that mocked tests cannot detect:
- CLI output format changes
- Authentication failures
- Python proxy integration problems
- Real-world streaming behavior
- Process management issues

## Prerequisites

### 1. Python Proxy Service Running

The Python proxy service must be running before smoke tests can execute:

```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

Verify it's running:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

### 2. Claude CLI Authenticated

Ensure you're logged into Claude CLI with Max subscription:

```bash
claude auth login
```

Verify authentication:
```bash
claude auth status
```

### 3. Environment Configuration

Your `.env` should have:
```bash
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000
```

## Running Smoke Tests

### Run All Smoke Tests

```bash
npm run test:smoke
```

Expected output:
```
PASS test/e2e/smoke/python-proxy.smoke.spec.ts (67.8s)
  Python Proxy Smoke Tests (REAL)
    ✓ should verify Python proxy service is healthy (45ms)
    ✓ should verify Claude CLI is authenticated (52ms)
    ✓ should launch real Claude agent and complete successfully (18542ms)
    ✓ should terminate running Claude agent (5123ms)
    ✓ should process real Claude agent within reasonable time (16891ms)
    ✓ should handle errors from real Claude CLI gracefully (6234ms)
    ✓ should stream messages in real-time from real Claude agent (21456ms)
    ✓ should persist messages to database after agent completes (22178ms)
    ✓ should stream individual tokens from real Claude agent (16789ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Time:        67.842s
```

### Run Specific Test

```bash
npm run test:smoke -- -t "should launch real Claude agent"
```

### Verbose Output

```bash
npm run test:smoke -- --verbose
```

## Test Isolation

Smoke tests are **automatically excluded** from regular test runs:

```bash
npm test              # ✅ Runs unit + integration (excludes smoke)
npm run test:unit     # ✅ Runs only unit tests
npm run test:integration  # ✅ Runs only integration tests
npm run test:e2e      # ✅ Runs E2E tests (excludes smoke)
npm run test:smoke    # ✅ Runs ONLY smoke tests
```

This separation ensures:
- Fast feedback during development (unit/integration tests)
- Smoke tests run only when explicitly requested
- CI/CD can optionally include smoke tests

## Test Suite Breakdown

### Test 1: Python Proxy Health Check
**Duration**: ~45ms
**Purpose**: Verify Python proxy service is running and healthy
**What it tests**: HTTP health endpoint, service availability

### Test 2: Claude CLI Authentication
**Duration**: ~52ms
**Purpose**: Verify Claude CLI is authenticated
**What it tests**: Authentication status via proxy

### Test 3: Launch Real Claude Agent ⭐ CRITICAL
**Duration**: ~18 seconds
**Purpose**: Full end-to-end smoke test with real Claude CLI
**What it tests**:
- Agent launches via API
- Python proxy spawns real Claude CLI
- Agent completes successfully
- Status endpoint works correctly

### Test 4: Terminate Running Agent
**Duration**: ~5 seconds
**Purpose**: Verify agent termination works with real processes
**What it tests**:
- Termination signal sent to Python proxy
- Claude CLI process is killed
- Resources are cleaned up properly

### Test 5: Agent Processing Time
**Duration**: ~17 seconds
**Purpose**: Verify agent processes within reasonable time
**What it tests**:
- Agent responds to simple prompts quickly
- Processing time is acceptable
- No hanging or timeout issues

### Test 6: Error Handling
**Duration**: ~6 seconds
**Purpose**: Verify graceful error handling
**What it tests**:
- Invalid prompts are handled
- Errors don't crash the system
- Proper error responses returned

### Test 7: Real-Time Message Streaming ⭐ NEW
**Duration**: ~21 seconds
**Purpose**: Verify messages stream in real-time from Claude CLI
**What it tests**:
- Messages arrive via streaming
- API endpoint returns messages
- Assistant messages are present
- Real-time delivery works

### Test 8: Message Persistence ⭐ NEW CRITICAL
**Duration**: ~22 seconds
**Purpose**: Verify messages persist to database after completion
**What it tests**:
- Messages saved to database
- Database is single source of truth
- API and database match
- Message structure correct
- Messages survive agent completion

### Test 9: Token Streaming ⭐ NEW
**Duration**: ~17 seconds
**Purpose**: Verify individual token streaming (not just complete messages)
**What it tests**:
- Token-level streaming works
- Multiple messages received incrementally
- Sequence numbers are sequential
- No gaps or duplicates

## Cost Considerations

**Cost per smoke test run**: $0

Smoke tests use the **Python proxy adapter** which utilizes your Claude Max subscription quota:
- No per-token API costs
- Uses Claude Max 20x quota (200-800 prompts per 5 hours)
- Simple prompts consume minimal quota
- 9 tests = minimal quota usage

If you switch to the SDK adapter for smoke tests:
- Cost: ~$0.12 per test run (9 tests × ~$0.013 avg)
- Uses Anthropic API key instead of Max subscription

## Troubleshooting

### "Python proxy not running" Warning

**Symptom**: Tests are skipped with warning
```
⚠️  Python proxy not running. Skipping smoke tests.
```

**Solution**: Start the Python proxy service:
```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

### "Claude CLI not authenticated" Error

**Symptom**: Tests fail with authentication error

**Solution**: Login to Claude CLI:
```bash
claude auth login
```

### Timeout Errors

**Symptom**: Tests timeout waiting for Claude response

**Possible causes**:
1. Python proxy service not running
2. Claude CLI rate limited (Max quota exhausted)
3. Network issues
4. Claude service outage

**Solution**: Check proxy logs for detailed errors:
```bash
# In claude-proxy-service directory
tail -f logs/app.log
```

### Port Already in Use

**Symptom**: Python proxy fails to start on port 8000

**Solution**: Kill existing process or use different port:
```bash
# Kill existing process
lsof -ti:8000 | xargs kill -9

# Or change port in .env
CLAUDE_PROXY_URL=http://localhost:8001
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Smoke Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd backend
          npm ci
          cd ../claude-proxy-service
          pip install -r requirements.txt

      - name: Authenticate Claude CLI
        run: |
          # Use stored credentials from secrets
          echo "${{ secrets.CLAUDE_AUTH_TOKEN }}" | claude auth login --token-stdin

      - name: Start Python proxy
        run: |
          cd claude-proxy-service
          uvicorn app.main:app &
          sleep 5

      - name: Run smoke tests
        run: |
          cd backend
          npm run test:smoke
        timeout-minutes: 10

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: smoke-test-results
          path: backend/test-results/
```

### Running Smoke Tests Locally Before Releases

```bash
# Complete pre-release check
cd backend

# 1. Start Python proxy
cd ../claude-proxy-service && uvicorn app.main:app &
PROXY_PID=$!

# 2. Wait for proxy to start
sleep 3

# 3. Run all tests
cd ../backend
npm test                 # Unit + integration
npm run test:e2e        # E2E tests
npm run test:smoke      # Smoke tests with real CLI

# 4. Cleanup
kill $PROXY_PID
```

## Test Maintenance

### When to Update Smoke Tests

1. **Claude CLI Output Format Changes**: Update message assertions
2. **New Adapter Added**: Add smoke tests for new adapter
3. **API Changes**: Update request/response expectations
4. **New Features**: Add smoke tests for critical paths

### Updating Expected Output

If Claude CLI output format changes:

1. Run smoke test and examine failure
2. Verify new format is correct (not a bug)
3. Update assertions in test file
4. Document changes in commit message

### Recording Real Output for Fixtures

Capture real Claude CLI output for integration test fixtures:

```bash
# Record real output
npm run test:smoke -- --verbose > smoke-test-output.log

# Extract JSONL messages from logs
# Use these as fixtures for integration tests
```

## Best Practices

### ✅ DO

- Run smoke tests before releases
- Run smoke tests when changing adapters
- Run smoke tests weekly (scheduled CI/CD)
- Keep prompts simple and fast
- Document breaking changes in smoke tests
- Use smoke tests to validate bug fixes

### ❌ DON'T

- Run smoke tests on every commit (too slow)
- Use complex prompts (increases duration/cost)
- Run smoke tests in parallel (resource conflicts)
- Skip smoke tests before major releases
- Ignore smoke test failures (they catch real issues)

## Further Reading

- **Test Infrastructure Audit**: `/TEST_INFRASTRUCTURE_AUDIT.md`
- **Python Proxy Documentation**: `/PYTHON_PROXY_SOLUTION.md`
- **Testing Guide**: `/docs/testing-guide.md` (if exists)
- **E2E Testing Guide**: `/E2E_TESTING_GUIDE.md`

## New Tests (November 2025)

Three new tests added to validate message streaming and persistence:

**Why These Tests Are Critical**:
- Validate database is single source of truth
- Confirm messages persist after agent completion
- Verify token-level streaming works correctly
- Test sequence number integrity
- Ensure no message loss or duplication

**Additional Documentation**:
- `/backend/SMOKE_TEST_REPORT.md` - Detailed implementation report
- `/backend/SMOKE_TEST_MESSAGE_PERSISTENCE_UPDATE.md` - Implementation guide

---

**Last Updated**: 2025-11-28
**Test Suite Version**: 2.0.0 (9 tests)
**Status**: Production Ready
