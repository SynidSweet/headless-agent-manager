# Comprehensive Test Implementation Plan

**Complete Test Infrastructure for AI-Autonomous Development**

---

## Executive Summary

**Goal**: Create production-grade test infrastructure covering all layers from frontend to CLI agents.

**Scope**: Backend + Frontend + Full-Stack E2E + Contract Tests

**Timeline**: 4-5 weeks for complete implementation

**Success Criteria**:
- All critical gaps filled
- 95%+ test coverage
- All contracts verified
- Zero architectural blind spots
- AI agents can autonomously verify all changes

---

## Current State

**Existing Tests**: 444 tests (370 backend + 74 frontend)
**Pass Rate**: 97.3% backend, 100% frontend
**Coverage**: B+ overall (80%)
**Critical Gaps**:
- WebSocket Gateway (0% coverage)
- Logger Service (0% coverage)
- Full-stack E2E (missing)
- Contract tests (missing)

---

## Implementation Phases

### Phase 1: Critical Infrastructure Gaps (Week 1)
**Priority**: CRITICAL - These are blockers for reliable development

### Phase 2: Contract & Boundary Tests (Week 2)
**Priority**: HIGH - Prevents architectural bugs like FK violations

### Phase 3: Full-Stack E2E Tests (Week 3)
**Priority**: HIGH - Verifies complete system integration

### Phase 4: Edge Cases & Performance (Week 4-5)
**Priority**: MEDIUM - Increases confidence and production readiness

---

## PHASE 1: CRITICAL INFRASTRUCTURE GAPS

**Duration**: 5 days
**Tests to Add**: 47 tests
**Coverage Gain**: +8%

### 1.1 WebSocket Gateway Tests (CRITICAL)

**File**: `backend/test/unit/application/gateways/agent.gateway.spec.ts`
**Priority**: P0 - CRITICAL
**Duration**: 4 hours
**Tests**: 15

**Why Critical**: Gateway is completely untested. Bugs here affect all real-time updates.

**Test List**:

```typescript
describe('AgentGateway', () => {
  describe('Connection Lifecycle', () => {
    // 1. Should track connected clients
    it('should add client to connectedClients map on connection')
    it('should remove client from connectedClients map on disconnect')
    it('should emit "connected" event with client ID and timestamp')
    it('should handle multiple simultaneous connections')
  })

  describe('Subscription Management', () => {
    // 5. Should manage agent subscriptions
    it('should join client to agent room on subscribe')
    it('should leave client from agent room on unsubscribe')
    it('should emit "subscribed" confirmation to client')
    it('should emit "unsubscribed" confirmation to client')
    it('should handle subscription to non-existent agent')
    it('should allow multiple clients to subscribe to same agent')
  })

  describe('Message Broadcasting', () => {
    // 11. Should emit to correct clients
    it('should emit to specific client via emitToClient()')
    it('should emit to all clients via emitToAll()')
    it('should emit to room via emitToRoom()')
    it('should NOT emit to clients not in room')
  })

  describe('Error Handling', () => {
    // 15. Should handle edge cases
    it('should handle emit to disconnected client')
  })
})
```

**Success Criteria**:
- All 15 tests pass
- 100% coverage of agent.gateway.ts
- Uses real socket.io mock

**Estimated Time**: 4 hours

---

### 1.2 Logger Service Tests

**File**: `backend/test/unit/infrastructure/logging/console-logger.service.spec.ts`
**Priority**: P0 - CRITICAL
**Duration**: 2 hours
**Tests**: 12

**Why Critical**: Logger failures could silently break system. No tests exist.

**Test List**:

```typescript
describe('ConsoleLogger', () => {
  describe('Log Levels', () => {
    // 1-5. All log levels work
    it('should log info messages with timestamp')
    it('should log error messages with timestamp')
    it('should log warn messages with timestamp')
    it('should log debug messages with timestamp')
    it('should log context object as JSON')
  })

  describe('Error Handling', () => {
    // 6-8. Logger shouldn't break system
    it('should not throw if context serialization fails')
    it('should handle circular references in context')
    it('should handle undefined/null context')
  })

  describe('Output Format', () => {
    // 9-12. Verify output format
    it('should include timestamp in ISO 8601 format')
    it('should include log level in message')
    it('should stringify context as JSON')
    it('should handle multi-line messages')
  })
})
```

**Success Criteria**:
- All 12 tests pass
- 100% coverage of console-logger.service.ts
- Logger errors don't crash system

**Estimated Time**: 2 hours

---

### 1.3 Database Service Tests

**File**: `backend/test/unit/infrastructure/database/database.service.spec.ts`
**Priority**: P0 - CRITICAL
**Duration**: 3 hours
**Tests**: 20

**Why Critical**: Database is foundation. FK constraint enablement must be verified.

