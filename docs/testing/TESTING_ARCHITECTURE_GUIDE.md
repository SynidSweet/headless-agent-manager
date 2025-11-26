# Testing Architecture & Methodology Guide

**For AI-Autonomous Development**

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [The Testing Constitution](#the-testing-constitution)
3. [Test Types & When to Use Each](#test-types--when-to-use-each)
4. [Layer-Specific Testing Rules](#layer-specific-testing-rules)
5. [Contract Testing](#contract-testing)
6. [The TDD Workflow](#the-tdd-workflow)
7. [Mocking Strategy](#mocking-strategy)
8. [Test Quality Checklist](#test-quality-checklist)
9. [Common Pitfalls](#common-pitfalls)
10. [Examples & Templates](#examples--templates)

---

## Philosophy

### Why Tests Matter for AI Agents

**In human-led projects**: Tests verify code correctness.

**In AI-agent-only projects**: Tests ARE the specification.

**Critical Insight**: AI agents will implement EXACTLY what tests describe. If tests are incomplete or test the wrong thing, agents will build incomplete or wrong systems.

### The Testing Pyramid for This Project

```
        E2E (5%)
    ─────────────────
      Integration (25%)
    ─────────────────────
        Unit (70%)
    ─────────────────────────
```

**But also add**:
```
    Contract Tests (horizontal layer)
    ═════════════════════════════════
```

Contract tests verify **boundaries between layers**, which is where integration bugs hide.

---

## The Testing Constitution

**These rules are ABSOLUTE for all AI agents:**

### Rule #1: Test First, Always
```
❌ NEVER write implementation code before writing a failing test
✅ ALWAYS follow Red → Green → Refactor
```

**Enforcement**: Pre-commit hook rejects commits without corresponding test changes.

### Rule #2: Test Behavior, Not Implementation
```
❌ BAD:  expect(mockRepository.save).toHaveBeenCalled()
✅ GOOD: const saved = await repository.findById(agent.id)
         expect(saved.id).toBe(agent.id)
```

**Why**: Implementation can change, behavior must remain stable.

### Rule #3: Test Boundaries with Real Collaborators
```
❌ BAD:  Mock repository in integration test
✅ GOOD: Use real SQLite database with real FK constraints
```

**Critical**: Foreign key violations, race conditions, and data integrity issues only appear with real databases.

### Rule #4: Every Layer Boundary Needs a Contract Test
```
When Layer A depends on Layer B:
✅ Write test verifying A → B contract
✅ Use real implementation of B (no mocks)
✅ Verify data flows correctly both ways
```

**Example**: Orchestration → Runner → Repository must have contract test.

### Rule #5: Negative Tests Are Mandatory
```
For every constraint:
✅ Test that it ALLOWS valid data
✅ Test that it REJECTS invalid data
```

**Example**: If FK constraint exists, test that violation is rejected.

### Rule #6: Integration Tests Use Real Infrastructure
```
❌ BAD:  Mock database in integration test
❌ BAD:  Mock WebSocket in streaming test
✅ GOOD: Use real SQLite database
✅ GOOD: Use real socket.io instance
```

**Why**: Mocks hide configuration issues, race conditions, and constraint violations.

### Rule #7: Performance is a Feature
```
✅ Test query execution time
✅ Test concurrent operations
✅ Test memory usage
✅ Test no resource leaks
```

**For AI agents**: Performance regressions should fail builds automatically.

### Rule #8: Tests Must Be Self-Contained
```
✅ Each test creates its own data
✅ Each test cleans up after itself
✅ Tests can run in any order
✅ Tests can run in parallel
```

**Why**: AI agents need deterministic, reproducible test results.

---

## Test Types & When to Use Each

### 1. Unit Tests (70% of tests)

**Purpose**: Test individual classes/functions in isolation

**When to use**:
- Domain entities and value objects
- Pure functions (parsers, validators)
- Business logic without external dependencies
- State machine transitions

**When NOT to use**:
- Testing database queries (use integration)
- Testing HTTP endpoints (use integration)
- Testing WebSocket (use integration)
- Testing process spawning (use integration)

**Mocking allowed**:
- ✅ External APIs (HTTP clients)
- ✅ File system operations
- ✅ Logger (optional)
- ❌ Your own repositories
- ❌ Your own domain services

**Example**:
```typescript
// test/unit/domain/entities/agent.entity.spec.ts
describe('Agent State Transitions', () => {
  it('should transition from INITIALIZING to RUNNING', () => {
    const agent = Agent.create({...})
    agent.markAsRunning()
    expect(agent.status).toBe(AgentStatus.RUNNING)
  })

  it('should reject COMPLETED → RUNNING transition', () => {
    const agent = Agent.create({...})
    agent.markAsRunning()
    agent.markAsCompleted()

    expect(() => agent.markAsRunning())
      .toThrow('Agent must be initializing to start')
  })
})
```

### 2. Integration Tests (25% of tests)

**Purpose**: Test multiple components working together with real infrastructure

**When to use**:
- Repository + Database
- Service + Repository + Database
- Adapter + External Service
- Multiple services coordinating

**When NOT to use**:
- Testing single class (use unit)
- Testing full HTTP → DB flow (use E2E)

**Mocking allowed**:
- ✅ External APIs (if testing isn't the integration point)
- ❌ Database
- ❌ File system (for file-based operations)
- ❌ WebSocket (for streaming tests)

**Requirements**:
- ✅ Use real database (SQLite in-memory for speed)
- ✅ Clean database between tests
- ✅ Test with real constraints (FK, UNIQUE, etc.)
- ✅ Test race conditions
- ✅ Test error propagation

**Example**:
```typescript
// test/integration/agent-message-integrity.spec.ts
describe('Agent Launch → Message Persistence', () => {
  let db: DatabaseService // REAL database
  let messageService: AgentMessageService // REAL service
  let repository: SqliteAgentRepository // REAL repository

  beforeEach(() => {
    db.exec('DELETE FROM agent_messages')
    db.exec('DELETE FROM agents')
  })

  it('should save messages for launched agent (FK integrity)', async () => {
    // REAL orchestration, REAL database, REAL FK constraints
    const agent = await orchestrationService.launchAgent(dto)

    // This MUST NOT fail with FK constraint error
    const message = await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Test'
    })

    expect(message.agentId).toBe(agent.id.toString())
  })
})
```

### 3. Contract Tests (Horizontal Layer)

**Purpose**: Verify interfaces/contracts between layers are honored

**When to use**:
- When Layer A depends on Layer B via interface
- When implementing a port/adapter
- When data crosses layer boundaries

**What to test**:
- ✅ Interface compliance (implements all methods)
- ✅ Data transformation correctness
- ✅ Error propagation
- ✅ Null/undefined handling

**Example**:
```typescript
// test/contracts/agent-runner.contract.spec.ts
describe('IAgentRunner Contract', () => {
  const adapters = [
    ClaudePythonProxyAdapter,
    ClaudeSDKAdapter,
    SyntheticAgentAdapter
  ]

  adapters.forEach(AdapterClass => {
    describe(`${AdapterClass.name} implements IAgentRunner`, () => {
      it('returned agent ID must exist in database', async () => {
        const adapter = new AdapterClass(...)
        const agent = await adapter.start(session)

        // Contract: Returned agent must be saveable
        await expect(repository.save(agent)).resolves.not.toThrow()

        // Contract: Saved agent must be retrievable
        const saved = await repository.findById(agent.id)
        expect(saved.id).toBe(agent.id)
      })
    })
  })
})
```

### 4. E2E Tests (5% of tests)

**Purpose**: Test complete user flows through entire system

**When to use**:
- Critical user journeys
- Cross-system integration
- Production deployment verification

**What to test**:
- ✅ HTTP → WebSocket → Database → CLI → Frontend
- ✅ Authentication flows
- ✅ Error handling across all layers
- ✅ Performance under load

**Requirements**:
- ✅ Use real HTTP server
- ✅ Use real WebSocket connection
- ✅ Use real database
- ✅ Use real CLI agents (or synthetic for speed)

**Example**:
```typescript
// test/e2e/agent-lifecycle.e2e.spec.ts
describe('Complete Agent Lifecycle (E2E)', () => {
  it('should handle full user flow: launch → messages → terminate', async () => {
    // 1. HTTP POST to launch agent
    const launchRes = await request(app).post('/api/agents').send({
      type: 'claude-code',
      prompt: 'Test prompt'
    })
    const agentId = launchRes.body.id

    // 2. WebSocket connection
    const socket = io('http://localhost:3000')
    socket.emit('subscribe', { agentId })

    // 3. Receive messages
    const messages = await new Promise(resolve => {
      const msgs = []
      socket.on('agent:message', msg => msgs.push(msg))
      socket.on('agent:complete', () => resolve(msgs))
    })

    expect(messages.length).toBeGreaterThan(0)

    // 4. Verify in database
    const dbMessages = await db.query('SELECT * FROM agent_messages WHERE agent_id = ?', agentId)
    expect(dbMessages).toEqual(messages)

    // 5. Terminate
    await request(app).delete(`/api/agents/${agentId}`).expect(204)
  })
})
```

### 5. Smoke Tests (Subset of E2E)

**Purpose**: Quick verification that critical paths work with REAL CLIs

**When to use**:
- Before deployment
- After major changes
- CI/CD pipeline

**Characteristics**:
- ✅ Use REAL Claude CLI
- ✅ Fast but thorough
- ✅ Test actual binary execution
- ⏱️ Longer timeout (60s)

**Example**: See `backend/test/e2e/smoke/README.md`

---

## Layer-Specific Testing Rules

### Domain Layer Testing

**What**: Entities, Value Objects, Domain Services

**Rules**:
- ✅ 100% coverage required (no exceptions)
- ✅ Test all state transitions
- ✅ Test all invariants
- ✅ Test all validation rules
- ❌ NO external dependencies
- ❌ NO mocks (pure domain logic)

**Template**:
```typescript
describe('EntityName', () => {
  describe('Creation', () => {
    it('should create with valid data', () => {})
    it('should reject invalid data', () => {})
  })

  describe('State Transitions', () => {
    it('should allow valid transition A → B', () => {})
    it('should reject invalid transition A → C', () => {})
  })

  describe('Invariants', () => {
    it('should maintain invariant X', () => {})
  })
})
```

### Application Layer Testing

**What**: Services, DTOs, Ports (interfaces)

**Rules**:
- ✅ 90% coverage minimum
- ✅ Test service orchestration logic
- ✅ Test DTO validation
- ✅ Mock external ports (IAgentRunner, IRepository)
- ❌ Don't test infrastructure concerns

**Template**:
```typescript
describe('ServiceName', () => {
  let service: ServiceName
  let mockPort: jest.Mocked<IPortInterface>

  beforeEach(() => {
    mockPort = {
      method: jest.fn(),
    } as any
    service = new ServiceName(mockPort)
  })

  describe('Feature X', () => {
    it('should coordinate dependencies correctly', async () => {
      // Test orchestration logic
    })

    it('should handle port failure gracefully', async () => {
      mockPort.method.mockRejectedValue(new Error('Port failed'))
      await expect(service.doThing()).rejects.toThrow('Port failed')
    })
  })
})
```

### Infrastructure Layer Testing

**What**: Adapters, Repositories, Parsers, Database, Process Manager

**Rules**:
- ✅ 80% coverage minimum
- ✅ Use REAL external resources in integration tests
- ✅ Test error conditions
- ✅ Test resource cleanup (connections, file descriptors, timers)
- ⚠️ Unit tests may mock external APIs
- ❌ Integration tests must NOT mock critical infrastructure

**Database Repository Template**:
```typescript
describe('SqliteAgentRepository (Integration)', () => {
  let db: DatabaseService
  let repository: SqliteAgentRepository

  beforeEach(() => {
    db = new DatabaseService(':memory:')
    db.onModuleInit() // Real schema with FK constraints
    repository = new SqliteAgentRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should save and retrieve agent', async () => {
    const agent = Agent.create({...})
    await repository.save(agent)

    const retrieved = await repository.findById(agent.id)
    expect(retrieved.id).toBe(agent.id)
  })

  it('should enforce unique ID constraint', async () => {
    const agent1 = Agent.create({...})
    const agent2 = Agent.createWithId(agent1.id, {...}) // Same ID

    await repository.save(agent1)
    await expect(repository.save(agent2)).rejects.toThrow(/UNIQUE constraint/)
  })
})
```

**Adapter Template**:
```typescript
describe('AdapterName (Unit)', () => {
  // Mock external dependencies (HTTP, CLI, etc.)
  it('should parse response correctly', () => {})
  it('should handle API errors', () => {})
})

describe('AdapterName (Integration)', () => {
  // Use REAL external service (or skip if unavailable)
  it('should communicate with real service', async () => {
    if (!process.env.API_KEY) {
      console.log('Skipping: API_KEY not set')
      return
    }

    // Test with real service
  })
})
```

### Presentation Layer Testing

**What**: Controllers, WebSocket Gateways, Validators

**Rules**:
- ✅ 80% coverage minimum
- ✅ Test HTTP status codes
- ✅ Test request validation
- ✅ Test response serialization
- ✅ Test error handling
- ⚠️ Mock application services

**Controller Template**:
```typescript
describe('AgentController', () => {
  let controller: AgentController
  let mockOrchestration: jest.Mocked<AgentOrchestrationService>

  it('should return 201 on successful agent launch', async () => {
    mockOrchestration.launchAgent.mockResolvedValue(mockAgent)

    const response = await controller.launchAgent(dto)

    expect(response.statusCode).toBe(201)
    expect(response.body.id).toBe(mockAgent.id.toString())
  })

  it('should return 400 on validation error', async () => {
    const invalidDto = { type: '', prompt: '' }

    await expect(controller.launchAgent(invalidDto))
      .rejects.toThrow(ValidationException)
  })
})
```

---

## Contract Testing

### What Are Contract Tests?

**Contract tests verify that two layers can actually work together**, even when developed separately.

### Critical Contracts in This Project

#### Contract #1: IAgentRunner Interface

**Parties**: AgentOrchestrationService (consumer) ↔ Agent Adapters (implementers)

**Contract Requirements**:
1. `start(session)` must return an Agent
2. Returned Agent must be saveable to repository
3. Returned Agent ID must be stable (not change)
4. Messages emitted must reference returned Agent ID

**Test**:
```typescript
describe('IAgentRunner Contract Compliance', () => {
  const adapters = [
    ClaudePythonProxyAdapter,
    ClaudeSDKAdapter,
    SyntheticAgentAdapter
  ]

  adapters.forEach(AdapterClass => {
    describe(`${AdapterClass.name}`, () => {
      it('should return saveable agent', async () => {
        const adapter = createAdapter(AdapterClass)
        const agent = await adapter.start(session)

        // Contract: Agent must be saveable
        await expect(repository.save(agent)).resolves.not.toThrow()
      })

      it('should return agent with stable ID', async () => {
        const adapter = createAdapter(AdapterClass)
        const agent = await adapter.start(session)

        const id1 = agent.id.toString()
        const id2 = agent.id.toString()

        expect(id1).toBe(id2) // ID doesn't change
      })

      it('should emit messages with matching agent ID', async () => {
        const adapter = createAdapter(AdapterClass)
        const agent = await adapter.start(session)

        const messages: AgentMessage[] = []
        adapter.subscribe(agent.id, {
          onMessage: msg => messages.push(msg),
          onStatusChange: () => {},
          onError: () => {},
          onComplete: () => {}
        })

        // Wait for at least one message
        await waitForMessages(messages, 1)

        // Contract: Message agentId matches returned agent
        expect(messages[0].agentId).toBe(agent.id.toString())
      })
    })
  })
})
```

#### Contract #2: WebSocket Event Schema

**Parties**: Backend StreamingService ↔ Frontend WebSocket Middleware

**Contract Requirements**:
1. Event names must match (`agent:message`, `agent:status`, etc.)
2. Event payloads must have required fields
3. Timestamp format must be ISO 8601
4. Message IDs must be UUIDs

**Test**:
```typescript
describe('WebSocket Event Contract', () => {
  it('agent:message event must have required fields', async () => {
    const event = await captureWebSocketEvent('agent:message')

    expect(event).toMatchObject({
      agentId: expect.stringMatching(UUID_REGEX),
      message: {
        id: expect.stringMatching(UUID_REGEX),
        agentId: expect.any(String),
        sequenceNumber: expect.any(Number),
        type: expect.stringMatching(/^(assistant|user|system|error)$/),
        content: expect.any(String),
        createdAt: expect.stringMatching(ISO_8601_REGEX)
      },
      timestamp: expect.stringMatching(ISO_8601_REGEX)
    })
  })
})
```

#### Contract #3: Database Schema

**Parties**: Repository ↔ Database

**Contract Requirements**:
1. FK constraints must be enabled
2. FK violations must throw specific errors
3. CASCADE delete must work
4. Sequence numbers must be monotonic

**Test**:
```typescript
describe('Database Schema Contract', () => {
  it('must have foreign keys enabled', () => {
    const fkEnabled = db.pragma('foreign_keys', { simple: true })
    expect(fkEnabled).toBe(1)
  })

  it('must reject FK violations', () => {
    expect(() => {
      db.exec(`INSERT INTO agent_messages (agent_id, ...) VALUES ('fake-id', ...)`)
    }).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('must cascade delete messages when agent deleted', async () => {
    await repository.save(agent)
    await messageService.saveMessage({ agentId: agent.id.toString(), ... })

    await repository.delete(agent.id)

    const messages = db.exec(`SELECT * FROM agent_messages WHERE agent_id = ?`, agent.id.toString())
    expect(messages).toHaveLength(0) // Cascaded!
  })
})
```

---

## The TDD Workflow

### For Every Feature/Bug Fix

```
┌─────────────────────────────────────────────┐
│ 1. RED: Write failing test                 │
│    - Test describes desired behavior       │
│    - Run test, verify it fails             │
│    - Commit test (yes, commit failing!)    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. GREEN: Write minimal code to pass       │
│    - Implement simplest solution           │
│    - Run test, verify it passes            │
│    - Commit implementation + passing test  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. REFACTOR: Improve code quality          │
│    - Clean up duplication                  │
│    - Improve naming                        │
│    - Keep tests passing                    │
│    - Commit refactoring                    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. VERIFY: Run all tests                   │
│    - Unit tests pass                       │
│    - Integration tests pass                │
│    - Contract tests pass                   │
│    - E2E tests pass                        │
└─────────────────────────────────────────────┘
```

### Test-First Checklist for AI Agents

Before implementing ANY feature:

- [ ] Identify the layer (Domain/Application/Infrastructure/Presentation)
- [ ] Determine test type (Unit/Integration/Contract/E2E)
- [ ] Write test describing behavior
- [ ] Verify test fails (RED)
- [ ] Identify related contracts - add contract tests if needed
- [ ] Write minimal implementation
- [ ] Verify test passes (GREEN)
- [ ] Refactor while keeping tests green
- [ ] Run ALL tests to verify no regressions

---

## Mocking Strategy

### The Golden Rule: "Don't Mock What You Don't Own"

**You own**:
- Domain entities
- Application services
- Repositories
- Adapters

**You don't own**:
- Anthropic SDK
- Node.js APIs (fs, child_process)
- Express.js
- Socket.io
- Better-sqlite3

**Therefore**:
- ✅ Mock Anthropic SDK
- ✅ Mock file system
- ❌ Don't mock your repositories
- ❌ Don't mock your services

### When to Mock (Decision Tree)

```
Is this a UNIT test?
├─ YES → Mock external dependencies
│         Keep internal dependencies real
│
└─ NO → Is this INTEGRATION test?
        ├─ YES → Use REAL infrastructure
        │         Mock ONLY external APIs
        │
        └─ NO → Is this CONTRACT test?
                ├─ YES → Use REAL implementations
                │         NO mocks allowed
                │
                └─ NO → Is this E2E test?
                        └─ YES → Use REAL everything
                                  (or synthetic for speed)
```

### Mocking Anti-Patterns

#### Anti-Pattern #1: Mocking in Integration Tests

```typescript
// ❌ BAD: Integration test with mocked DB
describe('MessageService (Integration)', () => {
  let mockDb = { query: jest.fn() }

  it('should save message', async () => {
    mockDb.query.mockResolvedValue({ id: '123' })
    // This doesn't test anything real!
  })
})

// ✅ GOOD: Integration test with real DB
describe('MessageService (Integration)', () => {
  let db: DatabaseService

  beforeEach(() => {
    db = new DatabaseService(':memory:')
    db.onModuleInit()
  })

  it('should save message', async () => {
    const msg = await messageService.saveMessage({...})

    // Verify with real database query
    const saved = db.getDatabase()
      .prepare('SELECT * FROM agent_messages WHERE id = ?')
      .get(msg.id)

    expect(saved).toBeDefined()
  })
})
```

#### Anti-Pattern #2: Returning Unrealistic Mock Data

```typescript
// ❌ BAD: Mock doesn't reflect reality
mockRunner.start.mockResolvedValue({
  id: 'agent-123', // String instead of AgentId!
  status: 'running' // String instead of enum!
})

// ✅ GOOD: Mock returns realistic domain objects
const mockAgent = Agent.create({...})
mockAgent.markAsRunning()
mockRunner.start.mockResolvedValue(mockAgent)
```

#### Anti-Pattern #3: Mocking Too Much

```typescript
// ❌ BAD: Everything mocked - test meaningless
it('should launch agent', async () => {
  mockFactory.create.mockReturnValue(mockRunner)
  mockRunner.start.mockResolvedValue(mockAgent)
  mockRepository.save.mockResolvedValue(undefined)

  const result = await service.launchAgent(dto)

  // This only tests that mocks return what you told them to!
})

// ✅ GOOD: Real collaborators where safe
it('should launch agent', async () => {
  // Real factory, real repository, real database
  const result = await service.launchAgent(dto)

  // Verify with real database
  const saved = await repository.findById(result.id)
  expect(saved).toBeDefined()
})
```

---

## Test Quality Checklist

### Before Committing ANY Test

- [ ] **Test is independent** - Doesn't depend on other tests running first
- [ ] **Test is deterministic** - Same inputs always produce same results
- [ ] **Test has clear name** - Describes behavior, not implementation
- [ ] **Test is focused** - Tests ONE behavior
- [ ] **Test uses real infrastructure** - Where appropriate for test type
- [ ] **Test has proper cleanup** - No resource leaks
- [ ] **Test has assertions** - Actually verifies something
- [ ] **Test fails when it should** - Verify by breaking implementation
- [ ] **Test passes when it should** - Verify implementation works

### Red Flags in Test Code

**🚩 No assertions**
```typescript
it('should do something', async () => {
  await service.doThing() // No expect()!
})
```

**🚩 Testing implementation details**
```typescript
it('should call logger.debug 3 times', () => {
  // Who cares? Test behavior instead
})
```

**🚩 Too many mocks**
```typescript
it('should work', () => {
  // 15 lines of mock setup
  // 1 line of actual test
})
```

**🚩 Flaky tests**
```typescript
it('should eventually complete', async () => {
  setTimeout(() => done(), 5000) // Race condition!
})
```

**🚩 Test doesn't fail when implementation breaks**
```typescript
it('should validate agent', () => {
  const agent = Agent.create({type: ''}) // Should throw!
  expect(agent).toBeDefined() // Test passes even though validation broken
})
```

---

## Common Pitfalls

### Pitfall #1: The Mock Trap

**Symptom**: All unit tests pass, integration fails

**Cause**: Over-mocking hides real issues

**Example**:
```typescript
// Unit test passes:
mockRepository.save.mockResolvedValue(undefined)

// But real repository throws FK constraint error!
```

**Solution**: Add integration test with real repository.

### Pitfall #2: Missing Negative Tests

**Symptom**: System accepts invalid data in production

**Cause**: Only tested happy paths

**Example**:
```typescript
// Only tested:
it('should accept valid prompt', () => {})

// Missing:
it('should reject empty prompt', () => {})
it('should reject prompt over 50KB', () => {})
it('should reject prompt with null bytes', () => {})
```

**Solution**: For every constraint, test both acceptance AND rejection.

### Pitfall #3: Async Test Races

**Symptom**: Tests pass locally, fail in CI

**Cause**: Race conditions in async code

**Example**:
```typescript
// ❌ BAD: Race condition
it('should emit message', async () => {
  service.broadcastMessage(msg)
  expect(socket.emit).toHaveBeenCalled() // Might not be called yet!
})

// ✅ GOOD: Wait for async operation
it('should emit message', async () => {
  await service.broadcastMessage(msg) // Await!
  expect(socket.emit).toHaveBeenCalled()
})
```

**Solution**: Always await promises, use waitFor() helpers.

### Pitfall #4: Testing Implementation Instead of Behavior

**Symptom**: Tests break when refactoring (even though behavior unchanged)

**Cause**: Tests coupled to implementation details

**Example**:
```typescript
// ❌ BAD: Tests implementation
it('should use Map to store runners', () => {
  expect(service['runnerStorage']).toBeInstanceOf(Map)
})

// ✅ GOOD: Tests behavior
it('should retrieve runner for launched agent', async () => {
  const agent = await service.launchAgent(dto)
  const runner = service.getRunnerForAgent(agent.id)
  expect(runner).toBeDefined()
})
```

### Pitfall #5: Not Testing Edge Cases

**Common missed edge cases**:
- Empty arrays/strings
- Null/undefined values
- Maximum/minimum values
- Concurrent operations
- Resource exhaustion
- Network failures
- Process termination

**Solution**: Use boundary value analysis for all inputs.

---

## Examples & Templates

### Example #1: Domain Entity Test (Agent)

```typescript
import { Agent } from '@domain/entities/agent.entity'
import { AgentType } from '@domain/value-objects/agent-type.vo'
import { AgentStatus } from '@domain/value-objects/agent-status.vo'
import { DomainException } from '@domain/exceptions/domain.exception'

describe('Agent Entity', () => {
  describe('Creation', () => {
    it('should create agent with valid data', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {}
      })

      expect(agent.id).toBeDefined()
      expect(agent.type).toBe(AgentType.CLAUDE_CODE)
      expect(agent.status).toBe(AgentStatus.INITIALIZING)
    })

    it('should reject empty prompt', () => {
      expect(() => Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: '',
        configuration: {}
      })).toThrow(DomainException)
    })
  })

  describe('State Transitions', () => {
    let agent: Agent

    beforeEach(() => {
      agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {}
      })
    })

    it('should allow: INITIALIZING → RUNNING', () => {
      agent.markAsRunning()
      expect(agent.status).toBe(AgentStatus.RUNNING)
      expect(agent.startedAt).toBeDefined()
    })

    it('should allow: RUNNING → COMPLETED', () => {
      agent.markAsRunning()
      agent.markAsCompleted()
      expect(agent.status).toBe(AgentStatus.COMPLETED)
      expect(agent.completedAt).toBeDefined()
    })

    it('should reject: COMPLETED → RUNNING', () => {
      agent.markAsRunning()
      agent.markAsCompleted()

      expect(() => agent.markAsRunning())
        .toThrow('Agent must be initializing to start')
    })

    it('should allow: INITIALIZING → FAILED', () => {
      const error = new Error('Test error')
      agent.markAsFailed(error)

      expect(agent.status).toBe(AgentStatus.FAILED)
      expect(agent.error).toBe(error)
    })
  })

  describe('Invariants', () => {
    it('should never have completedAt before startedAt', () => {
      const agent = Agent.create({...})
      agent.markAsRunning()
      agent.markAsCompleted()

      expect(agent.completedAt!.getTime())
        .toBeGreaterThanOrEqual(agent.startedAt!.getTime())
    })
  })
})
```

### Example #2: Integration Test (Repository + Database)

```typescript
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository'
import { DatabaseService } from '@infrastructure/database/database.service'
import { Agent } from '@domain/entities/agent.entity'
import { AgentType } from '@domain/value-objects/agent-type.vo'

describe('SqliteAgentRepository (Integration)', () => {
  let db: DatabaseService
  let repository: SqliteAgentRepository

  beforeEach(() => {
    db = new DatabaseService(':memory:')
    db.onModuleInit()
    repository = new SqliteAgentRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('CRUD Operations', () => {
    it('should save and retrieve agent', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {}
      })

      await repository.save(agent)

      const retrieved = await repository.findById(agent.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.id.toString()).toBe(agent.id.toString())
      expect(retrieved!.session.prompt).toBe('Test')
    })

    it('should update existing agent', async () => {
      const agent = Agent.create({...})
      await repository.save(agent)

      agent.markAsRunning()
      await repository.save(agent) // Update

      const retrieved = await repository.findById(agent.id)
      expect(retrieved!.status).toBe(AgentStatus.RUNNING)
    })

    it('should delete agent', async () => {
      const agent = Agent.create({...})
      await repository.save(agent)

      await repository.delete(agent.id)

      const retrieved = await repository.findById(agent.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('Query Operations', () => {
    it('should find agents by status', async () => {
      const agent1 = Agent.create({...})
      agent1.markAsRunning()

      const agent2 = Agent.create({...})
      agent2.markAsRunning()
      agent2.markAsCompleted()

      await repository.save(agent1)
      await repository.save(agent2)

      const running = await repository.findByStatus(AgentStatus.RUNNING)
      const completed = await repository.findByStatus(AgentStatus.COMPLETED)

      expect(running).toHaveLength(1)
      expect(completed).toHaveLength(1)
    })
  })

  describe('Constraints', () => {
    it('should enforce unique ID constraint', async () => {
      const agent1 = Agent.create({...})
      const agent2 = Agent.createWithId(agent1.id, {...}) // Same ID

      await repository.save(agent1)

      // SQLite should reject duplicate ID
      await expect(repository.save(agent2))
        .rejects.toThrow(/UNIQUE constraint/)
    })
  })
})
```

### Example #3: Contract Test

```typescript
describe('Orchestration → Runner Contract', () => {
  let orchestration: AgentOrchestrationService
  let repository: SqliteAgentRepository
  let db: DatabaseService

  beforeEach(() => {
    // REAL database, REAL repository, REAL orchestration
    // Only the external CLI is synthetic for speed
  })

  it('CONTRACT: Launched agent must exist in database', async () => {
    const launchedAgent = await orchestration.launchAgent({
      type: 'synthetic',
      prompt: 'Test',
      configuration: {}
    })

    // CRITICAL: Agent returned by launch MUST be in database
    const inDb = await repository.findById(launchedAgent.id)

    expect(inDb).toBeDefined()
    expect(inDb!.id.toString()).toBe(launchedAgent.id.toString())
  })

  it('CONTRACT: Messages must be saveable for launched agent', async () => {
    const agent = await orchestration.launchAgent({
      type: 'synthetic',
      prompt: 'Test',
      configuration: {}
    })

    // CRITICAL: Messages must reference valid agent_id
    await expect(messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Test message'
    })).resolves.toBeDefined() // Must not throw FK error
  })

  it('CONTRACT: Agent ID must be stable after launch', async () => {
    const agent = await orchestration.launchAgent({...})

    const id1 = agent.id.toString()
    await wait(100)
    const id2 = agent.id.toString()

    expect(id1).toBe(id2)
  })
})
```

### Example #4: E2E Test

```typescript
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { io, Socket } from 'socket.io-client'
import { AppModule } from '@/app.module'

describe('Agent Lifecycle (E2E)', () => {
  let app: INestApplication
  let socket: Socket

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = module.createNestApplication()
    await app.init()

    socket = io('http://localhost:3000')
    await new Promise(resolve => socket.on('connect', resolve))
  })

  afterAll(async () => {
    socket.close()
    await app.close()
  })

  it('should complete full user journey', async () => {
    // 1. Launch agent via HTTP
    const launchRes = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'synthetic',
        prompt: 'E2E test',
        configuration: { outputFormat: 'stream-json' }
      })
      .expect(201)

    const agentId = launchRes.body.id

    // 2. Subscribe via WebSocket
    socket.emit('subscribe', { agentId })
    await new Promise(resolve => socket.once('subscribed', resolve))

    // 3. Collect messages
    const messages: any[] = []
    socket.on('agent:message', (event) => {
      messages.push(event.message)
    })

    // 4. Wait for completion
    await new Promise(resolve => socket.once('agent:complete', resolve))

    // 5. Verify messages were received
    expect(messages.length).toBeGreaterThan(0)

    // 6. Verify messages in database
    const dbMessages = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}/messages`)
      .expect(200)

    expect(dbMessages.body).toHaveLength(messages.length)

    // 7. Verify message IDs match (same messages via WebSocket and REST)
    const wsIds = messages.map(m => m.id).sort()
    const dbIds = dbMessages.body.map((m: any) => m.id).sort()
    expect(wsIds).toEqual(dbIds)
  })
})
```

---

## Test Organization Standards

### File Naming

```
test/
├── unit/
│   ├── domain/
│   │   ├── entities/
│   │   │   └── agent.entity.spec.ts        // Entity name + .spec.ts
│   │   └── value-objects/
│   │       └── agent-id.vo.spec.ts         // VO name + .spec.ts
│   ├── application/
│   │   └── services/
│   │       └── agent-orchestration.service.spec.ts
│   └── infrastructure/
│       └── adapters/
│           └── claude-sdk.adapter.spec.ts
│
├── integration/
│   ├── database-persistence.integration.spec.ts
│   ├── agent-launch-flow.integration.spec.ts
│   └── websocket-streaming.integration.spec.ts
│
├── contracts/
│   ├── agent-runner.contract.spec.ts
│   ├── websocket-api.contract.spec.ts
│   └── database-schema.contract.spec.ts
│
├── e2e/
│   ├── agent-lifecycle.e2e.spec.ts
│   └── smoke/
│       └── python-proxy.smoke.spec.ts
│
├── helpers/                     // Test utilities
│   ├── database-helpers.ts
│   ├── mock-factory.ts
│   └── assertion-helpers.ts
│
├── fixtures/                    // Test data
│   ├── claude-code/
│   │   ├── success.jsonl
│   │   └── error.jsonl
│   └── websocket/
│       └── events.json
│
└── mocks/                       // Reusable mocks
    ├── websocket-gateway.mock.ts
    └── agent-runner.mock.ts
```

### Test Structure

```typescript
describe('ComponentName', () => {
  // Setup
  let component: ComponentName

  beforeEach(() => {
    // Fresh instance for each test
  })

  afterEach(() => {
    // Cleanup
  })

  // Group by feature/behavior
  describe('Feature A', () => {
    describe('Happy path', () => {
      it('should handle valid input', () => {})
    })

    describe('Error cases', () => {
      it('should reject invalid input', () => {})
      it('should handle dependency failure', () => {})
    })

    describe('Edge cases', () => {
      it('should handle empty input', () => {})
      it('should handle maximum input', () => {})
    })
  })
})
```

---

## For AI Agents: Quick Reference

### "I need to implement feature X, what tests do I write?"

**Step 1**: Identify the layer
- Domain? → Unit tests (100% coverage)
- Application? → Unit + Integration
- Infrastructure? → Unit + Integration + maybe Contract
- Presentation? → Unit + E2E

**Step 2**: For each layer, write tests in this order
1. Happy path (feature works)
2. Validation (rejects invalid data)
3. Error handling (handles failures)
4. Edge cases (boundaries, null, empty)
5. Performance (if relevant)

**Step 3**: Add contract tests if you're implementing an interface
- Test that implementation honors the contract
- Test with real collaborators

**Step 4**: Add E2E test if it's a user-facing feature
- Test complete flow from HTTP/WebSocket to database

### "My test is failing, what do I check?"

1. **Is the test correct?** - Does it describe the right behavior?
2. **Is the implementation wrong?** - Fix implementation
3. **Is it a race condition?** - Add proper await/waitFor
4. **Is it a mock issue?** - Replace mock with real implementation
5. **Is cleanup incomplete?** - Check beforeEach/afterEach

### "When should I use mocks?"

**Decision tree**:
```
Is this a unit test?
├─ YES → Mock external dependencies (APIs, file system)
│        Keep domain/application dependencies real
│
└─ NO → Is this integration/E2E?
        └─ YES → Use REAL infrastructure
                 Mock ONLY external APIs if testing isn't integration point
```

---

## Success Metrics

### For AI Agents to Validate Test Quality

After writing tests, verify:

- [ ] **All tests pass** (`npm test`)
- [ ] **Coverage meets minimums**:
  - Domain: 100%
  - Application: 90%
  - Infrastructure: 80%
  - Presentation: 80%
- [ ] **No skipped tests** (unless API keys unavailable)
- [ ] **Tests are fast** (<2s for unit, <30s for integration, <60s for E2E)
- [ ] **Tests are deterministic** (run 10 times, all pass)
- [ ] **Tests catch real bugs** (break implementation, test fails)

### Red Flags for AI Agents

**Stop and reassess if**:
- More than 50% of test file is mock setup
- Integration test uses mocked database
- No negative tests for new constraint
- E2E test takes >2 minutes
- Test passes even when implementation is broken

---

## Appendix: Testing Anti-Patterns Glossary

| Anti-Pattern | Description | Fix |
|--------------|-------------|-----|
| **The Mock Fest** | Test file is 80% mocks, 20% test | Reduce mocks, use real collaborators |
| **The Flake** | Test sometimes passes, sometimes fails | Fix race conditions, use deterministic data |
| **The Tautology** | Test that always passes | Add real assertions, verify test fails when broken |
| **The Implementation Detail** | Test checks internal state | Test public API/behavior instead |
| **The Integration Mock** | Integration test with mocked dependencies | Use real database/services |
| **The Missing Negative** | Only tests happy path | Add tests for error cases |
| **The Slow Test** | Unit test takes >1s | Reduce scope or move to integration |
| **The Database Leak** | Test doesn't clean up data | Add proper teardown |

---

**Document Version**: 1.0
**Last Updated**: 2025-11-23
**Maintained By**: AI Agents
**Status**: Living Document - Update as patterns evolve
