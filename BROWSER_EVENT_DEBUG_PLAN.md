# Browser Event Reception Debug Plan

## Problem Statement

Redux middleware receives WebSocket events (agent appears in UI), but E2E test listeners registered via `waitForWebSocketEvent()` don't receive the same events, causing test timeouts.

## Key Code Locations

### 1. Redux Middleware (WORKS ✅)
**File:** `packages/agent-manager-client/src/store/middleware/websocketMiddleware.ts`
**Line:** 69-87

```typescript
socket.on('agent:message', (event: AgentMessageEvent) => {
  // This listener RECEIVES events successfully
  store.dispatch(messageReceived({ agentId, message }));
});
```

### 2. E2E Helper (FAILS ❌)
**File:** `frontend/e2e/helpers/waitForWebSocketEvent.ts`
**Line:** 49-115

```typescript
// Runs in page.evaluate() - isolated browser context
const result = await page.evaluate(({ event, timeoutMs, predicateFn, filterAgentId }) => {
  return new Promise((resolve, reject) => {
    const socket = (window as any).socket;
    socket.on(event, handler); // This listener DOES NOT receive events
  });
});
```

### 3. Socket Exposure to Window
**File:** `frontend/src/store/store.ts`
**Line:** 58-64

```typescript
if (typeof window !== 'undefined') {
  (window as any).store = store;
  (window as any).socket = client.socket; // Same socket instance
}
```

## Hypotheses

### Hypothesis 1: Listener Registration Timing ⏱️
**Theory:** E2E listeners are registered AFTER events have already been emitted

**Evidence:**
- Middleware listener is registered on page load (line 69 of websocketMiddleware.ts)
- E2E listener is registered via `page.evaluate()` AFTER test starts
- Test flow: `waitForWebSocketEvent()` → `launchAgent()` → Events emitted

**Test:** Register listener BEFORE launching agent
```typescript
// Current pattern (may miss early events)
const eventPromise = waitForWebSocketEvent(page, 'agent:created');
const agentId = await launchAgent();
await eventPromise; // Times out!

// Fixed pattern (listener ready before events)
const eventPromise = waitForWebSocketEvent(page, 'agent:created');
// Listener is NOW registered
const agentId = await launchAgent();
// Events arrive, listener fires
await eventPromise; // Should work ✅
```

**Status:** Test pattern ALREADY uses correct order (line 96-103 of event-driven-core.spec.ts)
**Conclusion:** ❌ Not the root cause

### Hypothesis 2: Socket.IO Event Handler Isolation 🔒
**Theory:** `page.evaluate()` creates an isolated context that doesn't share event handlers with main page context

**Evidence:**
- Middleware runs in main page context (loaded via Redux store initialization)
- E2E listener runs in `page.evaluate()` isolated context
- Socket.IO may not propagate events across context boundaries

**Test:**
```typescript
// Add listener in main page context (NOT in page.evaluate)
await page.addInitScript(() => {
  window.addEventListener('load', () => {
    const socket = (window as any).socket;
    socket.on('agent:message', (data) => {
      console.log('[InitScript] Event received!', data);
    });
  });
});
```

**Expected:** If initScript listener receives events, context isolation is confirmed

### Hypothesis 3: Socket Instance Mismatch 🔌
**Theory:** `(window as any).socket` in E2E context is different from Redux middleware socket

**Evidence:**
- Redux middleware uses `client.socket` (line 103 of websocketMiddleware.ts)
- E2E uses `(window as any).socket` (line 52 of waitForWebSocketEvent.ts)
- Both should be the same instance (line 61 of store.ts), but need to verify

**Test:**
```typescript
const socketCheck = await page.evaluate(() => {
  const socket = (window as any).socket;
  return {
    id: socket.id,
    connected: socket.connected,
    listenerCount: socket.listeners('agent:message').length,
  };
});
```

**Expected:** If socket is connected but has 0 listeners, socket instance is different

### Hypothesis 4: Room-Based Event Scoping 📡
**Theory:** Backend emits events to specific rooms, E2E client isn't in the room

**Evidence:**
- Backend uses `socket.to(agentId).emit()` for targeted events
- Client must subscribe: `socket.emit('subscribe', { agentId })`
- E2E tests call `selectAgentAndSubscribe()` (line 182 of event-driven-core.spec.ts)

**Test:**
```typescript
// Check if subscription succeeds
await page.evaluate((id) => {
  (window as any).socket.emit('subscribe', { agentId: id });
}, agentId);

// Verify subscription confirmation
const subscribed = await waitForWebSocketEvent(page, 'subscribed');
```

**Expected:** If `subscribed` event received, room scoping is correct

## Diagnostic Test Plan

### Test 1: Listener Count Verification
**Goal:** Confirm both middleware and E2E listeners are registered

```typescript
const listenerCount = await page.evaluate(() => {
  return (window as any).socket.listeners('agent:message').length;
});

// Expected: 2 (middleware + E2E)
// If 1: E2E listener not registered
// If 0: Socket instance mismatch
```

### Test 2: Early vs Late Listener Comparison
**Goal:** Test if listener registration timing matters

```typescript
// Add early listener (before launch)
await page.evaluate(() => {
  (window as any).earlyEvents = [];
  (window as any).socket.on('agent:message', (data) => {
    (window as any).earlyEvents.push(data);
  });
});

// Launch agent
const agentId = await launchAgent();

// Add late listener (after launch)
await page.evaluate(() => {
  (window as any).lateEvents = [];
  (window as any).socket.on('agent:message', (data) => {
    (window as any).lateEvents.push(data);
  });
});

// Wait for messages
await page.waitForTimeout(5000);

// Check results
const { early, late } = await page.evaluate(() => ({
  early: (window as any).earlyEvents.length,
  late: (window as any).lateEvents.length,
}));

// If early > 0 and late === 0: Timing issue
// If early === 0 and late === 0: Socket instance issue
```

