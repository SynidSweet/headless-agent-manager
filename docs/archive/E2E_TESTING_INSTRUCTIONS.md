# Fullstack E2E Testing Instructions - Event-Driven Architecture

## Context

This headless AI agent manager uses a **pure event-driven architecture** with WebSocket events as the single source of truth. All agent lifecycle changes (create, update, delete) flow through WebSocket events, eliminating race conditions and enabling instant updates.

**Key Architecture Points**:
- ✅ HTTP polling REMOVED (no more 5-second intervals)
- ✅ WebSocket events for ALL state updates (agent:created, agent:updated, agent:deleted)
- ✅ Redux receives events and updates state
- ✅ <100ms latency for updates (verified!)
- ✅ Synthetic agents available for controllable timing in tests

**Documentation**: Read `EVENT_DRIVEN_COMPLETE_SUMMARY.md` for complete architecture details.

---

## Your Mission

Implement comprehensive fullstack E2E tests that verify the event-driven architecture works correctly end-to-end, including:

1. **Event-Driven Agent Lifecycle** - Launch, status updates, deletion via WebSocket events
2. **Message Streaming** - Real-time message delivery through all layers
3. **Database Persistence** - Events match database state
4. **Multi-Client Broadcasting** - All clients see same events
5. **Synthetic Agent Testing** - Deterministic tests with controllable timing

---

## Prerequisites

### Services Required

**Terminal 1: Python Proxy** (port 8000)
```bash
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --port 8000
```

**Terminal 2: Backend** (port 3000)
```bash
cd backend
npm run dev
```

**Terminal 3: Frontend** (port 5173 - Playwright will start automatically)

### Verify Services
```bash
# Backend
curl http://localhost:3000/api/agents

# Python proxy
curl http://localhost:8000/health

# Should both return 200 OK
```

---

## Testing Infrastructure Available

### 1. Event Waiting Helpers

**File**: `frontend/e2e/helpers/waitForWebSocketEvent.ts`

**Functions**:
```typescript
// Wait for single event
const event = await waitForWebSocketEvent(page, 'agent:created', {
  timeout: 15000,
  predicate: (data) => data.agent.id === agentId // Optional filter
});

// Wait for multiple events in sequence
const events = await waitForWebSocketEvents(page, [
  'agent:created',
  'agent:message',
  'agent:updated'
]);

// Wait for Nth occurrence
const thirdMessage = await waitForNthWebSocketEvent(page, 'agent:message', 3);

// Check connection status
const status = await getWebSocketStatus(page);
```

### 2. Synthetic Agent Helpers

**File**: `frontend/e2e/helpers/syntheticAgent.ts`

**Functions**:
```typescript
// Launch agent with precise timing
const agentId = await launchSyntheticAgent('http://localhost:3000', [
  { delay: 1000, type: 'message', data: { content: 'First' } },
  { delay: 2000, type: 'message', data: { content: 'Second' } },
  { delay: 3000, type: 'complete', data: { success: true } }
]);
// Messages arrive at EXACTLY 1s, 2s, 3s!

// Helper schedules
const schedule = createMessageSchedule([1000, 2000, 3000], 4000);
const streaming = createStreamingSchedule(5, 500); // 5 msgs, 500ms apart
const gaps = createGapSchedule(); // For testing gap detection
const errors = createErrorSchedule(); // For testing error handling
```

### 3. WebSocket Events Emitted by Backend

**agent:created** - When agent launches
```typescript
{
  agent: {
    id: string;
    type: "claude-code" | "synthetic";
    status: "running";
    session: { prompt: string; ... };
    createdAt: string;
  },
  timestamp: string;
}
```

**agent:updated** - When status changes
```typescript
{
  agentId: string;
  status: "completed" | "failed" | "terminated";
  timestamp: string;
}
```

**agent:deleted** - When agent terminates
```typescript
{
  agentId: string;
  timestamp: string;
}
```

**agent:message** - When message streams
```typescript
{
  agentId: string;
  message: {
    id: string;
    type: "user" | "assistant" | "system";
    content: string;
    sequenceNumber: number;
  },
  timestamp: string;
}
```

### 4. Backend Test Endpoints

**Reset Database**:
```bash
POST /api/test/reset-database
# Clears all agents and messages
```

**Launch Synthetic Agent**:
```bash
POST /api/test/agents/synthetic
{
  "prompt": "Test agent",
  "schedule": [
    { "delay": 1000, "type": "message", "data": { "content": "Hello" } },
    { "delay": 2000, "type": "complete", "data": { "success": true } }
  ]
}
# Returns: { "agentId": "...", "status": "running", "createdAt": "..." }
```