**Test List**:

```typescript
describe('DatabaseService', () => {
  describe('Connection Management', () => {
    // 1-4. Connection lifecycle
    it('should connect to database on onModuleInit()')
    it('should close database on onModuleDestroy()')
    it('should not reconnect if already connected')
    it('should throw if getDatabase() called before connect()')
  })

  describe('Configuration', () => {
    // 5-9. CRITICAL: Verify pragmas
    it('should enable foreign_keys pragma', () => {
      db.onModuleInit()
      const fk = db.getDatabase().pragma('foreign_keys', { simple: true })
      expect(fk).toBe(1)
    })
    it('should enable WAL journal mode')
    it('should support in-memory database (:memory:)')
    it('should support file-based database')
    it('should handle database file not found error')
  })

  describe('Schema Migration', () => {
    // 10-15. Schema loading
    it('should execute schema.sql on initialization')
    it('should create agents table with all columns')
    it('should create agent_messages table with FK')
    it('should create all indexes')
    it('should be idempotent (safe to run multiple times)')
    it('should handle schema.sql file not found')
  })

  describe('Transactions', () => {
    // 16-20. Transaction support
    it('should execute function in transaction')
    it('should rollback transaction on error')
    it('should commit transaction on success')
    it('should handle nested transactions')
    it('should isolate concurrent transactions')
  })
})
```

**Success Criteria**:
- All 20 tests pass
- 100% coverage of database.service.ts
- FK constraint enablement verified

**Estimated Time**: 3 hours

---

### Phase 1 Summary

| Component | Tests | Duration | Files Created |
|-----------|-------|----------|---------------|
| WebSocket Gateway | 15 | 4h | 1 |
| Logger Service | 12 | 2h | 1 |
| Database Service | 20 | 3h | 1 |
| **Total** | **47** | **9h** | **3** |

**Phase 1 Deliverable**: Critical infrastructure fully tested, FK constraint bug class eliminated.

---

## PHASE 2: CONTRACT & BOUNDARY TESTS

**Duration**: 7 days
**Tests to Add**: 65 tests
**Coverage Gain**: +7%

### 2.1 IAgentRunner Contract Tests

**File**: `backend/test/contracts/agent-runner.contract.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 6 hours
**Tests**: 20 (4 per adapter × 5 adapters)

**Test List**:

```typescript
describe('IAgentRunner Contract Compliance', () => {
  const adapters = [
    { name: 'ClaudePythonProxyAdapter', class: ClaudePythonProxyAdapter, needsSetup: true },
    { name: 'ClaudeSDKAdapter', class: ClaudeSDKAdapter, needsApiKey: true },
    { name: 'ClaudeCodeAdapter', class: ClaudeCodeAdapter, skip: 'Node.js bug' },
    { name: 'GeminiCLIAdapter', class: GeminiCLIAdapter, notImplemented: true },
    { name: 'SyntheticAgentAdapter', class: SyntheticAgentAdapter, needsSetup: false }
  ]

  adapters.forEach(adapterConfig => {
    describe(`${adapterConfig.name}`, () => {
      // Test 1: Start returns valid Agent
      it('should return Agent from start()', async () => {
        const agent = await adapter.start(session)

        expect(agent).toBeInstanceOf(Agent)
        expect(agent.id).toBeDefined()
        expect(agent.status).toBe(AgentStatus.RUNNING)
      })

      // Test 2: Agent ID is stable
      it('should return agent with stable ID', async () => {
        const agent = await adapter.start(session)

        const id1 = agent.id.toString()
        await wait(100)
        const id2 = agent.id.toString()

        expect(id1).toBe(id2)
      })

      // Test 3: Agent is saveable to database
      it('should return agent saveable to repository', async () => {
        const db = new DatabaseService(':memory:')
        db.onModuleInit()
        const repo = new SqliteAgentRepository(db)

        const agent = await adapter.start(session)

        // CRITICAL: Must not throw FK or other DB error
        await expect(repo.save(agent)).resolves.not.toThrow()

        // Verify it was actually saved
        const saved = await repo.findById(agent.id)
        expect(saved).toBeDefined()
      })

      // Test 4: Messages reference correct agent ID
      it('should emit messages with matching agent ID', async () => {
        const agent = await adapter.start(session)
        const messages: AgentMessage[] = []

        adapter.subscribe(agent.id, {
          onMessage: msg => messages.push(msg),
          onStatusChange: () => {},
          onError: () => {},
          onComplete: () => {}
        })

        await waitForMessages(messages, 1, 5000)

        // CRITICAL: Message must reference the agent returned by start()
        expect(messages[0].agentId).toBe(agent.id.toString())
      })
    })
  })
})
```

**Success Criteria**:
- 20 tests pass
- All adapters verified to honor contract
- FK constraint violations impossible by design

**Estimated Time**: 6 hours

---

### 2.2 WebSocket Event Schema Contract

**File**: `backend/test/contracts/websocket-api.contract.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 4 hours
**Tests**: 15

