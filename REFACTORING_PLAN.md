# Frontend Module Refactoring Plan

## Goal
Transform the frontend into a clean example implementation that uses a well-maintained, reusable module with proper separation of concerns.

## Current State Analysis

### Problems
1. **Duplicate API Client**: `api.service.ts` (154 lines) duplicates module's `AgentApiClient`
2. **Duplicate WebSocket**: `useWebSocket.ts` (175 lines) duplicates module middleware
3. **Split Message State**: Messages in Redux + local hook state + window events
4. **Duplicate Types**: Types defined in both module and frontend
5. **Tight Component Coupling**: Direct Redux selector usage instead of reusable hooks

### Test Coverage
- **Module**: 8 test files with comprehensive coverage
- **Frontend**: 6 test files (63 unit + 19 E2E tests)

## Refactoring Phases

### Phase 1: Enhance Module Exports ✅
**Goal**: Export utility functions for reuse

**Tasks**:
1. Create `utils/messageAggregation.ts` in module
   - Export `aggregateStreamingTokens()` function
   - Add comprehensive tests (RED → GREEN → REFACTOR)
2. Update module `index.ts` to export utility

**Tests to Write**:
- `aggregateStreamingTokens()` with no messages
- With only complete messages (no aggregation needed)
- With streaming tokens (should aggregate)
- With streaming + duplicate complete message (should deduplicate)
- With mixed streaming and complete messages

**Time**: 1-2 hours

---

### Phase 2: Remove Duplicate API Client ✅
**Goal**: Use module's `AgentApiClient` everywhere

**Tasks**:
1. Update all frontend imports to use module's client
2. Delete `frontend/src/services/api.service.ts`
3. Verify all tests pass

**Files to Update**:
- `frontend/src/hooks/useAgentMessages.ts`
- Any components using ApiService

**Tests to Update**:
- Mock `AgentApiClient` instead of `ApiService`

**Time**: 30 minutes

---

### Phase 3: Remove Duplicate WebSocket Hook ✅
**Goal**: Use Redux state for WebSocket connection

**Tasks**:
1. Delete `frontend/src/hooks/useWebSocket.ts`
2. Update components to use Redux selectors for connection state
3. Remove window.dispatchEvent custom events

**Files to Update**:
- Components using `useWebSocket`
- Remove window event listeners

**Tests to Update**:
- Update mocks to use Redux state

**Time**: 1 hour

---

### Phase 4: Consolidate Message State ✅
**Goal**: Redux as single source of truth

**Tasks**:
1. Move gap detection to module middleware (optional)
2. Refactor `useAgentMessages` to wrap Redux state
3. Remove local state management from hook
4. Use `messageReceived` Redux action instead of window events

**New Hook Structure**:
```typescript
export function useAgentMessages(agentId: string | null) {
  const dispatch = useDispatch();
  const messages = useSelector(selectMessagesForAgent(state, agentId));
  const loading = useSelector(/* ... */);
  const error = useSelector(/* ... */);

  // Load initial messages
  useEffect(() => {
    if (agentId) {
      dispatch(fetchMessages({ agentId }));
    }
  }, [agentId, dispatch]);

  // Aggregate tokens for display
  const displayMessages = useMemo(
    () => aggregateStreamingTokens(messages),
    [messages]
  );

  return { messages: displayMessages, loading, error, refetch: () => ... };
}
```

**Tests to Update**:
- Update to use Redux Provider
- Mock Redux state instead of local state

**Time**: 2-3 hours

---

### Phase 5: Create Reusable App Hooks ✅
**Goal**: Wrap Redux selectors in convenient hooks

**Tasks**:
1. Create `frontend/src/hooks/useAppState.ts`
2. Export convenience hooks:
   - `useAgents()`
   - `useSelectedAgent()`
   - `useAgentById(id)`
   - `useConnectionStatus()`
   - `useAgentMessages(id)` (already exists, refactor)