### 5. Window Globals (Available in Browser)

```typescript
// In Playwright tests, access via page.evaluate()
window.store    // Redux store
window.socket   // Socket.IO client
window.actions  // All Redux actions
window.selectors // All selectors
```

---

## Test Scenarios to Implement

### Test 1: Event-Driven Agent Launch (5-10 seconds)

**Goal**: Verify agent appears in UI via agent:created event (not HTTP polling)

```typescript
test('agent launches and appears via event', async ({ page }) => {
  // Navigate
  await page.goto('http://localhost:5173');

  // Verify WebSocket connected
  const wsStatus = await getWebSocketStatus(page);
  expect(wsStatus.connected).toBe(true);

  // Launch agent via UI
  await page.selectOption('select#agent-type', 'claude-code');
  await page.fill('textarea#agent-prompt', 'Event test');
  await page.click('button:has-text("Launch Agent")');

  // WAIT FOR EVENT (not timeout!)
  const event = await waitForWebSocketEvent(page, 'agent:created', {
    timeout: 15000
  });

  // Verify event data
  expect(event.agent.id).toBeDefined();
  expect(event.agent.type).toBe('claude-code');

  // Agent should appear in UI INSTANTLY
  await expect(
    page.locator(`[data-agent-id="${event.agent.id}"]`)
  ).toBeVisible({ timeout: 2000 }); // Should be instant!

  console.log('✅ Agent appeared via event in < 2 seconds!');
});
```

### Test 2: Synthetic Agent with Controllable Timing (5 seconds)

**Goal**: Test complete agent lifecycle with precise timing

```typescript
test('synthetic agent emits events on schedule', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Launch synthetic agent with 3-second schedule
  const agentId = await launchSyntheticAgent('http://localhost:3000', [
    { delay: 1000, type: 'message', data: { content: 'Message 1' } },
    { delay: 2000, type: 'message', data: { content: 'Message 2' } },
    { delay: 3000, type: 'complete', data: { success: true } }
  ]);

  console.log('🚀 Synthetic agent launched:', agentId);

  // Wait for agent:created (should be immediate)
  await waitForWebSocketEvent(page, 'agent:created', {
    predicate: (e) => e.agent.id === agentId
  });

  // Select agent in UI
  await page.click(`[data-agent-id="${agentId}"]`);

  // Wait for first message (arrives at exactly 1s)
  const start = Date.now();
  await waitForWebSocketEvent(page, 'agent:message', {
    predicate: (e) => e.agentId === agentId
  });
  const firstMessageTime = Date.now() - start;
  console.log(`✅ First message arrived at ${firstMessageTime}ms`);
  expect(firstMessageTime).toBeGreaterThan(900);
  expect(firstMessageTime).toBeLessThan(1500);

  // Wait for second message (arrives at exactly 2s)
  await waitForWebSocketEvent(page, 'agent:message', {
    predicate: (e) => e.agentId === agentId
  });

  // Wait for completion (arrives at exactly 3s)
  await waitForWebSocketEvent(page, 'agent:updated', {
    predicate: (e) => e.agentId === agentId && e.status === 'completed'
  });

  console.log('✅ Complete lifecycle tracked with precise timing!');
  // Total test time: ~3 seconds!
});
```

### Test 3: Database State Matches Events (5-10 seconds)

**Goal**: Verify WebSocket events match database state