**Test List**:

```typescript
describe('WebSocket API Contract', () => {
  describe('Event: agent:message', () => {
    // 1-3. Schema validation
    it('must have agentId field (string UUID)')
    it('must have message field with required properties')
    it('must have timestamp field (ISO 8601)')
  })

  describe('Event: agent:status', () => {
    // 4-6. Schema validation
    it('must have agentId field')
    it('must have status field (valid enum value)')
    it('must have timestamp field')
  })

  describe('Event: agent:created', () => {
    // 7-9. Schema validation
    it('must have agent field with complete agent data')
    it('must have timestamp field')
    it('agent.id must match database record')
  })

  describe('Event: agent:updated', () => {
    // 10-12. Schema validation
    it('must have agentId field')
    it('must have status field')
    it('must have timestamp field')
  })

  describe('Event: agent:deleted', () => {
    // 13-15. Schema validation
    it('must have agentId field')
    it('must have timestamp field')
    it('must emit AFTER database deletion')
  })
})
```

**Success Criteria**:
- All event schemas verified
- Frontend can rely on schema consistency
- Breaking changes caught by tests

**Estimated Time**: 4 hours

---

### 2.3 Frontend-Backend Contract Tests

**File**: `frontend/test/contracts/backend-api.contract.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 5 hours
**Tests**: 15

**Test List**:

```typescript
describe('Frontend ↔ Backend Contract', () => {
  describe('REST API Contracts', () => {
    // 1-5. HTTP endpoints match frontend expectations
    it('POST /api/agents returns expected schema')
    it('GET /api/agents returns array of agents')
    it('DELETE /api/agents/:id returns 204')
    it('Error responses have expected format')
    it('CORS headers allow frontend domain')
  })

  describe('WebSocket Contracts', () => {
    // 6-10. WebSocket events match Redux actions
    it('agent:created event matches agentCreated action payload')
    it('agent:message event matches messageReceived action payload')
    it('agent:status event matches agentStatusUpdated payload')
    it('agent:deleted event matches agentDeleted payload')
    it('connection/disconnection events work correctly')
  })

  describe('Data Type Contracts', () => {
    // 11-15. TypeScript types match between frontend/backend
    it('Agent type matches between @headless-agent-manager/client and backend')
    it('AgentMessage type matches')
    it('LaunchAgentRequest type matches')
    it('AgentStatus enum values match')
    it('AgentType enum values match')
  })
})
```

**Success Criteria**:
- Frontend and backend stay in sync
- Type mismatches caught by tests
- Breaking API changes fail builds

**Estimated Time**: 5 hours

---

### 2.4 Database Schema Contract Tests

**File**: `backend/test/contracts/database-schema.contract.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 3 hours
**Tests**: 15

**Test List**:

```typescript
describe('Database Schema Contract', () => {
  describe('Foreign Key Constraints', () => {
    // 1-5. FK integrity
    it('must have FK enabled globally')
    it('agent_messages.agent_id must reference agents.id')
    it('must reject insert with invalid agent_id')
    it('must CASCADE delete messages when agent deleted')
    it('must prevent agent deletion with orphan messages (if NO CASCADE)')
  })

  describe('Unique Constraints', () => {
    // 6-8. Uniqueness
    it('agents.id must be unique')
    it('agent_messages.id must be unique')
    it('(agent_id, sequence_number) must be unique')
  })

  describe('Index Performance', () => {
    // 9-12. Indexes exist and work
    it('must have index on agents(status) for findByStatus()')
    it('must have index on agent_messages(agent_id) for message lookup')
    it('must have index on (agent_id, sequence_number) for ordering')
    it('must use index for queries (verify with EXPLAIN QUERY PLAN)')
  })

  describe('Data Types', () => {
    // 13-15. Type enforcement
    it('must store dates as ISO 8601 strings')
    it('must store JSON as TEXT')
    it('must store UUIDs as TEXT')
  })
})
```

**Success Criteria**:
- Database constraints verified
- Performance guaranteed by indexes
- Schema changes break tests if incompatible

**Estimated Time**: 3 hours

---

### Phase 2 Summary

| Component | Tests | Duration | Priority |
|-----------|-------|----------|----------|
| IAgentRunner Contract | 20 | 6h | P1 |
| WebSocket API Contract | 15 | 4h | P1 |
| Frontend-Backend Contract | 15 | 5h | P1 |
| Database Schema Contract | 15 | 3h | P1 |
| **Total** | **65** | **18h** | **HIGH** |

---

## PHASE 3: FULL-STACK E2E TESTS