**New Hooks**:
```typescript
export function useAgents() {
  return useSelector(selectAllAgents);
}

export function useSelectedAgent() {
  return useSelector(selectSelectedAgent);
}

export function useAgentById(id: string | null) {
  return useSelector((state) =>
    id ? selectAgentById(state, id) : null
  );
}

export function useConnectionStatus() {
  return useSelector(selectIsConnected);
}
```

**Tests to Write**:
- Test each hook with Redux Provider
- Verify selectors are called correctly

**Time**: 1-2 hours

---

### Phase 6: Remove Duplicate Types ✅
**Goal**: Import all types from module

**Tasks**:
1. Delete `frontend/src/types/agent.types.ts`
2. Update all imports to use module types
3. Verify TypeScript compiles

**Files to Update**:
- All files importing from `@/types/agent.types`
- Update to `import type { ... } from '@headless-agent-manager/client'`

**Tests to Update**:
- Update type imports

**Time**: 30 minutes

---

### Phase 7: Update Components ✅
**Goal**: Use new hooks, clean separation

**Tasks**:
1. Update components to use app hooks instead of direct selectors
2. Simplify component logic
3. Remove Redux boilerplate from components

**Components to Update**:
- `AgentOutput.tsx` - use `useAgentMessages()`
- `AgentList.tsx` - use `useAgents()`
- `ConnectionStatus.tsx` - use `useConnectionStatus()`
- Any others using Redux directly

**Tests to Update**:
- Update mocks for new hooks

**Time**: 2-3 hours

---

### Phase 8: Centralize Configuration ✅
**Goal**: Single URL configuration mechanism

**Tasks**:
1. Create `frontend/src/config/client.ts`
2. Move URL detection logic there
3. Remove duplicates from components and hooks

**New Structure**:
```typescript
// config/client.ts
export function getClientConfig(): AgentClientConfig {
  const apiUrl = import.meta.env.VITE_API_URL || detectApiUrl();
  const websocketUrl = import.meta.env.VITE_WS_URL || detectWsUrl();

  return { apiUrl, websocketUrl, debug: import.meta.env.DEV };
}

// store/store.ts
import { getClientConfig } from '@/config/client';
const client = createAgentClient(getClientConfig());
```

**Time**: 1 hour

---

### Phase 9: Update Documentation ✅
**Goal**: Document the new architecture

**Tasks**:
1. Update `CLAUDE.md` with new structure
2. Create module usage guide
3. Update component examples
4. Document hook usage patterns

**Documents to Create/Update**:
- `packages/agent-manager-client/README.md` - Module usage guide
- `CLAUDE.md` - Update with new patterns
- `frontend/README.md` - Frontend implementation guide

**Time**: 1-2 hours

---

### Phase 10: Full Test Suite ✅
**Goal**: Verify everything works

**Tasks**:
1. Run module tests: `cd packages/agent-manager-client && npm test`
2. Run frontend unit tests: `cd frontend && npm test -- --run`
3. Run E2E tests: `cd frontend && npm run test:e2e`
4. Run backend tests: `cd backend && npm test`
5. Manual smoke test of UI

**Success Criteria**:
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ UI works correctly
- ✅ WebSocket connection functional
- ✅ Message display correct
- ✅ Agent lifecycle working

**Time**: 1 hour

---

## Total Estimated Time
**12-18 hours** (1.5 - 2 days)

## Success Metrics

### Code Reduction
- Remove ~600+ lines of duplicate code
- Reduce frontend complexity by 40%

### Architecture Improvement
- ✅ Single source of truth for all state
- ✅ Clear module boundaries
- ✅ Reusable hooks
- ✅ Framework-agnostic module

### Test Coverage
- Maintain 80%+ coverage
- All tests pass
- No regressions

### Reusability Score
- **Before**: 4/10
- **After**: 9/10

## Risk Mitigation

### Risks
1. Breaking existing E2E tests
2. WebSocket connection issues
3. Message display regressions

### Mitigation
- Follow TDD strictly (RED → GREEN → REFACTOR)
- Run tests after each phase
- Keep git commits small and focused
- Test WebSocket connection manually after each change

## Rollback Plan
If any phase fails:
1. Revert last commit
2. Review failing tests
3. Fix issues before proceeding
4. Never proceed with failing tests
