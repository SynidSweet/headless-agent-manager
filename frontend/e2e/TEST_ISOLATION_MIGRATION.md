# Test Isolation Migration Guide

## Why Test Isolation Is Critical

### The Problem

Without proper isolation, E2E tests suffer from:

1. **Cross-Test Event Contamination** - Tests receive WebSocket events from other tests' agents
2. **State Leakage** - Redux state and database state pollute between tests
3. **Race Conditions** - Overlapping test execution causes unpredictable behavior
4. **Flaky Tests** - Tests pass/fail randomly based on execution order
5. **Silent Failures** - Tests pass but leave dirty state for next test

### The Solution

Comprehensive test isolation ensures:

- ✅ **Pre-Test Verification** - Fail-fast if dirty state detected
- ✅ **Test Context Tracking** - Each test knows which agents it owns
- ✅ **Event Filtering** - Only receive events from current test's agents
- ✅ **Post-Test Cleanup** - Verify cleanup completed successfully
- ✅ **Fail-Fast Detection** - Immediately fail if isolation violated

## Migration Checklist

### Step 1: Update Imports

**Before:**
```typescript
import { test, expect } from '@playwright/test';
import { waitForWebSocketEvent } from '../helpers/waitForWebSocketEvent';
import { launchSyntheticAgent } from '../helpers/syntheticAgent';
```

**After:**
```typescript
import { test, expect } from '@playwright/test';
import {
  waitForWebSocketEvent,
  getWebSocketStatus,
} from '../helpers/waitForWebSocketEvent';
import {
  launchSyntheticAgent,
  createMessageSchedule,
} from '../helpers/syntheticAgent';
import { selectAgentAndSubscribe } from '../helpers/subscriptionHelpers';
import { cleanupAllAgents } from '../helpers/cleanup';
import {
  TestContext,
  verifyTestIsolation,
  IsolationViolationError,  // Optional: for explicit error handling
} from '../helpers/testIsolation';
```

### Step 2: Update beforeEach Hook

**Before:**
```typescript
test.beforeEach(async ({ page, request }) => {
  await request.post(`${BACKEND_URL}/api/test/reset-database`);
  await page.goto(FRONTEND_URL);
  await expect(page.locator('h1')).toContainText('CodeStream');

  const wsStatus = await getWebSocketStatus(page);
  expect(wsStatus.connected).toBe(true);
});
```

**After:**
```typescript
test.beforeEach(async ({ page, request }) => {
  // Step 1: Reset database
  await request.post(`${BACKEND_URL}/api/test/reset-database`);

  // Step 2: Navigate to app
  await page.goto(FRONTEND_URL);

  // Step 3: Wait for app to load
  await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

  // Step 4: CRITICAL - Verify isolation before test starts
  await verifyTestIsolation(request, page);

  // Step 5: Verify WebSocket connected
  const wsStatus = await getWebSocketStatus(page);
  expect(wsStatus.connected).toBe(true);
  console.log('✅ WebSocket connected:', wsStatus.id);
});
```

### Step 3: Update afterEach Hook

**Before:**
```typescript
// No afterEach hook (or simple cleanup without verification)
```

**After:**
```typescript
test.afterEach(async ({ request }) => {
  // CRITICAL: Verify cleanup completed successfully
  try {
    await cleanupAllAgents(request, {
      maxRetries: 3,
      retryDelay: 1000,
      throwOnFailure: true, // Fail test if cleanup fails
    });
  } catch (error) {
    console.error('❌ Cleanup failed - test may have left dirty state');
    throw error;
  }
});
```

### Step 4: Update Test Body

**Before:**
```typescript
test('my test', async ({ page }) => {
  const agentId = await launchSyntheticAgent(...);

  const event = await waitForWebSocketEvent(page, 'agent:created');

  // ... test assertions ...
});
```

**After:**
```typescript
test('my test', async ({ page }) => {
  // Create test context for tracking
  const context = new TestContext('my test');

  console.log('\n🧪 Starting test...');

  // Set up listener BEFORE launching agent
  const eventPromise = waitForWebSocketEvent(page, 'agent:created');

  const agentId = await launchSyntheticAgent(...);

  // Register agent with context
  context.registerAgent(agentId);

  console.log('🚀 Agent launched:', agentId);

  // Wait for event
  const event = await eventPromise;

  // Verify event is from OUR agent
  expect(event.agent.id).toBe(agentId);

  // ... test assertions ...

  console.log('✅ Test PASSED');

  // Mark test complete
  context.complete();
});
```