**Duration**: 7 days
**Tests to Add**: 30 tests
**Coverage**: End-to-end flows

### 3.1 Complete User Journeys

**File**: `test/e2e/full-stack/user-journeys.e2e.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 8 hours
**Tests**: 8

**Test List**:

```typescript
describe('Complete User Journeys (Full-Stack E2E)', () => {
  // 1. Launch agent from browser
  it('USER: Clicks "Launch Agent" → Agent appears → Messages stream', async () => {
    // Simulates real user clicking button
    // 1. Playwright clicks launch button
    // 2. Verifies WebSocket connection established
    // 3. Verifies agent appears in list
    // 4. Verifies messages appear in real-time
    // 5. Verifies messages in database
  })

  // 2. Select agent from list
  it('USER: Selects agent → Output shows → Subscription confirmed', async () => {
    // 1. Launch agent
    // 2. Click on agent in list
    // 3. Verify WebSocket subscribe event sent
    // 4. Verify messages appear in output panel
  })

  // 3. Terminate agent
  it('USER: Clicks "Terminate" → Agent stops → Status updates', async () => {
    // 1. Launch agent
    // 2. Click terminate button
    // 3. Verify DELETE request sent
    // 4. Verify agent status updates to "terminated"
    // 5. Verify WebSocket receives agent:deleted event
  })

  // 4. Reconnection after network failure
  it('USER: Network fails → Reconnects → State syncs', async () => {
    // 1. Launch agent, collect messages
    // 2. Simulate network failure (kill WebSocket)
    // 3. Wait for reconnection
    // 4. Verify all messages still visible
    // 5. Verify no duplicates
  })

  // 5. Multiple agents simultaneously
  it('USER: Launches 3 agents → All update independently', async () => {
    // 1. Launch 3 agents
    // 2. Verify all 3 appear in list
    // 3. Select agent 1 → see messages
    // 4. Select agent 2 → see different messages
    // 5. Verify no message cross-contamination
  })

  // 6. Message ordering under load
  it('USER: Rapid messages → Correct order maintained', async () => {
    // 1. Launch synthetic agent with 100 messages
    // 2. Verify all messages appear
    // 3. Verify sequence numbers are monotonic
    // 4. Verify no gaps in sequence
  })

  // 7. Error recovery
  it('USER: Backend error → UI shows error → Can retry', async () => {
    // 1. Trigger backend error (invalid prompt)
    // 2. Verify error appears in UI
    // 3. Verify can launch new agent after error
  })

  // 8. Browser refresh
  it('USER: Refreshes page → Agents reload → Subscriptions restore', async () => {
    // 1. Launch agent
    // 2. Refresh browser
    // 3. Verify agents load from API
    // 4. Verify can select and view messages
  })
})
```

**Success Criteria**:
- All user journeys work end-to-end
- Playwright tests use real browser
- Tests use real backend + real database

**Estimated Time**: 8 hours

---

### 3.2 WebSocket Full-Stack Integration

**File**: `test/e2e/full-stack/websocket-integration.e2e.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 6 hours
**Tests**: 12

**Test List**:

```typescript
describe('WebSocket Full-Stack Integration', () => {
  describe('Connection Lifecycle', () => {
    // 1-3. Connection management
    it('Frontend connects → Backend confirms → Redux updated')
    it('Frontend disconnects → Backend cleans up → Redux updated')
    it('Frontend reconnects → Backend syncs state → Redux backfills')
  })

  describe('Message Flow', () => {
    // 4-8. Complete message path
    it('CLI emits → Adapter parses → Service broadcasts → WebSocket sends → Frontend receives → Redux stores')
    it('Message persists to database before WebSocket emission')
    it('Frontend deduplicates messages by UUID')
    it('Gap detection triggers API backfill')
    it('Sequence numbers remain monotonic across WebSocket and API')
  })

  describe('Subscription Management', () => {
    // 9-12. Room-based subscriptions
    it('Frontend subscribes → Joins room → Receives only subscribed agent messages')
    it('Frontend unsubscribes → Leaves room → Stops receiving messages')
    it('Multiple frontend clients → Each receives correct messages')
    it('Client disconnect → Automatic unsubscribe from all agents')
  })
})
```

**Success Criteria**:
- Complete WebSocket path verified
- Message ordering guaranteed
- No race conditions

**Estimated Time**: 6 hours

---

### 3.3 Redux State Synchronization

**File**: `frontend/test/e2e/redux-state-sync.e2e.spec.ts`
**Priority**: P1 - HIGH
**Duration**: 5 hours
**Tests**: 10

**Test List**:

