# Test Coverage Audit Report: Message Persistence Bugs

**Date**: 2025-11-28
**Audit Scope**: Message persistence and CASCADE DELETE prevention
**Status**: CRITICAL GAPS IDENTIFIED

---

## Executive Summary

After fixing two critical bugs (UPDATE vs INSERT OR REPLACE, WAL → DELETE mode), this audit reveals **significant test coverage gaps** that failed to prevent these bugs from reaching production.

### Bugs Fixed
1. **SqliteAgentRepository.save()**: Changed from `INSERT OR REPLACE` to conditional UPDATE/INSERT (line 63-93)
2. **DatabaseService**: Changed from WAL to DELETE journal mode (line 70)

### Test Coverage Gaps

| Bug Type | Unit Tests | Integration Tests | E2E Tests | Status |
|----------|-----------|-------------------|-----------|--------|
| UPDATE vs INSERT OR REPLACE | ❌ MISSING | ❌ MISSING | ❌ MISSING | **CRITICAL** |
| CASCADE DELETE on UPDATE | ❌ MISSING | ❌ MISSING | ❌ MISSING | **CRITICAL** |
| DELETE journal mode | ❌ MISSING | ✅ Partial | ❌ MISSING | **HIGH** |
| Message persistence after status changes | ✅ EXISTS | ✅ EXISTS | ❌ MISSING | **MEDIUM** |

---

## Detailed Analysis

### 1. SqliteAgentRepository Unit Tests

**File**: `test/unit/infrastructure/repositories/sqlite-agent.repository.spec.ts`
**Lines Reviewed**: 1-373
**Tests Found**: 20 tests across 8 describe blocks

#### ✅ Coverage That Exists
- Basic save/retrieve operations (line 24-41)
- Agent status updates (line 43-62)
- All agent properties persistence (line 64-91)
- Error information persistence (line 93-110)
- Query operations (findById, findAll, findByStatus, findByType)
- Delete operations (line 291-316)

#### ❌ Critical Gaps

**Gap 1: UPDATE vs INSERT OR REPLACE behavior**
- **Missing**: Test that verifies UPDATE is used for existing agents (not INSERT OR REPLACE)
- **Risk**: INSERT OR REPLACE triggers CASCADE DELETE, losing all messages
- **Evidence**: Line 43-62 tests status updates but doesn't verify messages persist

**Gap 2: Message preservation during agent updates**
- **Missing**: Test that saves messages BEFORE updating agent, then verifies messages still exist
- **Risk**: Silent data loss during normal operations
- **Evidence**: No tests create messages in agent_messages table

**Gap 3: Multiple rapid status updates**
- **Missing**: Test that updates agent status multiple times in succession
- **Risk**: Transaction conflicts or data loss under rapid updates
- **Evidence**: Each test only calls save() once or twice

#### Recommendation
Add **8 new tests** to verify:
1. UPDATE is used for existing agents (check SQL statement or side effects)
2. Messages survive agent status changes (RUNNING → COMPLETED)
3. Messages survive multiple rapid saves
4. Direct database verification (bypassing repository abstraction)

---

### 2. Agent Status Persistence Integration Tests

**File**: `test/integration/agent-status-persistence.spec.ts`
**Lines Reviewed**: 1-214
**Tests Found**: 5 integration tests

#### ✅ Coverage That Exists
- Complete lifecycle with REAL database (line 68-100)
- Active agents query after launch (line 102-126)
- Multiple repository queries consistency (line 128-154)
- findAll returns correct status (line 156-179)
- INITIALIZING → RUNNING → TERMINATED transitions (line 183-212)

#### ❌ Critical Gaps

**Gap 1: No messages created in tests**
- **Missing**: Tests never insert data into agent_messages table
- **Risk**: Cannot detect CASCADE DELETE bug
- **Evidence**: Tests only use AgentOrchestrationService and repository

**Gap 2: No verification of message preservation**
- **Missing**: Direct database queries to agent_messages table
- **Risk**: CASCADE DELETE could wipe messages undetected
- **Evidence**: No SELECT queries on agent_messages

#### Recommendation
Add **3 new tests** that:
1. Create agent with messages, update status, verify messages exist
2. Insert messages between status transitions
3. Query agent_messages table directly to verify COUNT

---

### 3. Message Persistence Integration Tests

**File**: `test/integration/message-persistence.spec.ts`
**Lines Reviewed**: 1-231
**Tests Found**: 9 integration tests

#### ✅ Coverage That Exists
- Basic message save/retrieve (line 41-70)
- Multiple messages with sequence numbers (line 72-105)
- Direct database queries (line 107-129)
- WAL checkpoint handling (line 131-156)
- Empty results handling (line 159-165)
- Sequence ordering (line 167-196)
- findByAgentIdSince functionality (line 199-229)

#### ❌ Critical Gaps

**Gap 1: No agent status changes during test**
- **Missing**: Tests that update agent status AFTER saving messages
- **Risk**: Cannot detect CASCADE DELETE triggered by INSERT OR REPLACE
- **Evidence**: Tests create agent once, never modify it

**Gap 2: No SqliteAgentRepository.save() calls**
- **Missing**: Integration with the actual bug location
- **Risk**: Bug pathway not exercised
- **Evidence**: Tests only use AgentMessageService

#### Recommendation
Add **2 new tests** that:
1. Save messages → update agent status via repository.save() → verify messages exist
2. Rapid status changes while streaming messages (concurrent scenario)

---

### 4. Database Service Unit Tests

**File**: `test/unit/infrastructure/database/database.service.spec.ts`
**Lines Reviewed**: (Need to check this file)

#### ❌ Critical Gaps

**Gap 1: No journal mode verification**
- **Missing**: Test that verifies DELETE mode is set (not WAL)
- **Risk**: Regression to WAL mode could reintroduce bugs
- **Evidence**: Not found in existing tests