### Step 5: Add Agent ID Filtering to Event Listeners

**CRITICAL:** This prevents receiving events from other tests' agents.

**Before:**
```typescript
const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
  timeout: 3000,
});
```

**After:**
```typescript
const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
  agentId: agentId,  // CRITICAL: Only receive from our agent
  timeout: 3000,
});
```

### Step 6: Verify Event Agent IDs

**Add explicit verification that events are from the correct agent:**

```typescript
const messageEvent = await messagePromise;

// CRITICAL: Verify message is from OUR agent
expect(messageEvent.agentId).toBe(agentId);
```

## Before/After Examples

### Example 1: Simple Agent Launch Test

**Before (No Isolation):**
```typescript
test('agent launches', async ({ page, request }) => {
  await page.goto('http://localhost:5173');

  const agentId = await launchSyntheticAgent(BACKEND_URL, schedule);

  const event = await waitForWebSocketEvent(page, 'agent:created');

  expect(event.agent.id).toBe(agentId);
});
```

**After (With Isolation):**
```typescript
test('agent launches', async ({ page, request }) => {
  const context = new TestContext('agent launches');

  await page.goto('http://localhost:5173');
  await verifyTestIsolation(request, page);

  const eventPromise = waitForWebSocketEvent(page, 'agent:created');

  const agentId = await launchSyntheticAgent(BACKEND_URL, schedule);
  context.registerAgent(agentId);

  const event = await eventPromise;
  expect(event.agent.id).toBe(agentId);

  context.complete();
});
```

### Example 2: Multi-Event Test

**Before (No Isolation):**
```typescript
test('agent sends messages', async ({ page }) => {
  const agentId = await launchSyntheticAgent(BACKEND_URL, schedule);

  await selectAgentAndSubscribe(page, agentId);

  const msg1 = await waitForWebSocketEvent(page, 'agent:message');
  const msg2 = await waitForWebSocketEvent(page, 'agent:message');

  expect(msg1.message.content).toBeDefined();
  expect(msg2.message.content).toBeDefined();
});
```

**After (With Isolation):**
```typescript
test('agent sends messages', async ({ page }) => {
  const context = new TestContext('agent sends messages');

  const createdPromise = waitForWebSocketEvent(page, 'agent:created');

  const agentId = await launchSyntheticAgent(BACKEND_URL, schedule);
  context.registerAgent(agentId);

  await createdPromise;

  // Set up listeners with agent ID filter BEFORE subscribing
  const msg1Promise = waitForWebSocketEvent(page, 'agent:message', {
    agentId: agentId,  // Filter by agent ID
  });
  const msg2Promise = waitForWebSocketEvent(page, 'agent:message', {
    agentId: agentId,  // Filter by agent ID
  });

  await selectAgentAndSubscribe(page, agentId);

  const msg1 = await msg1Promise;
  const msg2 = await msg2Promise;

  expect(msg1.agentId).toBe(agentId);
  expect(msg2.agentId).toBe(agentId);
  expect(msg1.message.content).toBeDefined();
  expect(msg2.message.content).toBeDefined();

  context.complete();
});
```

## Troubleshooting

### Problem: Test fails with IsolationViolationError

**Error:**
```
IsolationViolationError: Test isolation violated: X agents exist from previous test
```

**Solution:**
1. Check that previous test's afterEach cleanup completed
2. Check that previous test didn't throw before cleanup
3. Manually reset database: `curl -X POST http://localhost:3001/api/test/reset-database`
4. Restart backend and run test again

### Problem: Test receives events from wrong agent

**Symptoms:**
```
Expected agent ID: abc-123
Received agent ID: def-456
```

**Solution:**
1. Add agent ID filter to ALL event listeners:
   ```typescript
   waitForWebSocketEvent(page, 'agent:message', {
     agentId: yourAgentId,  // Add this!
   })
   ```

2. Verify you're registering agent with context:
   ```typescript
   context.registerAgent(agentId);
   ```