```typescript
describe('Redux State Synchronization (E2E)', () => {
  // 1-5. State consistency
  it('WebSocket agent:created → Redux agentCreated → State updated')
  it('WebSocket agent:message → Redux messageReceived → Messages array updated')
  it('WebSocket agent:status → Redux agentStatusUpdated → Agent status updated')
  it('API fetchAgents() → Redux merges (doesn't replace) → No duplicates')
  it('Reconnect → API sync → Redux backfills missed agents')

  // 6-10. Edge cases
  it('Out-of-order messages → Redux sorts by sequence number')
  it('Duplicate message UUIDs → Redux deduplicates → Only one copy stored')
  it('Gap in sequence → Redux triggers fetchMessagesSince()')
  it('Backend error → Redux error state → UI shows error')
  it('Optimistic updates → Redux reverts on API failure')
})
```

**Success Criteria**:
- Redux always reflects backend state
- No stale data
- Gap detection works

**Estimated Time**: 5 hours

---

### Phase 3 Summary

| Component | Tests | Duration | Priority |
|-----------|-------|----------|----------|
| User Journeys | 8 | 8h | P1 |
| WebSocket Integration | 12 | 6h | P1 |
| Redux Sync | 10 | 5h | P1 |
| **Total** | **30** | **19h** | **HIGH** |

---

## PHASE 4: EDGE CASES & PERFORMANCE

**Duration**: 10 days
**Tests to Add**: 85 tests
**Coverage Gain**: +5%

### 4.1 Process Management Edge Cases

**File**: `backend/test/unit/infrastructure/process-manager.service.spec.ts` (expand existing)
**Priority**: P2 - MEDIUM
**Duration**: 6 hours
**Additional Tests**: 15

**Test List**:

```typescript
describe('ProcessManager Edge Cases', () => {
  // 1-5. Process lifecycle edge cases
  it('should handle process exit before kill() called')
  it('should handle SIGKILL for process that ignores SIGTERM')
  it('should detect zombie processes')
  it('should clean up file descriptors on process exit')
  it('should handle process that spawns child processes')

  // 6-10. Stream handling
  it('should handle stdout that closes before process exits')
  it('should handle stderr with invalid UTF-8')
  it('should handle very large output (>10MB)')
  it('should handle process that writes nothing')
  it('should handle backpressure from slow consumers')

  // 11-15. Error conditions
  it('should handle spawn failure (command not found)')
  it('should handle permission denied on executable')
  it('should handle working directory not found')
  it('should handle maximum process limit reached')
  it('should timeout if process hangs')
})
```

**Estimated Time**: 6 hours

---

### 4.2 Message Deduplication & Ordering

**File**: `backend/test/integration/message-deduplication.integration.spec.ts`
**Priority**: P2 - MEDIUM
**Duration**: 4 hours
**Tests**: 15

**Test List**:

```typescript
describe('Message Deduplication & Ordering', () => {
  describe('UUID Deduplication', () => {
    // 1-5. Duplicate detection
    it('should reject duplicate message with same UUID')
    it('should allow messages with different UUIDs')
    it('should deduplicate across WebSocket and API paths')
    it('should handle UUID collision gracefully')
    it('should maintain deduplication across reconnects')
  })

  describe('Sequence Number Ordering', () => {
    // 6-10. Ordering guarantees
    it('should assign monotonically increasing sequence numbers')
    it('should handle concurrent message saves (atomic sequence)')
    it('should detect gaps in sequence (missing 3 between 2 and 4)')
    it('should backfill gaps via API')
    it('should maintain order even with out-of-order WebSocket delivery')
  })

  describe('Edge Cases', () => {
    // 11-15. Boundary conditions
    it('should handle 1000+ messages for single agent')
    it('should handle message with sequence number 0')
    it('should handle negative sequence numbers')
    it('should handle sequence number overflow (unlikely but possible)')
    it('should handle temporary messages (sequence = -1)')
  })
})
```

**Estimated Time**: 4 hours

---

### 4.3 Performance Tests

**File**: `backend/test/performance/query-performance.spec.ts`
**Priority**: P2 - MEDIUM
**Duration**: 8 hours
**Tests**: 20

**Test List**:

```typescript
describe('Query Performance', () => {
  describe('Agent Queries', () => {
    // 1-5. Agent lookup performance
    it('should query agent by ID in <5ms (with index)')
    it('should query all agents in <20ms (1000 agents)')
    it('should query by status in <10ms (with index)')
    it('should query by type in <10ms (with index)')
    it('should handle 100 concurrent agent lookups')
  })

  describe('Message Queries', () => {
    // 6-10. Message lookup performance
    it('should query messages for agent in <50ms (10,000 messages)')
    it('should query with pagination in <20ms')
    it('should query since sequence in <30ms')
    it('should handle 50 concurrent message queries')
    it('should use index for agent_id lookups (verify EXPLAIN)')
  })

  describe('Write Performance', () => {
    // 11-15. Insert performance
    it('should insert agent in <10ms')
    it('should insert message in <5ms (with atomic sequence)')
    it('should handle 100 concurrent message inserts without deadlock')
    it('should handle 1000 messages in <2s (batch)')
    it('should maintain sequence atomicity under load')
  })

  describe('Memory Usage', () => {
    // 16-20. Resource usage
    it('should not leak memory with 1000 agent launches')
    it('should not leak file descriptors')
    it('should not accumulate timers/intervals')
    it('should limit in-memory message cache size')
    it('should garbage collect completed agent data')
  })
})
```