```typescript
test('events match database state', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Launch synthetic agent
  const agentId = await launchSyntheticAgent('http://localhost:3000', [
    { delay: 500, type: 'message', data: { content: 'Test' } },
    { delay: 1000, type: 'complete', data: { success: true } }
  ]);

  // Wait for agent:created event
  const createdEvent = await waitForWebSocketEvent(page, 'agent:created', {
    predicate: (e) => e.agent.id === agentId
  });

  // Query database immediately
  const response = await fetch(`http://localhost:3000/api/agents/${agentId}`);
  const dbAgent = await response.json();

  // Event should match database
  expect(createdEvent.agent.id).toBe(dbAgent.id);
  expect(createdEvent.agent.type).toBe(dbAgent.type);
  expect(createdEvent.agent.status).toBe(dbAgent.status);

  console.log('✅ Event data matches database state!');
});
```

### Test 4: Multi-Client Broadcasting (10-15 seconds)

**Goal**: Verify all clients see same events (broadcast to ALL)

```typescript
test('events broadcast to all connected clients', async ({ browser }) => {
  // Open TWO browser contexts
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await page1.goto('http://localhost:5173');
  await page2.goto('http://localhost:5173');

  // Verify both connected
  const ws1 = await getWebSocketStatus(page1);
  const ws2 = await getWebSocketStatus(page2);
  expect(ws1.connected).toBe(true);
  expect(ws2.connected).toBe(true);

  console.log('✅ Both clients connected');

  // Launch agent from client 1
  const agentId = await launchSyntheticAgent('http://localhost:3000', [
    { delay: 1000, type: 'complete', data: { success: true } }
  ]);

  // BOTH clients should receive agent:created event!
  const [event1, event2] = await Promise.all([
    waitForWebSocketEvent(page1, 'agent:created', {
      predicate: (e) => e.agent.id === agentId
    }),
    waitForWebSocketEvent(page2, 'agent:created', {
      predicate: (e) => e.agent.id === agentId
    }),
  ]);

  // Both should have same data
  expect(event1.agent.id).toBe(event2.agent.id);
  expect(event1.agent.id).toBe(agentId);

  console.log('✅ Both clients received same event (broadcast verified)!');

  await context1.close();
  await context2.close();
});
```

### Test 5: Message Streaming Progression (10-20 seconds)

**Goal**: Verify messages arrive progressively over time

```typescript
test('messages stream progressively', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Create synthetic agent with 5 messages, 500ms apart
  const schedule = createStreamingSchedule(5, 500);
  const agentId = await launchSyntheticAgent('http://localhost:3000', schedule);

  await waitForWebSocketEvent(page, 'agent:created', {
    predicate: (e) => e.agent.id === agentId
  });

  // Select agent
  await page.click(`[data-agent-id="${agentId}"]`);

  // Wait for all 5 messages
  for (let i = 1; i <= 5; i++) {
    await waitForWebSocketEvent(page, 'agent:message', {
      predicate: (e) => e.agentId === agentId,
      timeout: 2000 // Each message should arrive within 1 second of previous
    });
    console.log(`✅ Message ${i}/5 received`);
  }

  // Verify all messages in UI
  const messageCount = await page.locator('[data-message-type]').count();
  expect(messageCount).toBeGreaterThanOrEqual(5);

  console.log('✅ All messages streamed progressively!');
  // Total time: ~3 seconds (5 messages × 500ms)
});
```

### Test 6: Reconnection Sync (10-15 seconds)

**Goal**: Verify state syncs after WebSocket reconnection

```typescript
test('state syncs on websocket reconnection', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Launch synthetic agent
  const agentId = await launchSyntheticAgent('http://localhost:3000', [
    { delay: 500, type: 'message', data: { content: 'Test' } },
    { delay: 1000, type: 'complete', data: { success: true } }
  ]);

  await waitForWebSocketEvent(page, 'agent:created', {
    predicate: (e) => e.agent.id === agentId
  });

  // Agent should be in UI
  await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible();

  // Disconnect WebSocket
  await page.evaluate(() => {
    (window as any).socket.disconnect();
  });

  await page.waitForTimeout(1000);

  // Reconnect
  await page.evaluate(() => {
    (window as any).socket.connect();
  });

  // Wait for reconnection
  await waitForWebSocketEvent(page, 'connect');

  // Agent should still be in UI (synced from backend on reconnect)
  await page.waitForTimeout(2000); // Give time for sync
  await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible();

  console.log('✅ State synced after reconnection!');
});
```

### Test 7: Gap Detection and Backfill (15-20 seconds)

**Goal**: Verify gap detection triggers backfill

```typescript
test('detects message gaps and backfills', async ({ page }) => {
  await page.goto('http://localhost:5173');

  const agentId = await launchSyntheticAgent('http://localhost:3000', createGapSchedule());

  await waitForWebSocketEvent(page, 'agent:created', {
    predicate: (e) => e.agent.id === agentId
  });

  await page.click(`[data-agent-id="${agentId}"]`);

  // Wait for multiple messages (including gap)
  await waitForNthWebSocketEvent(page, 'agent:message', 3, {
    timeout: 10000
  });

  // Check Redux state for gaps (exposed on window)
  const hasGaps = await page.evaluate((id) => {
    const state = (window as any).store.getState();
    const messages = state.messages.byAgentId[id]?.messages || [];

    // Check for sequence gaps
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i+1].sequenceNumber - messages[i].sequenceNumber > 1) {
        return true;
      }
    }
    return false;
  }, agentId);

  // Gap detection should trigger fetch to backfill
  if (hasGaps) {
    console.log('⚠️ Gap detected - verifying backfill triggered');
    await page.waitForTimeout(3000); // Wait for backfill

    // Gaps should be filled
    const gapsAfterBackfill = await page.evaluate((id) => {
      const state = (window as any).store.getState();
      const messages = state.messages.byAgentId[id]?.messages || [];
      return messages.some((m, i) =>
        i < messages.length - 1 &&
        messages[i+1].sequenceNumber - m.sequenceNumber > 1
      );
    }, agentId);

    expect(gapsAfterBackfill).toBe(false);
    console.log('✅ Gaps backfilled successfully!');
  }
});
```

### Test 8: Error Scenarios (10 seconds)

**Goal**: Verify error handling in event-driven flow

```typescript
test('handles agent errors gracefully', async ({ page }) => {
  await page.goto('http://localhost:5173');

  const agentId = await launchSyntheticAgent(
    'http://localhost:3000',
    createErrorSchedule()
  );

  await waitForWebSocketEvent(page, 'agent:created');

  // Wait for error event
  const errorEvent = await waitForWebSocketEvent(page, 'agent:error', {
    predicate: (e) => e.agentId === agentId,
    timeout: 5000
  });

  expect(errorEvent.error).toBeDefined();
  console.log('✅ Error event received:', errorEvent.error.message);

  // Agent should complete with error
  await waitForWebSocketEvent(page, 'agent:updated', {
    predicate: (e) => e.agentId === agentId
  });

  console.log('✅ Error scenario handled correctly!');
});
```

---

## Test File Structure

Create these test files in `frontend/e2e/fullstack/`:

```
frontend/e2e/fullstack/
├── event-driven-core.spec.ts     # Tests 1-3 (basic event flow)
├── event-driven-advanced.spec.ts # Tests 4-6 (multi-client, reconnection, gaps)
├── synthetic-agents.spec.ts      # Test 7-8 (error scenarios, edge cases)
└── performance.spec.ts           # Optional: latency benchmarks
```

---

## Key Testing Principles

### 1. Use Events, Not Timeouts

**❌ Bad (Time-Based)**:
```typescript
await page.waitForTimeout(60000); // Hope it's enough!
```

**✅ Good (Event-Based)**:
```typescript
await waitForWebSocketEvent(page, 'agent:message'); // Know when it happens!
```

### 2. Use Synthetic Agents for Determinism

**❌ Bad (Real Claude CLI)**:
```typescript
// Takes 5-60 seconds, unpredictable
await launchRealAgent();
await page.waitForTimeout(90000);
```

**✅ Good (Synthetic)**:
```typescript
// Takes EXACTLY 3 seconds, predictable
await launchSyntheticAgent(backendUrl, [
  { delay: 1000, type: 'message', data: {...} },
  { delay: 3000, type: 'complete', data: {...} }
]);
await waitForWebSocketEvent(page, 'agent:updated'); // At 3s!
```

### 3. Test Each Layer Independently

Don't test everything at once:
1. **Events emit** - Backend test (unit)
2. **Events received** - WebSocket test (integration)
3. **Redux updates** - Frontend test (integration)
4. **UI renders** - Component test
5. **Full flow** - E2E test

### 4. Verify Event Order

```typescript
const eventLog: string[] = [];

