# Architecture Audit: Foreign Key Constraint Violations

## Executive Summary

**Critical Bug**: Foreign key constraint violations occurring in production but not caught by tests.

**Root Cause**: Fundamental architectural flaw in agent lifecycle contract.

**Impact**: Messages fail to persist, user experience degraded, data integrity compromised.

---

## The Bug

### User Report
```
[WebSocketMiddleware] Agent 685cf0c5-6935-4f4d-8fed-4efe5a49c115 error:
  {message: 'Message persistence failed: FOREIGN KEY constraint failed', name: 'SqliteError'}
```

### What's Happening
1. Agent launches successfully
2. Messages start emitting
3. Message persistence fails with FK constraint error
4. Agent appears to work but data is lost

---

## Root Cause Analysis

### The Architectural Flaw

The `IAgentRunner.start()` contract has a fundamental design flaw:

```typescript
interface IAgentRunner {
  start(session: Session): Promise<Agent>;  // ⚠️ CREATES new agent!
}
```

### The Broken Flow

**What ACTUALLY Happens:**

```
1. AgentOrchestrationService.launchAgent()
   ├─ Creates Agent #1 (ID: abc-123)
   │  └─ Agent.create() → generates random UUID
   │
   ├─ Saves Agent #1 to database
   │  └─ agentRepository.save(agent) → DB now has ID=abc-123
   │
   ├─ Calls runner.start(agent.session)
   │  └─ Runner creates Agent #2 (ID: xyz-789)  // ⚠️ NEW AGENT!
   │     └─ Agent.create() → generates DIFFERENT random UUID
   │
   ├─ Returns Agent #2 (ID: xyz-789)
   │  └─ This is the agent the caller gets
   │
   └─ Messages emit with agent_id=xyz-789
      └─ FK constraint fails (xyz-789 not in DB!)
```

### The Evidence

**File**: `agent-orchestration.service.ts:63-74`
```typescript
// Line 54-58: Create agent
const agent = Agent.create({...});  // ID = abc-123

// Line 66: Save to DB
await this.agentRepository.save(agent);  // DB has abc-123

// Line 69: Start runner
const startedAgent = await runner.start(agent.session);  // Returns xyz-789!

// Line 74: Return DIFFERENT agent
return startedAgent;  // xyz-789 (NOT in DB!)
```

**File**: `claude-python-proxy.adapter.ts:61-67`
```typescript
async start(session: Session): Promise<Agent> {
  // Create agent entity
  const agent = Agent.create({  // ⚠️ Generates NEW random ID!
    type: AgentType.CLAUDE_CODE,
    prompt: session.prompt,
    configuration: session.configuration,
  });
  // ...
  return agent;  // Returns agent with DIFFERENT ID than orchestration created
}
```

---

## Why Tests Didn't Catch This

### 1. Unit Tests Use Mocks (No Real FK Constraints)

**File**: `agent-orchestration.service.spec.ts:32-40`
```typescript
mockAgentRepository = {
  save: jest.fn(),  // ⚠️ Mock doesn't enforce FK!
  findById: jest.fn(),
  // ...
};
```

**Problem**: Mocked repository accepts any save() call without validation.

### 2. Tests Don't Verify ID Consistency

**File**: `agent-orchestration.service.spec.ts:73`
```typescript
expect(mockAgentRepository.save).toHaveBeenCalledTimes(1);  // ✓ Called
// ❌ But doesn't check WHICH agent was saved!
// ❌ Doesn't verify saved.id === returned.id
```

### 3. No Integration Test for Full Launch Flow

**Gap**: No test that:
1. Launches real agent through orchestration service
2. Uses real database with FK constraints enabled
3. Verifies messages can be saved with returned agent ID
4. Checks agent ID consistency throughout flow

### 4. Integration Tests Use In-Memory Repository

**Example**: E2E tests configure in-memory repo:
```typescript
providers: [
  { provide: 'REPOSITORY_TYPE', useValue: 'memory' }
]
```

**Problem**: In-memory repo has no FK constraints!

---

## Architectural Problems

### Problem 1: Two Sources of Agent Identity

```
AgentOrchestrationService creates Agent  →  ID from Agent.create()
                  ↓
AgentRunner.start() creates Agent        →  ID from Agent.create()  // DIFFERENT!
```