**Success Criteria**:
- All performance thresholds met
- No memory leaks
- System handles production load

**Estimated Time**: 8 hours

---

### 4.4 Error Propagation & Recovery

**File**: `backend/test/integration/error-propagation.integration.spec.ts`
**Priority**: P2 - MEDIUM
**Duration**: 6 hours
**Tests**: 15

**Test List**:

```typescript
describe('Error Propagation & Recovery', () => {
  describe('Database Errors', () => {
    // 1-3. DB failure handling
    it('should handle database locked (SQLITE_BUSY)')
    it('should retry on transient database errors')
    it('should fail gracefully on corrupt database')
  })

  describe('Process Errors', () => {
    // 4-6. CLI process failures
    it('should handle CLI crash during execution')
    it('should handle CLI non-zero exit code')
    it('should handle CLI timeout')
  })

  describe('WebSocket Errors', () => {
    // 7-9. Socket errors
    it('should handle client disconnect during message emission')
    it('should handle emit to disconnected client')
    it('should handle malformed event data')
  })

  describe('Cascading Failures', () => {
    // 10-12. Multiple failures
    it('should isolate agent failures (one failure doesn't crash system)')
    it('should continue serving other agents when one fails')
    it('should recover from temporary infrastructure failures')
  })

  describe('Error Recovery', () => {
    // 13-15. System resilience
    it('should allow new agent launch after previous failure')
    it('should restore state after reconnection')
    it('should clear error state after successful operation')
  })
})
```

**Estimated Time**: 6 hours

---

### 4.5 Frontend State Management Edge Cases

**File**: `frontend/test/integration/state-edge-cases.spec.ts`
**Priority**: P2 - MEDIUM
**Duration**: 5 hours
**Tests**: 10

**Test List**:

```typescript
describe('Frontend State Edge Cases', () => {
  describe('Connection Edge Cases', () => {
    // 1-3. Network scenarios
    it('should handle disconnect during agent launch')
    it('should handle disconnect with pending actions')
    it('should handle rapid connect/disconnect cycles')
  })

  describe('Message Edge Cases', () => {
    // 4-7. Message handling
    it('should handle messages arriving before subscription confirmed')
    it('should handle very large messages (>1MB)')
    it('should handle messages with special characters/emojis')
    it('should handle malformed message JSON')
  })

  describe('Redux Edge Cases', () => {
    // 8-10. State consistency
    it('should handle concurrent state updates')
    it('should handle reducer errors gracefully')
    it('should maintain state across hot module reload')
  })
})
```

**Estimated Time**: 5 hours

---

### 4.6 Negative Tests (Constraint Violations)

**File**: `backend/test/integration/negative-tests.integration.spec.ts`
**Priority**: P2 - MEDIUM
**Duration**: 6 hours
**Tests**: 15

**Test List**:

```typescript
describe('Negative Tests (System Must Reject Invalid Input)', () => {
  describe('Validation Boundaries', () => {
    // 1-5. Input validation
    it('should reject prompt with 0 characters')
    it('should reject prompt over 50KB')
    it('should reject invalid agent type')
    it('should reject malformed configuration JSON')
    it('should reject special characters in agent ID')
  })

  describe('State Transition Violations', () => {
    // 6-10. Invalid state changes
    it('should reject COMPLETED → RUNNING transition')
    it('should reject TERMINATED → RUNNING transition')
    it('should reject multiple start() calls')
    it('should reject operations on deleted agent')
    it('should reject negative sequence numbers')
  })

  describe('Resource Limit Violations', () => {
    // 11-15. System limits
    it('should reject launching >100 concurrent agents')
    it('should reject message rate >1000/second per agent')
    it('should reject database file >1GB')
    it('should reject connection from >1000 WebSocket clients')
    it('should handle out-of-memory gracefully')
  })
})
```

**Estimated Time**: 6 hours

---

### Phase 4 Summary

| Component | Tests | Duration | Priority |
|-----------|-------|----------|----------|
| Process Edge Cases | 15 | 6h | P2 |
| Message Deduplication | 15 | 4h | P2 |
| Performance Tests | 20 | 8h | P2 |
| Error Propagation | 15 | 6h | P2 |
| Frontend Edge Cases | 10 | 5h | P2 |
| Negative Tests | 15 | 6h | P2 |
| **Total** | **90** | **35h** | **MEDIUM** |