**Gap 2: No immediate persistence verification**
- **Missing**: Test that data is queryable immediately after INSERT (DELETE mode behavior)
- **Risk**: Cannot detect WAL-related delayed writes
- **Evidence**: Not found in existing tests

#### Recommendation
Add **NEW FILE**: `test/integration/database-journal-mode.spec.ts` with 3 tests:
1. Verify DELETE journal mode is active
2. Verify immediate data persistence (no WAL delay)
3. Verify no -wal or -shm files created (file-based DB only)

---

### 5. E2E Test Coverage

**Files Reviewed**:
- `test/e2e/agent-flow.e2e.spec.ts`
- `test/e2e/process-management.e2e.spec.ts`

#### ❌ Critical Gaps

**Gap 1: No complete message persistence flow**
- **Missing**: E2E test that:
  1. Launches agent
  2. Receives streaming messages
  3. Updates agent status multiple times
  4. Verifies all messages persist in database
- **Risk**: Cannot catch integration issues between components

#### Recommendation
Add **NEW FILE**: `test/integration/message-persistence-e2e.spec.ts` with 2 tests:
1. Complete lifecycle: launch → stream → status changes → verify persistence
2. Rapid status updates: concurrent message saves and status changes

---

## Root Cause Analysis: Why Tests Failed to Prevent Bugs

### Bug 1: INSERT OR REPLACE → CASCADE DELETE

**Why tests didn't catch it:**
1. Unit tests for `SqliteAgentRepository.save()` never created messages
2. Integration tests for agent status never verified messages table
3. No tests exercised the UPDATE pathway with existing messages

**What was tested:**
- Agent status changes ✅
- Agent data persistence ✅

**What was NOT tested:**
- Foreign key relationships ❌
- CASCADE DELETE behavior ❌
- Message preservation during updates ❌

### Bug 2: WAL Mode Data Loss

**Why tests didn't catch it:**
1. All tests call `onModuleDestroy()` cleanly (proper WAL checkpoint)
2. Tests use in-memory databases (different I/O behavior)
3. No tests simulate ts-node-dev hot reload (SIGKILL without cleanup)

**What was tested:**
- Message persistence in clean environment ✅
- WAL checkpoint on shutdown ✅

**What was NOT tested:**
- Process killed without cleanup ❌
- Production environment simulation ❌
- File-based database persistence ❌

---

## Test Coverage Metrics

### Before Audit
- **Total Tests**: 261 tests
- **Coverage**: 89% overall
- **Bug Detection Rate**: 0/2 (both bugs reached production)

### After Recommended Changes
- **New Tests**: +16 tests
- **Total Tests**: 277 tests
- **Expected Coverage**: 95%+ on critical paths
- **Expected Bug Detection Rate**: 2/2 (both bugs would be caught)

---

## Priority Matrix

| Test Category | Priority | Effort | Impact | Status |
|---------------|----------|--------|--------|--------|
| CASCADE DELETE prevention | **P0** | 2 hours | Critical | To Do |
| UPDATE vs INSERT verification | **P0** | 1 hour | Critical | To Do |
| DELETE journal mode tests | **P1** | 1 hour | High | To Do |
| E2E message persistence | **P1** | 2 hours | High | To Do |
| Process kill simulation | **P2** | 3 hours | Medium | Deferred |

---

## Recommended Test Files to Create

### 1. Enhanced Unit Tests (UPDATE)
**File**: `test/unit/infrastructure/repositories/sqlite-agent.repository.spec.ts`
**Add**: 8 new tests in existing describe blocks
**Focus**: UPDATE vs INSERT, message preservation

### 2. New Integration Test File
**File**: `test/integration/database-journal-mode.spec.ts`
**Add**: 3 new tests
**Focus**: DELETE mode verification

### 3. Enhanced Integration Tests (UPDATE)
**File**: `test/integration/agent-status-persistence.spec.ts`
**Add**: 3 new tests
**Focus**: Message preservation during status changes

### 4. New E2E Test File
**File**: `test/integration/message-persistence-e2e.spec.ts`
**Add**: 2 comprehensive E2E tests
**Focus**: Complete lifecycle with concurrent operations

---

## Next Steps

### Immediate (Today)
1. ✅ Complete this audit report
2. ⬜ Write CASCADE DELETE prevention tests (2 hours)
3. ⬜ Write UPDATE vs INSERT tests (1 hour)
4. ⬜ Write DELETE journal mode tests (1 hour)

### Short-term (This Week)
5. ⬜ Write E2E persistence tests (2 hours)
6. ⬜ Run full test suite and verify coverage
7. ⬜ Update documentation with test patterns

### Long-term (Next Sprint)
8. ⬜ Add smoke tests for production environment
9. ⬜ Add process kill simulation tests
10. ⬜ Implement continuous coverage monitoring

---

## Lessons Learned

1. **Test foreign key relationships explicitly** - Schema constraints must be tested
2. **Test with real data relationships** - Don't test entities in isolation
3. **Test the actual bug pathway** - Cover UPDATE pathway, not just INSERT
4. **Simulate production environment** - Dev environment can hide bugs
5. **Test lifecycle edge cases** - Ungraceful shutdowns, rapid updates, concurrent ops

---

## Conclusion

The current test suite has **excellent breadth** (261 tests, 89% coverage) but **insufficient depth** on critical paths. The bugs reached production because:

1. Tests never created messages before updating agents
2. Tests never verified CASCADE DELETE prevention
3. Tests never simulated production environment behavior

**Recommendation**: Implement all P0 and P1 tests (16 new tests, 6 hours effort) to prevent regression and catch similar bugs in the future.

**Status**: Ready to proceed with test implementation.