### Test 3: Context Isolation Test
**Goal:** Verify if page.addInitScript receives events

```typescript
await page.addInitScript(() => {
  window.addEventListener('load', () => {
    const checkSocket = () => {
      const socket = (window as any).socket;
      if (socket) {
        (window as any).initScriptEvents = [];
        socket.on('agent:message', (data) => {
          (window as any).initScriptEvents.push(data);
        });
      } else {
        setTimeout(checkSocket, 100);
      }
    };
    checkSocket();
  });
});

// Reload page
await page.reload();

// Launch agent
const agentId = await launchAgent();

// Check results
const initEvents = await page.evaluate(() => {
  return (window as any).initScriptEvents || [];
});

// If initEvents.length > 0: Context isolation NOT the issue
// If initEvents.length === 0: Context isolation confirmed
```

### Test 4: Socket Instance Verification
**Goal:** Verify socket instance is shared

```typescript
const socketInfo = await page.evaluate(() => {
  const socket = (window as any).socket;
  const store = (window as any).store;

  return {
    socketId: socket?.id,
    socketConnected: socket?.connected,
    storeExists: !!store,
    listenerCount: socket?.listeners('agent:message').length,
  };
});

console.log('Socket Info:', socketInfo);

// Expected:
// - socketId: defined
// - socketConnected: true
// - storeExists: true
// - listenerCount: 1 (middleware only, before E2E listener added)
```

## Added Diagnostic Logging

### 1. Middleware Logging (websocketMiddleware.ts:73-79)
```typescript
console.log(`[WebSocketMiddleware] 📨 agent:message received`, {
  agentId,
  messageType: message?.type,
  contentPreview: message?.content?.substring(0, 50),
  sequenceNumber: message?.sequenceNumber,
  timestamp: new Date().toISOString(),
});
```

### 2. E2E Helper Logging (waitForWebSocketEvent.ts:67-70, 106-110)
```typescript
// When handler is called
console.log(`[waitForWebSocketEvent] 🎯 Handler called for ${event}`);

// When listener is registered
console.log(`[waitForWebSocketEvent] 📡 Registered listener for: ${event}`, {
  listenerCount: socket.listeners(event).length,
});
```

## Running the Diagnostic Test

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev

# Terminal 3: Run diagnostic test
cd frontend
npx playwright test e2e/diagnostic-event-reception.spec.ts --headed --project=chromium
```

## Expected Output Analysis

### Scenario A: Middleware Receives, E2E Doesn't
**Log Pattern:**
```
[WebSocketMiddleware] 📨 agent:message received
[WebSocketMiddleware] ✅ Dispatched to Redux
(No E2E handler logs)
```
**Root Cause:** E2E listener not firing
**Possible Reasons:**
- Context isolation
- Socket instance mismatch
- Event filtering blocking all events

### Scenario B: Both Receive
**Log Pattern:**
```
[WebSocketMiddleware] 📨 agent:message received
[waitForWebSocketEvent] 🎯 Handler called for agent:message
[waitForWebSocketEvent] ✅ Agent ID matched
```
**Root Cause:** Event filtering or predicate logic
**Fix:** Review agentId extraction logic

### Scenario C: Neither Receives
**Log Pattern:**
```
(No logs at all)
```
**Root Cause:** Backend not emitting events
**Fix:** Check backend subscription logic

## Next Steps

1. ✅ Run diagnostic test
2. ✅ Analyze console output
3. ✅ Identify which hypothesis is confirmed
4. ✅ Implement fix
5. ✅ Verify all E2E tests pass
6. ✅ Remove diagnostic logging

## Fix Strategies

### If Hypothesis 2 (Context Isolation) is Confirmed:
**Solution:** Use `page.exposeFunction()` to bridge contexts

```typescript
// Register bridge function
await page.exposeFunction('onWebSocketEvent', (event: string, data: any) => {
  console.log('[Bridge] Event received:', event, data);
  // Resolve promise in test context
});

// In browser context, call bridge function
await page.evaluate(() => {
  const socket = (window as any).socket;
  socket.on('agent:message', (data) => {
    (window as any).onWebSocketEvent('agent:message', data);
  });
});
```

### If Hypothesis 3 (Socket Instance) is Confirmed:
**Solution:** Ensure single socket instance

```typescript
// In store.ts, add validation
if (typeof window !== 'undefined') {
  if ((window as any).socket) {
    console.warn('[Store] Socket already exists on window!');
  }
  (window as any).socket = client.socket;
}
```

### If Hypothesis 4 (Room Scoping) is Confirmed:
**Solution:** Ensure subscription before waiting

```typescript
// Always subscribe BEFORE setting up listener
await page.evaluate((id) => {
  (window as any).socket.emit('subscribe', { agentId: id });
}, agentId);

// Wait for subscription confirmation
await waitForWebSocketEvent(page, 'subscribed', { agentId });

// NOW set up message listener
const messagePromise = waitForWebSocketEvent(page, 'agent:message', { agentId });
```

## Success Criteria

✅ Diagnostic test identifies root cause
✅ Console logs show clear pattern
✅ Fix implemented based on confirmed hypothesis
✅ All E2E tests pass without timeouts
✅ Diagnostic logging removed