---

## SUPPORTING INFRASTRUCTURE

### Test Helpers Library

**File**: `backend/test/helpers/database-helpers.ts`
**Duration**: 4 hours

**Functions Needed**:

```typescript
/**
 * Create test agent in database
 */
export async function createTestAgent(
  db: DatabaseService,
  overrides?: Partial<CreateAgentData>
): Promise<Agent> {
  const agent = Agent.create({
    type: AgentType.SYNTHETIC,
    prompt: 'Test agent',
    configuration: {},
    ...overrides
  })

  const repo = new SqliteAgentRepository(db)
  await repo.save(agent)

  return agent
}

/**
 * Create test messages for agent
 */
export async function createTestMessages(
  db: DatabaseService,
  agentId: string,
  count: number
): Promise<AgentMessage[]> {
  const service = new AgentMessageService(db)
  const messages: AgentMessage[] = []

  for (let i = 0; i < count; i++) {
    const msg = await service.saveMessage({
      agentId,
      type: 'assistant',
      content: `Test message ${i + 1}`
    })
    messages.push(msg)
  }

  return messages
}

/**
 * Clean entire database
 */
export function cleanDatabase(db: DatabaseService): void {
  const database = db.getDatabase()
  database.exec('DELETE FROM agent_messages')
  database.exec('DELETE FROM agents')
}

/**
 * Verify FK constraints enabled
 */
export function assertForeignKeysEnabled(db: DatabaseService): void {
  const fk = db.getDatabase().pragma('foreign_keys', { simple: true })
  if (fk !== 1) {
    throw new Error('Foreign keys are NOT enabled! Tests will give false confidence.')
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now()

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`)
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/**
 * Wait for messages to arrive
 */
export async function waitForMessages(
  messages: AgentMessage[],
  expectedCount: number,
  timeout: number = 5000
): Promise<void> {
  await waitFor(() => messages.length >= expectedCount, timeout)
}
```

---

### Mock Factory

**File**: `backend/test/mocks/agent-runner.mock.ts`
**Duration**: 2 hours

```typescript
export function createMockAgentRunner(
  options?: {
    mockAgent?: Agent
    shouldFail?: boolean
    delay?: number
  }
): jest.Mocked<IAgentRunner> {
  const mockAgent = options?.mockAgent || Agent.create({
    type: AgentType.SYNTHETIC,
    prompt: 'Mock agent',
    configuration: {}
  })

  return {
    start: jest.fn().mockImplementation(async () => {
      if (options?.shouldFail) {
        throw new Error('Mock agent failed to start')
      }
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      return mockAgent
    }),
    stop: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockResolvedValue(AgentStatus.RUNNING),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  }
}
```

---

### Test Fixtures

**Structure**:
```
backend/test/fixtures/
├── claude-code/
│   ├── simple-response.jsonl           (3 messages)
│   ├── tool-use.jsonl                  (10 messages with tool calls)
│   ├── error.jsonl                     (error response)
│   ├── long-response.jsonl             (100+ messages)
│   └── multi-turn.jsonl                (conversation)
│
├── gemini-cli/
│   ├── simple-response.json
│   ├── error.json
│   └── streaming.json
│
├── websocket/
│   ├── agent-created-event.json
│   ├── agent-message-event.json
│   ├── agent-status-event.json
│   └── agent-complete-event.json
│
└── database/
    ├── sample-agents.sql
    └── sample-messages.sql