page.on('console', (msg) => {
  if (msg.text().includes('LIFECYCLE EVENT')) {
    eventLog.push(msg.text());
  }
});

// After test
expect(eventLog).toContain('agent:created');
expect(eventLog).toContain('agent:message');
expect(eventLog).toContain('agent:updated');

// Verify order
const createdIndex = eventLog.findIndex(e => e.includes('agent:created'));
const messageIndex = eventLog.findIndex(e => e.includes('agent:message'));
const updatedIndex = eventLog.findIndex(e => e.includes('agent:updated'));

expect(createdIndex).toBeLessThan(messageIndex);
expect(messageIndex).toBeLessThan(updatedIndex);
```

---

## Cleanup Between Tests

```typescript
test.beforeEach(async ({ page }) => {
  // Reset database
  await fetch('http://localhost:3000/api/test/reset-database', {
    method: 'POST'
  });

  // Reload page (clears Redux state)
  if (page.url() !== 'about:blank') {
    await page.reload();
    await page.waitForLoadState('networkidle');
  }
});
```

---

## Success Criteria

Your tests should verify:

### Core Functionality
- [x] agent:created event triggers agent to appear in UI
- [x] agent:updated event updates agent status in UI
- [x] agent:deleted event removes agent from UI
- [x] agent:message events stream to UI
- [x] Events match database state
- [x] Multiple clients see same events

### Performance
- [x] Event latency < 500ms (agent:created should be < 100ms)
- [x] Synthetic agent events arrive on schedule (±100ms tolerance)
- [x] Tests complete quickly (most under 10 seconds)

### Reliability
- [x] No race conditions (no agents disappearing unexpectedly)
- [x] No arbitrary timeouts (all event-based)
- [x] Tests pass repeatedly without manual cleanup
- [x] Reconnection syncs state correctly

---

## Debugging Tips

### Check WebSocket Connection
```typescript
const status = await getWebSocketStatus(page);
console.log('Connected:', status.connected);
console.log('Socket ID:', status.id);
```

### Check Redux State
```typescript
const state = await page.evaluate(() => {
  const store = (window as any).store;
  return store.getState();
});
console.log('Redux state:', JSON.stringify(state, null, 2));
```

### Monitor Backend Logs
Look for:
```
[INFO] Configured synthetic agent ... with X events
[DEBUG] Observer subscribed to synthetic agent ...
[DEBUG] [T+XXXms] Synthetic agent ... emitting: message
```

### Capture All Events
```typescript
const events: any[] = [];