3. Check console for "Filtered out event" messages - confirms filtering working

### Problem: Cleanup fails after test

**Error:**
```
Cleanup failed: 2 agent(s) remain after 3 attempts
```

**Solution:**
1. Increase retry delay: `{ retryDelay: 2000 }`
2. Check if agents are stuck in "running" state
3. Force delete stuck agents: `DELETE /api/agents/:id?force=true`
4. Check backend logs for errors during agent termination

### Problem: Tests pass individually but fail when run together

**Symptoms:**
- ✅ `npm run test:e2e -- test-a.spec.ts` passes
- ✅ `npm run test:e2e -- test-b.spec.ts` passes
- ❌ `npm run test:e2e` (both together) fails

**Solution:**
This is EXACTLY the problem isolation fixes! Apply migration steps above.

## Testing Your Migration

### Step 1: Test Single File
```bash
cd frontend
npm run test:e2e -- fullstack/your-migrated-test.spec.ts
```

Expected output:
- ✅ "Verifying test isolation" before each test
- ✅ "Cleanup verified" after each test
- ✅ No "Filtered out" messages (means no cross-contamination)
- ✅ 100% pass rate

### Step 2: Test Multiple Runs
```bash
# Run same test 5 times in a row
for i in {1..5}; do
  echo "Run $i/5"
  npm run test:e2e -- fullstack/your-migrated-test.spec.ts
done
```

Expected: All 5 runs pass with no flakes

### Step 3: Test with Other Files
```bash
# Run your migrated test alongside existing tests
npm run test:e2e -- fullstack/
```

Expected: All tests pass, isolation prevents cross-contamination

## Reference Implementation

See `/frontend/e2e/fullstack/event-driven-core-isolated.spec.ts` for a complete reference implementation showing all patterns:

- ✅ Pre-test verification with `verifyTestIsolation()`
- ✅ Test context tracking with `TestContext`
- ✅ Event filtering with `agentId` parameter
- ✅ Post-test cleanup verification
- ✅ Comprehensive logging for debugging

## Common Mistakes to Avoid

### ❌ Mistake 1: Not registering agent with context
```typescript
// BAD
const agentId = await launchSyntheticAgent(...);
// Forgot to call: context.registerAgent(agentId);
```

### ❌ Mistake 2: Not filtering events by agent ID
```typescript
// BAD
const msg = await waitForWebSocketEvent(page, 'agent:message');
// Should be: { agentId: yourAgentId }
```

### ❌ Mistake 3: Not calling context.complete()
```typescript
// BAD
test('my test', async () => {
  const context = new TestContext('my test');
  // ... test logic ...
  // Forgot to call: context.complete();
});
```

### ❌ Mistake 4: Not verifying event agent IDs
```typescript
// BAD
const event = await waitForWebSocketEvent(page, 'agent:message', {
  agentId: agentId,
});
// Should verify: expect(event.agentId).toBe(agentId);
```

### ❌ Mistake 5: Setting up listener AFTER launching agent
```typescript
// BAD (race condition)
const agentId = await launchSyntheticAgent(...);
const event = await waitForWebSocketEvent(page, 'agent:created');

// GOOD (listener ready before launch)
const eventPromise = waitForWebSocketEvent(page, 'agent:created');
const agentId = await launchSyntheticAgent(...);
const event = await eventPromise;
```

## Performance Impact

Isolation adds minimal overhead:

- Pre-test verification: ~100ms (2 API calls + Redux check)
- Post-test cleanup: ~1-3 seconds (with retries)
- Total overhead: ~1-3 seconds per test

**This is acceptable because it eliminates flaky tests** which cost much more time debugging!

## Success Criteria

After migration, you should see:

✅ **100% pass rate** on first run (no flakes)
✅ **100% pass rate** on consecutive runs (no state leakage)
✅ **No "Filtered out" messages** (means no cross-contamination)
✅ **Cleanup verified** after every test
✅ **Tests fail fast** if isolation violated

## Questions?

- See reference implementation: `/frontend/e2e/fullstack/event-driven-core-isolated.spec.ts`
- Check isolation helpers: `/frontend/e2e/helpers/testIsolation.ts`
- Review test output logs for diagnostic information