```

**Duration**: 3 hours to create comprehensive fixtures

---

## COMPLETE TEST INVENTORY

### Summary by Phase

| Phase | Tests | Duration | Priority | Deliverable |
|-------|-------|----------|----------|-------------|
| **Phase 1** | 47 | 9h | CRITICAL | Infrastructure Coverage |
| **Phase 2** | 65 | 18h | HIGH | Contract Verification |
| **Phase 3** | 30 | 19h | HIGH | Full-Stack E2E |
| **Phase 4** | 90 | 35h | MEDIUM | Edge Cases & Performance |
| **Helpers** | - | 9h | HIGH | Test Infrastructure |
| **TOTAL** | **232** | **90h** | - | **Complete Coverage** |

### Total Test Count After Implementation

- **Current**: 444 tests (370 backend + 74 frontend)
- **Adding**: 232 tests
- **Final**: **676 tests** across all layers

### Expected Coverage After Implementation

| Layer | Current | Target | Gain |
|-------|---------|--------|------|
| Domain | 100% | 100% | - |
| Application | 85% | 95% | +10% |
| Infrastructure | 72% | 95% | +23% |
| Presentation | 60% | 90% | +30% |
| Frontend | 80% | 95% | +15% |
| **Overall** | **80%** | **95%** | **+15%** |

---

## Implementation Strategy for AI Agents

### Week-by-Week Breakdown

**Week 1: Critical Foundation**
- Days 1-2: Phase 1 (Infrastructure gaps)
- Days 3-4: Start Phase 2 (Contract tests)
- Day 5: Test helpers library
- **Deliverable**: All critical components tested

**Week 2: Contracts & Boundaries**
- Days 1-3: Complete Phase 2 (All contract tests)
- Days 4-5: Start Phase 3 (E2E setup)
- **Deliverable**: All layer boundaries verified

**Week 3: End-to-End Verification**
- Days 1-3: Complete Phase 3 (Full-stack E2E)
- Days 4-5: Start Phase 4 (Edge cases)
- **Deliverable**: Complete user journeys tested

**Week 4-5: Edge Cases & Polish**
- Week 4: Complete Phase 4
- Week 5: Performance tests, negative tests
- **Deliverable**: Production-ready test suite

### Parallel Execution Strategy

Some test suites can be implemented in parallel by different AI agents:

**Track A** (Backend focused):
- Phase 1.1, 1.2, 1.3
- Phase 2.1, 2.4
- Phase 4.1, 4.2, 4.4, 4.6

**Track B** (Frontend/Integration focused):
- Phase 2.2, 2.3
- Phase 3.1, 3.2, 3.3
- Phase 4.5

**Track C** (Infrastructure):
- Test helpers
- Fixtures
- Mock factory

**Recommended**: Run Tracks A + B in parallel, Track C as needed.

---

## Success Criteria

### For Each Phase

**Phase 1**:
- [ ] All 47 tests pass
- [ ] Infrastructure components have 95%+ coverage
- [ ] FK constraint enablement verified
- [ ] Logger failures don't crash system

**Phase 2**:
- [ ] All 65 contract tests pass
- [ ] Every adapter verified for contract compliance
- [ ] Frontend-backend schema matches
- [ ] Database constraints verified

**Phase 3**:
- [ ] All 30 E2E tests pass
- [ ] Complete user journeys work
- [ ] WebSocket message flow verified
- [ ] Redux state always consistent

**Phase 4**:
- [ ] All 90 edge case tests pass
- [ ] Performance thresholds met
- [ ] Error recovery verified
- [ ] No resource leaks

### Overall Success

**Quantitative**:
- [ ] 676+ total tests
- [ ] 95%+ coverage
- [ ] <2s average test execution (unit)
- [ ] Zero flaky tests
- [ ] All tests pass on first run

**Qualitative**:
- [ ] AI agents can autonomously develop features
- [ ] Tests catch architectural bugs immediately
- [ ] No manual testing required
- [ ] System is production-ready
- [ ] Tests document system behavior

---

## Cost-Benefit Analysis

### Investment
- **Time**: 90 hours (4-5 weeks)
- **Complexity**: High initial learning curve

### Returns
- **Per Feature**: 80% faster development (tests guide implementation)
- **Per Bug**: 90% faster debugging (tests pinpoint issue)
- **Per Refactor**: 95% confidence (tests prevent regressions)
- **Architecture Changes**: Can be done safely

**Break-Even Point**: After ~2-3 features
**ROI After 6 Months**: 10x productivity gain for AI agents

---

## Risk Mitigation

### Risk #1: "Too Many Tests to Maintain"

**Mitigation**:
- Tests are self-documenting
- Tests prevent bugs that are expensive to fix
- AI agents can update tests automatically

### Risk #2: "Tests Slow Down Development"

**Mitigation**:
- Fast unit tests run continuously (TDD)
- Integration/E2E run pre-commit
- Performance tests run nightly

### Risk #3: "Tests Become Outdated"

**Mitigation**:
- Tests fail when outdated (forcing updates)
- Contract tests catch breaking changes
- Coverage requirements prevent blind spots

---

## Appendix: Test File Checklist

### Every Test File Must Have

```typescript
/**
 * [Component Name] Tests
 *
 * Purpose: [What aspect of the system this tests]
 * Layer: [Domain/Application/Infrastructure/Presentation]
 * Type: [Unit/Integration/Contract/E2E]
 *
 * Coverage: [What this tests]
 * Dependencies: [What real dependencies it uses]
 * Mocks: [What it mocks and why]
 */

describe('[ComponentName]', () => {
  // Setup
  let component: ComponentType

  beforeEach(() => {
    // Clean setup before each test
  })

  afterEach(() => {
    // Clean up resources
  })

  // Tests organized by feature/behavior
  describe('[Feature/Behavior]', () => {
    it('[should do X when Y]', () => {
      // Arrange
      // Act
      // Assert
    })
  })
})
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-23
**Status**: Implementation Plan - Ready for Execution
**Next Steps**: Begin Phase 1 implementation