**Violation**: Single Responsibility Principle - who owns agent creation?

### Problem 2: Broken Contract

**Interface says**: "Start an agent with this session"
**Implementation does**: "Create a new agent and start it"

This violates Interface Segregation Principle and Liskov Substitution Principle.

### Problem 3: State Synchronization Gap

```
Database has:     Agent(id=abc-123, status=initializing)
Runtime has:      Agent(id=xyz-789, status=running)
Messages use:     agent_id=xyz-789  → FK VIOLATION!
```

---

## Why This Wasn't Caught: Testing Anti-Patterns

### Anti-Pattern #1: Over-Mocking

**Problem**: Unit tests mock the repository, hiding FK constraints.

**TDD Principle Violated**: "Don't mock what you don't own"
- We own the repository
- We should test it with real database
- FK constraints are critical business logic

### Anti-Pattern #2: Missing Contract Tests

**Problem**: No test verifies the contract between layers.

**Missing Test**: "Agent returned by runner must be saveable to repository"

### Anti-Pattern #3: Integration Tests That Don't Integrate

**Problem**: Integration tests use in-memory implementations that skip critical constraints.

**TDD Principle Violated**: "Integration tests must use real adapters"

### Anti-Pattern #4: Testing Implementation, Not Behavior

**Example**: Tests verify `save()` was called (implementation detail)
**Should Test**: Agent can receive messages after launch (behavior)

---

## The Correct Architecture

### Option A: Runner Doesn't Create Agents

**Contract**:
```typescript
interface IAgentRunner {
  start(agent: Agent): Promise<void>;  // Accept agent, don't create it
  // or
  start(agentId: AgentId, session: Session): Promise<void>;
}
```

**Flow**:
```
1. Orchestration creates agent (ID=abc)
2. Orchestration saves agent to DB
3. Orchestration calls runner.start(agent)  // Passes the agent
4. Runner uses the SAME agent
5. Messages reference ID=abc (exists in DB!)
```

### Option B: Orchestration Saves Returned Agent

**Contract**: Keep current interface
**Flow**:
```
1. Orchestration calls runner.start(session)
2. Runner creates and returns agent (ID=xyz)
3. Orchestration saves returned agent to DB
4. Messages reference ID=xyz (now in DB!)
```

**Problem with Option B**: Orchestration can't validate agent before start.

### Option C: Two-Phase Initialization

**Contract**:
```typescript
interface IAgentRunner {
  prepare(session: Session): Agent;  // Create agent, don't start
  start(agentId: AgentId): Promise<void>;  // Start pre-existing agent
}
```

---

## Required Test Coverage

### Level 1: Database Layer (MISSING!)

```typescript
describe('agent_messages FK constraint', () => {
  it('should reject message insert for non-existent agent', () => {
    // Real database with FK enabled
    expect(() => {
      db.exec(`INSERT INTO agent_messages (agent_id, ...) VALUES ('fake-id', ...)`);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});
```

### Level 2: Repository Layer (MISSING!)

```typescript
describe('AgentMessageService with real DB', () => {
  it('should fail to save message for non-existent agent', async () => {
    // Real DB, no agent saved
    await expect(
      messageService.saveMessage({ agentId: 'fake-id', ... })
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
```

### Level 3: Integration Layer (MISSING!)

```typescript
describe('Agent launch → message save integration', () => {
  it('should allow messages to save after agent launch', async () => {
    // Real database with FK constraints
    const agent = await orchestrationService.launchAgent(dto);

    // This should NOT fail
    await messageService.saveMessage({
      agentId: agent.id.toString(),  // ⚠️ Currently fails!
      content: 'Test message',
    });
  });
});
```

### Level 4: Contract Test (MISSING!)

```typescript
describe('IAgentRunner contract', () => {
  it('returned agent ID must match saved agent ID', async () => {
    const originalAgent = Agent.create({...});
    await repository.save(originalAgent);

    const returnedAgent = await runner.start(originalAgent.session);

    // CRITICAL: IDs must match!
    expect(returnedAgent.id.toString()).toBe(originalAgent.id.toString());
  });
});
```

---

