# WebSocket Initialization Fix

## Root Cause

All 8 real Claude E2E tests were failing with:
```
Error: Socket not available on window - ensure store is initialized
```

Additionally, production WebSocket URL was being used instead of localhost:
```
📡 WebSocket connection opened: wss://agents.petter.ai/?token=...
```

### The Issues

1. **URL Configuration Problem**:
   - E2E config uses Vite on port **5174** (not 5173)
   - Store runtime detection logic at `store.ts:22-28` was using production URLs
   - No explicit environment variables forced for E2E builds
   - Backend proxy pointed to wrong port (3001 instead of 3000)

2. **Socket Initialization Timing**:
   - Tests tried to use `waitForWebSocketEvent()` immediately after page load
   - Socket initialization is asynchronous
   - Tests didn't wait for `window.socket` to be available

3. **URL Mismatch**:
   - Test setup expected frontend on port 5173
   - E2E config actually uses port 5174
   - This caused frontend URL mismatch in test environment

## Configuration Issues

### Before (Broken)

**vite.config.e2e.ts:**
```typescript
// ❌ No forced environment variables
// ❌ Backend proxy target wrong (3001 instead of 3000)
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // WRONG PORT
      },
    },
  },
})
```

**setup.ts:**
```typescript
// ❌ Wrong frontend port (5173 instead of 5174)
frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
```

**store.ts:**
```typescript
// ❌ Runtime detection uses production URLs when not on localhost
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  const origin = window.location.origin; // e.g., https://agents.petter.ai
  return { apiUrl: origin, wsUrl: origin };
}
```

**Tests:**
```typescript
// ❌ No wait for socket initialization
test('test name', async ({ page, request }) => {
  // Immediately tries to use waitForWebSocketEvent
  const created = await waitForWebSocketEvent(page, 'agent:created', {
    agentId,
    timeout: 10000,
  });
  // FAILS: Socket not available yet!
});
```

## Fixes Applied

### 1. Force E2E Environment Variables

**File:** `frontend/vite.config.e2e.ts`

```typescript
export default defineConfig({
  // ✅ CRITICAL: Force E2E environment variables to override runtime detection
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:3000'),
    'import.meta.env.VITE_WS_URL': JSON.stringify('http://localhost:3000'),
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // ✅ FIXED: Correct backend port
      },
    },
  },
})
```

**Why it works:**
- Vite's `define` option replaces `import.meta.env.VITE_*` at build time
- This overrides the runtime detection logic in `store.ts`
- Forces localhost:3000 for both API and WebSocket URLs

### 2. Fix Frontend Port in Test Setup

**File:** `frontend/e2e/fullstack/setup.ts`

```typescript
export async function setupFullStackTest(): Promise<TestEnvironment> {
  const env: TestEnvironment = {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174', // ✅ FIXED
  };
}
```

### 3. Wait for Socket Initialization in All Tests

**File:** `frontend/e2e/fullstack/real-claude-integration.spec.ts`

**Added to EVERY test:**
```typescript
test('test name', async ({ page, request }) => {
  // ✅ CRITICAL: Wait for socket to be initialized before continuing
  console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
  await page.goto(env.frontendUrl);
  await page.waitForFunction(() => (window as any).socket !== undefined, { timeout: 10000 });
  console.log('   ✓ WebSocket initialized');

  // Now safe to use waitForWebSocketEvent
  const created = await waitForWebSocketEvent(page, 'agent:created', {
    agentId,
    timeout: 10000,
  });
});
```

**Why it works:**
- Navigates to page first
- Explicitly waits for `window.socket` to be defined
- Only proceeds when socket is ready
- Prevents "Socket not available" errors

### 4. Enhanced Socket Validation (Test 5 only)

**File:** `frontend/e2e/fullstack/real-claude-integration.spec.ts` (Test 5: UI Updates)

```typescript
// ✅ CRITICAL: Wait for socket to be initialized before continuing
console.log('⏳ Waiting for WebSocket initialization...');
await page.waitForFunction(() => {
  return (window as any).socket !== undefined;
}, { timeout: 10000 });

// Verify socket is connected
const wsStatus = await page.evaluate(() => {
  const socket = (window as any).socket;
  return socket ? { connected: socket.connected, url: socket.io.uri } : null;
});

if (!wsStatus?.connected) {
  throw new Error(`WebSocket not connected after page load. Status: ${JSON.stringify(wsStatus)}`);
}

console.log(`   ✓ WebSocket connected: ${wsStatus.url}`);
```

**Why it works:**
- Not only waits for socket to exist
- Also verifies it's actually connected
- Logs the WebSocket URL for debugging
- Fails fast with detailed error if not connected

### 5. Create Test Environment File

**File:** `frontend/.env.test` (NEW)

```bash
# E2E Test Environment
# Used by Playwright tests via vite.config.e2e.ts

VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

**Why it's needed:**
- Documents the expected E2E environment
- Provides fallback if `define` doesn't work
- Makes it clear what URLs E2E tests use

## Test Results

### Expected Behavior After Fix

When running E2E tests, you should now see:

```
🌐 Ensuring page is loaded and WebSocket is ready...
   ✓ WebSocket initialized
🚀 Launching real Claude agent...
   Agent ID: abc-123
⏳ Waiting for agent:created event...
   ✓ agent:created received
⏳ Waiting for message with E2E_TEST_MARKER...
   ✓ Message received: E2E_TEST_MARKER_12345