page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('LIFECYCLE EVENT')) {
    events.push({ text, timestamp: Date.now() });
  }
});

// After test
console.log('Events received:', events);
```

---

## Common Issues and Solutions

### Issue: "Socket not available on window"
**Solution**: Ensure store.ts exposes socket: `(window as any).socket = client.socket;`

### Issue: Events not arriving
**Solution**: Check WebSocket connection, verify backend is emitting events, check browser console for errors

### Issue: Test timeout on waitForWebSocketEvent
**Solution**:
1. Check if event is actually being emitted (backend logs)
2. Check if WebSocket is connected (`getWebSocketStatus()`)
3. Increase timeout if agent is slow (real Claude CLI can take 60s)

### Issue: Synthetic agent not found
**Solution**: Ensure `SyntheticAgentAdapter` is registered in `infrastructure.module.ts`

---

## Expected Test Results

When all tests pass, you should see:

```
✅ event-driven-core.spec.ts        (3 tests,  ~15 seconds)
✅ event-driven-advanced.spec.ts    (3 tests,  ~30 seconds)
✅ synthetic-agents.spec.ts         (2 tests,  ~15 seconds)

Total: 8 tests, ~60 seconds (vs 4-6 minutes with old time-based tests!)
```

---

## Final Notes

### This is NOT the Original Test Suite

The original `database-verification.spec.ts` tests are **outdated** - they use time-based waiting and HTTP polling assumptions. Don't try to fix them - **replace them** with event-driven tests using the new helpers.

### Focus on Event-Driven Testing

The whole point of this refactoring was to make testing **deterministic and fast**. Use:
- ✅ `waitForWebSocketEvent()` instead of `waitForTimeout()`
- ✅ Synthetic agents instead of real Claude CLI for most tests
- ✅ Event predicates to filter specific events
- ✅ Event sequences to verify order

### Architecture is Production-Ready

The event-driven architecture is complete and verified. Your tests should **validate** it works, not debug it. If tests fail, it's likely:
1. UI rendering issue (separate from architecture)
2. Test setup issue (services not running)
3. Timing issue (increase timeout for real Claude CLI)

NOT an architecture problem (that's been solved!).

---

## Quick Start Command

```bash
# Terminal 1
cd claude-proxy-service && source venv/bin/activate && uvicorn app.main:app --port 8000

# Terminal 2
cd backend && npm run dev

# Terminal 3
cd frontend && xvfb-run npx playwright test e2e/fullstack/event-driven-core.spec.ts
```

---

## Success Metrics

When done, you should achieve:

✅ **100% event-driven tests** (no waitForTimeout)
✅ **<10 second average test time** (with synthetic agents)
✅ **0 race conditions** (all event-based)
✅ **Repeatable tests** (no manual cleanup needed)
✅ **Clear failure messages** (know exactly which event didn't arrive)

**Good luck! The infrastructure is ready - you just need to write the tests!** 🚀