## Test Strategy Failures

### Failure #1: No Boundary Testing

**Missing**: Tests at system boundaries where contracts meet.

**Should Have**: Tests verifying orchestration ↔ runner ↔ repository consistency.

### Failure #2: Mock Overuse in Critical Paths

**Current**: Repository mocked in orchestration tests.

**Should Be**: Real repository for integration tests, especially for data integrity.

### Failure #3: No Cross-Layer Validation

**Missing**: Tests that verify end-to-end data flow:
```
HTTP Request → Controller → Orchestration → Runner → Repository → Database
```

### Failure #4: No Negative Testing at Integration Level

**Missing**: Tests that intentionally violate constraints to verify they fail correctly.

---

## Recommended Fixes

### Immediate Fix: Option B (Save Returned Agent)

**Why**: Minimal changes, maintains current interface.

**Change**: `agent-orchestration.service.ts:66-74`
```typescript
// OLD (broken):
await this.agentRepository.save(agent);  // Save wrong agent
const startedAgent = await runner.start(agent.session);
return startedAgent;  // Return different agent

// NEW (correct):
const startedAgent = await runner.start(agent.session);
await this.agentRepository.save(startedAgent);  // Save correct agent
this.runnerStorage.set(startedAgent.id.toString(), runner);
return startedAgent;
```

### Long-Term Fix: Option A (Refactor Contract)

**Why**: Proper separation of concerns, clearer responsibilities.

**Change**: Runner accepts agent instead of creating it.

**Requires**: Refactoring all adapters (claude-code, claude-sdk, claude-python-proxy, gemini).

---

## Required Test Suite

### Test #1: FK Constraint at Database Level
```typescript
✅ NEW: test/integration/database-fk-constraints.spec.ts
- Verify FK is enabled
- Verify FK violations are rejected
- Uses real SQLite database
```

### Test #2: Agent-Message Referential Integrity
```typescript
✅ NEW: test/integration/agent-message-integrity.spec.ts
- Launch agent via orchestration
- Verify returned agent exists in DB
- Verify messages can save with returned agent ID
- Uses real database and services
```

### Test #3: Runner Contract Compliance
```typescript
✅ NEW: test/integration/runner-contract-compliance.spec.ts
- For each adapter:
  - Verify returned agent can be saved
  - Verify returned agent can receive messages
  - Uses real database
```

---

## TDD Lessons Learned

### Lesson #1: Test Boundaries, Not Implementations

**Wrong**: "Repository.save() was called"
**Right**: "Saved agent can receive messages"

### Lesson #2: Integration Tests Must Integrate

**Wrong**: Mock database in integration tests
**Right**: Use real database with real constraints

### Lesson #3: Test Contracts, Not Units

**Wrong**: Test each class in isolation with mocks
**Right**: Test class contracts with real collaborators

### Lesson #4: Negative Tests Are Critical

**Wrong**: Only test happy paths
**Right**: Test constraint violations to verify they fail correctly

---

## Action Plan

1. **Immediate** (5 min): Apply Option B fix to orchestration service
2. **Short-term** (30 min): Add 3 integration test suites above
3. **Medium-term** (2 hr): Refactor to Option A (proper contract)
4. **Long-term** (4 hr): Audit all layer boundaries for similar issues

---

## Questions This Audit Answers

**Q: Why haven't we caught this when testing the database module to begin with?**

**A**: Because we didn't test the database module properly!
- No test verifying FK constraints work
- No test trying to violate FK to verify it fails
- Schema is correct, but never validated in tests

**Q: What's gone wrong in our testing approach?**

**A**: Four fundamental failures:
1. **Over-reliance on mocks** - Hid real constraints
2. **Missing boundary tests** - Didn't test layer interactions
3. **Testing implementation over behavior** - Checked "save called" not "messages persist"
4. **No negative testing** - Never tried to violate constraints

**Q: How do we prevent this?**

**A**: Follow the test strategy in "Required Test Suite" section:
- Test with real database for integration tests
- Test contract compliance between layers
- Test boundary conditions and constraint violations
- Test end-to-end behavior, not implementation details

---

**Created**: 2025-11-23
**Priority**: CRITICAL
**Status**: Root cause identified, fix ready to implement