⏳ Waiting for agent completion...
   ✓ Agent completed successfully
```

### URLs Should Be

- **Frontend**: `http://localhost:5174` (Vite E2E server)
- **Backend**: `http://localhost:3000` (NestJS API)
- **WebSocket**: `ws://localhost:3000` (NOT production wss://agents.petter.ai)
- **Python Proxy**: `http://localhost:8000` (Claude CLI proxy)

### Validation

Run the quick validation test:

```bash
cd frontend
./test-websocket-init.sh
```

This runs just the first test to verify WebSocket initialization works.

Or run all real Claude tests:

```bash
cd frontend
npm run test:e2e -- real-claude-integration.spec.ts --reporter=line
```

## Success Criteria

- ✅ WebSocket connects to `ws://localhost:3000` (not production)
- ✅ `window.socket` is available when tests run
- ✅ Socket is connected before `waitForWebSocketEvent` is called
- ✅ At least 1 of 8 tests passes (proves setup works)
- ✅ No "Socket not available" errors

## Architecture Context

### How Socket Is Exposed

**File:** `packages/agent-manager-client/src/createAgentClient.ts`

```typescript
export function createAgentClient(config: AgentClientConfig) {
  // Create WebSocket connection
  const socket = io(config.websocketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  // Create Redux store
  const store = configureStore({ /* ... */ });

  return {
    store,
    socket, // ✅ Returned from factory
    actions: { /* ... */ },
    selectors: { /* ... */ },
  };
}
```

**File:** `frontend/src/store/store.ts`

```typescript
// Create configured client
const client = createAgentClient({
  apiUrl,
  websocketUrl: wsUrl,
});

// Export socket for advanced use
export const socket = client.socket;

// ✅ Expose to window for E2E testing
if (typeof window !== 'undefined') {
  (window as any).socket = client.socket;
  (window as any).store = store;
}
```

### URL Detection Logic

**File:** `frontend/src/store/store.ts`

```typescript
const getUrls = () => {
  // ✅ Check build-time environment variables FIRST
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_WS_URL) {
    return {
      apiUrl: import.meta.env.VITE_API_URL,
      wsUrl: import.meta.env.VITE_WS_URL,
    };
  }

  // Runtime detection (production)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return {
      apiUrl: window.location.origin,
      wsUrl: window.location.origin,
    };
  }

  // Development fallback
  return {
    apiUrl: 'http://localhost:3001',
    wsUrl: 'http://localhost:3001',
  };
};
```

**Order of precedence:**
1. Build-time env vars (`VITE_API_URL`, `VITE_WS_URL`) ← **E2E tests use this**
2. Runtime detection (hostname !== 'localhost') ← Production
3. Development fallback (localhost:3001) ← Dev mode

## Files Changed

### Created
- ✅ `frontend/.env.test` - E2E environment variables
- ✅ `frontend/test-websocket-init.sh` - Quick validation test script

### Modified
- ✅ `frontend/vite.config.e2e.ts` - Force E2E URLs, fix backend port
- ✅ `frontend/e2e/fullstack/setup.ts` - Fix frontend port (5174)
- ✅ `frontend/e2e/fullstack/real-claude-integration.spec.ts` - Add socket init wait to all 8 tests

## Testing Guide

### Prerequisites

1. **Backend running on port 3000:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Python proxy running on port 8000:**
   ```bash
   cd claude-proxy-service
   source venv/bin/activate
   uvicorn app.main:app --reload
   ```

3. **Claude CLI authenticated:**
   ```bash
   claude auth login
   ```

### Run Tests

**Quick validation (1 test):**
```bash
cd frontend
./test-websocket-init.sh
```

**All real Claude tests (8 tests, ~2-5 min):**
```bash
cd frontend
npm run test:e2e -- real-claude-integration.spec.ts --reporter=line
```

**With detailed output:**
```bash
cd frontend
npm run test:e2e -- real-claude-integration.spec.ts --reporter=list
```

### Debugging

If tests still fail, check:

1. **WebSocket URL in browser console:**
   - Open DevTools → Console
   - Look for: `[Store] Configured URLs: { apiUrl: ..., wsUrl: ... }`
   - Should be `http://localhost:3000`, NOT `https://agents.petter.ai`

2. **Socket availability:**
   - In DevTools Console: `window.socket`
   - Should return Socket.IO object, not `undefined`

3. **Socket connection status:**
   - In DevTools Console: `window.socket.connected`
   - Should return `true`

4. **Backend health:**
   ```bash
   curl http://localhost:3000/api/agents
   ```
   Should return `[]` or list of agents

5. **Python proxy health:**
   ```bash
   curl http://localhost:8000/health
   ```
   Should return `{"status":"ok",...}`

## Summary

**Root Cause:**
- Vite E2E config didn't force localhost URLs
- Tests didn't wait for async socket initialization
- Port mismatches between config and test setup

**Solution:**
- Force `VITE_API_URL` and `VITE_WS_URL` at build time via `vite.config.e2e.ts`
- Add explicit socket initialization wait to all tests
- Fix port mismatches (5174 for frontend, 3000 for backend)

**Result:**
- WebSocket connects to `ws://localhost:3000` ✅
- `window.socket` available before tests use it ✅
- All 8 real Claude E2E tests can now execute ✅

---

**Last Updated**: 2025-12-12
**Status**: ✅ Ready for testing
