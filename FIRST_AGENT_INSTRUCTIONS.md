# Instructions for First AI Agent - Test Infrastructure Implementation

**Mission**: Implement comprehensive test infrastructure for AI-autonomous development

---

## 📋 Context

This project is a **Headless AI Agent Management System** that orchestrates multiple AI agents with real-time WebSocket streaming. The system is **production-ready** but has identified **critical testing gaps** that prevent fully autonomous AI development.

**Your mission**: Implement a comprehensive test infrastructure (232 tests) that enables future AI agents to develop features autonomously with zero human intervention.

---

## 🎯 Your Task

Implement **Phase 1** of the comprehensive test plan: **Critical Infrastructure Gaps**

**What to implement**:
1. WebSocket Gateway tests (15 tests, 4 hours)
2. Logger Service tests (12 tests, 2 hours)
3. Database Service tests (20 tests, 3 hours)

**Total**: 47 tests, ~9 hours

---

## 📚 Required Reading (READ THESE FIRST!)

**Essential** (must read before starting):

1. **[docs/testing/README.md](./docs/testing/README.md)** (15 minutes)
   - Quick start guide
   - Navigation help
   - Success criteria

2. **[docs/testing/TESTING_ARCHITECTURE_GUIDE.md](./docs/testing/TESTING_ARCHITECTURE_GUIDE.md)** (30 minutes)
   - **CRITICAL**: Read "The Testing Constitution" section
   - Understand the 8 constitutional rules
   - Learn when to mock vs use real implementations
   - Study the TDD workflow

3. **[docs/testing/COMPREHENSIVE_TEST_PLAN.md](./docs/testing/COMPREHENSIVE_TEST_PLAN.md)** (15 minutes)
   - Find **Phase 1** section
   - Read sections 1.1, 1.2, 1.3
   - Note the specific tests to implement

4. **[docs/testing/TEST_TEMPLATES.md](./docs/testing/TEST_TEMPLATES.md)** (reference)
   - Keep this open while coding
   - Use "Unit Test: Application Service" template for Gateway tests
   - Use templates as starting points

**Optional** (helpful context):
- [CLAUDE.md](./CLAUDE.md) - Project development guide
- [backend/ARCHITECTURE_AUDIT_FK_BUG.md](./backend/ARCHITECTURE_AUDIT_FK_BUG.md) - Real example of why testing matters

---

## 🚀 Step-by-Step Implementation Guide

### Step 1: Verify Environment (10 minutes)

```bash
# 1. Navigate to project
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager

# 2. Check current tests pass
cd backend
npm test

# Expected: ~370 tests passing, a few may be failing (that's ok)

# 3. Verify you can run tests
npm run test:watch  # Should start watch mode (Ctrl+C to exit)
```

### Step 2: Read Documentation (1 hour)

**Read in this order**:
1. docs/testing/README.md
2. docs/testing/TESTING_ARCHITECTURE_GUIDE.md (focus on "The Testing Constitution")
3. docs/testing/COMPREHENSIVE_TEST_PLAN.md (Phase 1 only)

**After reading, you should understand**:
- [ ] The 8 constitutional rules for testing
- [ ] When to use unit vs integration tests
- [ ] When to mock vs use real implementations
- [ ] The RED → GREEN → REFACTOR workflow
- [ ] What Phase 1 requires

### Step 3: Implement Section 1.1 - WebSocket Gateway Tests (4 hours)

**Location**: Create `backend/test/unit/application/gateways/agent.gateway.spec.ts`

**What to do**:

1. **Open the template**: [docs/testing/TEST_TEMPLATES.md](./docs/testing/TEST_TEMPLATES.md) - "Unit Test: Application Service"

2. **Read the test list**: [docs/testing/COMPREHENSIVE_TEST_PLAN.md](./docs/testing/COMPREHENSIVE_TEST_PLAN.md) - Phase 1, Section 1.1

3. **Follow TDD for each test**:
   ```
   For each of the 15 tests listed:

   a. Write the test (RED)
   b. Run test - verify it FAILS
   c. Read the actual implementation (backend/src/application/gateways/agent.gateway.ts)
   d. Write minimal code to make test pass (GREEN) - or verify implementation already works
   e. Run test - verify it PASSES
   f. Commit: "test: add [test description]"
   ```

4. **Tests to implement** (from COMPREHENSIVE_TEST_PLAN.md):
   ```typescript
   describe('AgentGateway', () => {
     describe('Connection Lifecycle', () => {
       it('should add client to connectedClients map on connection')
       it('should remove client from connectedClients map on disconnect')
       it('should emit "connected" event with client ID and timestamp')
       it('should handle multiple simultaneous connections')
     })

     describe('Subscription Management', () => {
       it('should join client to agent room on subscribe')
       it('should leave client from agent room on unsubscribe')
       it('should emit "subscribed" confirmation to client')
       it('should emit "unsubscribed" confirmation to client')
       it('should handle subscription to non-existent agent')
       it('should allow multiple clients to subscribe to same agent')
     })

     describe('Message Broadcasting', () => {
       it('should emit to specific client via emitToClient()')
       it('should emit to all clients via emitToAll()')
       it('should emit to room via emitToRoom()')
       it('should NOT emit to clients not in room')
     })

     describe('Error Handling', () => {
       it('should handle emit to disconnected client')
     })
   })
   ```

5. **How to mock Socket.IO**:
   ```typescript
   // You'll need to create mock Socket objects
   const mockClient = {
     id: 'test-client-id',
     join: jest.fn(),
     leave: jest.fn(),
     emit: jest.fn(),
   }

   // Mock the @nestjs/websockets server
   const mockServer = {
     to: jest.fn().mockReturnThis(),
     emit: jest.fn(),
   }
   ```

6. **Success criteria**:
   - All 15 tests written
   - All 15 tests passing
   - Used real Gateway implementation (no mocking the gateway itself)
   - Mocked only Socket.IO infrastructure
   - Each test is independent
   - Tests are fast (<100ms each)

### Step 4: Implement Section 1.2 - Logger Service Tests (2 hours)

**Location**: Create `backend/test/unit/infrastructure/logging/console-logger.service.spec.ts`

**What to do**:

1. **Read test list**: COMPREHENSIVE_TEST_PLAN.md - Phase 1, Section 1.2

2. **Implement 12 tests** following TDD workflow

3. **Key tests**:
   ```typescript
   describe('ConsoleLogger', () => {
     describe('Log Levels', () => {
       it('should log info messages with timestamp')
       it('should log error messages with timestamp')
       it('should log warn messages with timestamp')
       it('should log debug messages with timestamp')
       it('should log context object as JSON')
     })

     describe('Error Handling', () => {
       it('should not throw if context serialization fails')
       it('should handle circular references in context')
       it('should handle undefined/null context')
     })

     describe('Output Format', () => {
       it('should include timestamp in ISO 8601 format')
       it('should include log level in message')
       it('should stringify context as JSON')
       it('should handle multi-line messages')
     })
   })
   ```

4. **How to test console output**:
   ```typescript
   // Spy on console.log
   const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

   logger.info('Test message', { context: 'data' })

   expect(consoleSpy).toHaveBeenCalledWith(
     expect.stringContaining('Test message')
   )

   consoleSpy.mockRestore()
   ```

### Step 5: Implement Section 1.3 - Database Service Tests (3 hours)

**Location**: Create `backend/test/unit/infrastructure/database/database.service.spec.ts`

**What to do**:

1. **Read test list**: COMPREHENSIVE_TEST_PLAN.md - Phase 1, Section 1.3

2. **Implement 20 tests** following TDD workflow

3. **CRITICAL TEST** (this catches FK bugs):
   ```typescript
   it('should enable foreign_keys pragma', () => {
     const db = new DatabaseService(':memory:')
     db.onModuleInit()

     const fk = db.getDatabase().pragma('foreign_keys', { simple: true })

     expect(fk).toBe(1)  // MUST be 1 (enabled)
   })
   ```

4. **Success criteria**:
   - All 20 tests passing
   - FK constraint enablement verified
   - Schema migration tested
   - Transaction support tested

### Step 6: Verify All Tests Pass (15 minutes)

```bash
cd backend
npm test

# Expected output:
# Test Suites: X passed, X total
# Tests: ~417 passed (370 existing + 47 new)
```

### Step 7: Submit Completion Report (15 minutes)

Create `backend/test/PHASE_1_COMPLETION_REPORT.md`:

```markdown
# Phase 1 Implementation - Completion Report

**Date**: [TODAY]
**Duration**: [ACTUAL TIME]
**Tests Added**: 47
**Tests Passing**: 47/47 (100%)

## Implemented

### 1.1 WebSocket Gateway Tests ✅
- File: test/unit/application/gateways/agent.gateway.spec.ts
- Tests: 15/15 passing
- Coverage: 100% of agent.gateway.ts
- Duration: [TIME]

### 1.2 Logger Service Tests ✅
- File: test/unit/infrastructure/logging/console-logger.service.spec.ts
- Tests: 12/12 passing
- Coverage: 100% of console-logger.service.ts
- Duration: [TIME]

### 1.3 Database Service Tests ✅
- File: test/unit/infrastructure/database/database.service.spec.ts
- Tests: 20/20 passing
- Coverage: 100% of database.service.ts
- Duration: [TIME]
- CRITICAL: FK constraint enablement verified ✅

## Success Criteria Met

- [x] All 47 tests implemented
- [x] All tests passing
- [x] FK constraints verified enabled
- [x] No test takes >2s
- [x] All tests are independent
- [x] Followed TDD workflow (RED → GREEN → REFACTOR)

## Next Steps

Phase 2: Contract & Boundary Tests (65 tests)
- Start with: IAgentRunner contract tests
- Estimated: 18 hours
```

---

## ⚠️ CRITICAL RULES (Read This!)

### The 8 Constitutional Rules for Testing

**You MUST follow these** (no exceptions):

1. **Test First, Always** - Write failing test BEFORE implementation
2. **Test Behavior, Not Implementation** - Test what it does, not how
3. **Test Boundaries with Real Collaborators** - No mocks at integration points
4. **Every Layer Boundary Needs Contract Test** - Verify layers work together
5. **Negative Tests Are Mandatory** - Test rejection of invalid data
6. **Integration Tests Use Real Infrastructure** - Real database, real constraints
7. **Performance is a Feature** - Test execution time
8. **Tests Must Be Self-Contained** - Independent, deterministic, parallelizable

### When to Mock (Decision Tree)

```
Is this a UNIT test?
├─ YES → Mock external dependencies (APIs, file system)
│        Keep domain/application dependencies REAL
│
└─ NO → Is this INTEGRATION test?
        └─ Use REAL infrastructure (database, WebSocket)
           Mock ONLY external APIs
```

### TDD Workflow (Every Single Test!)

```
1. RED: Write failing test
   - Describe the behavior in test name
   - Write assertions
   - Run test → verify it FAILS

2. GREEN: Make it pass
   - Write minimal implementation
   - Run test → verify it PASSES

3. REFACTOR: Clean up
   - Remove duplication
   - Improve naming
   - Keep tests passing
```

---

## 🎓 Success Criteria

**You've succeeded when**:

**Quantitative**:
- [ ] 47 new tests implemented
- [ ] All 47 tests passing
- [ ] All tests run in <2s (unit tests should be fast)
- [ ] Coverage increased by ~8%
- [ ] No flaky tests (run suite 5 times, all pass)

**Qualitative**:
- [ ] Followed TDD strictly (test-first for every behavior)
- [ ] Used templates from TEST_TEMPLATES.md
- [ ] Tests verify behavior, not implementation
- [ ] FK constraint enablement verified
- [ ] Tests are well-organized and readable
- [ ] Completion report written

---

## 💡 Tips for Success

### Tip #1: Read the Actual Implementation First

**Before writing tests**, read:
- `backend/src/application/gateways/agent.gateway.ts`
- `backend/src/infrastructure/logging/console-logger.service.ts`
- `backend/src/infrastructure/database/database.service.ts`

**Understand what they do**, then write tests that verify the behavior.

### Tip #2: One Test at a Time

**Don't**:
- Write all 15 tests at once
- Try to implement everything in parallel

**Do**:
- Write 1 test
- Make it pass
- Commit
- Move to next test

### Tip #3: Use the Templates

**Don't** reinvent the wheel.

**Do** copy templates from TEST_TEMPLATES.md and adapt them.

### Tip #4: Verify Tests Actually Fail

**For each test**:
1. Write test
2. Run it - should FAIL (RED)
3. If it passes without implementation, the test is wrong!
4. Fix test so it actually tests something

### Tip #5: Ask for Help When Stuck

**If you're unsure**:
- Reread the documentation section
- Check existing tests for similar patterns
- Look at TEST_TEMPLATES.md for examples
- Remember: Tests should verify BEHAVIOR, not implementation

---

## 🚨 Common Pitfalls to Avoid

### Pitfall #1: Mocking the Thing You're Testing

```typescript
// ❌ WRONG
describe('AgentGateway', () => {
  let mockGateway = { emit: jest.fn() }  // You're testing Gateway!
})

// ✅ RIGHT
describe('AgentGateway', () => {
  let gateway = new AgentGateway(mockServer)  // Real Gateway, mock infrastructure
})
```

### Pitfall #2: Testing Implementation Details

```typescript
// ❌ WRONG
it('should use Map for storage', () => {
  expect(gateway['clients']).toBeInstanceOf(Map)
})

// ✅ RIGHT
it('should track connected clients', () => {
  gateway.handleConnection(mockClient)
  const clients = gateway.getConnectedClients()
  expect(clients).toContain(mockClient.id)
})
```

### Pitfall #3: Not Following TDD

```typescript
// ❌ WRONG workflow:
1. Write implementation
2. Write test
3. Test passes (false confidence!)

// ✅ RIGHT workflow:
1. Write test
2. Run test → FAILS (RED)
3. Write implementation
4. Run test → PASSES (GREEN)
```

---

## 📝 Detailed First Steps

### Minute-by-Minute for First Test

**Test #1**: "should add client to connectedClients map on connection"

**Minute 0-5**: Write the test
```typescript
// backend/test/unit/application/gateways/agent.gateway.spec.ts

import { AgentGateway } from '@application/gateways/agent.gateway'
import { Test } from '@nestjs/testing'

describe('AgentGateway', () => {
  let gateway: AgentGateway

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AgentGateway]
    }).compile()

    gateway = module.get<AgentGateway>(AgentGateway)
  })

  describe('Connection Lifecycle', () => {
    it('should add client to connectedClients map on connection', () => {
      // Arrange
      const mockClient = {
        id: 'test-client-123',
      } as any

      // Act
      gateway.handleConnection(mockClient)

      // Assert
      // How do we verify? Need to check the gateway's state
      // This might require adding a getConnectedClients() method or checking via reflection
      expect(gateway['connectedClients'].has('test-client-123')).toBe(true)
    })
  })
})
```

**Minute 5-10**: Run the test
```bash
npm test -- agent.gateway.spec
# Should FAIL (RED) - test file doesn't exist yet or test fails
```

**Minute 10-15**: Check actual implementation
```bash
# Read the gateway implementation
cat backend/src/application/gateways/agent.gateway.ts | head -100
```

**Minute 15-20**: Verify test fails correctly, then make it pass (GREEN)

**Minute 20-25**: Run test again - should PASS

**Minute 25-30**: Commit
```bash
git add backend/test/unit/application/gateways/agent.gateway.spec.ts
git commit -m "test: add WebSocket gateway connection tracking test"
```

**Repeat for remaining 14 tests in section 1.1**

---

## 🎯 Expected Timeline

**Hour 1**: Read documentation
**Hour 2-5**: Implement WebSocket Gateway tests (15 tests)
**Hour 6-7**: Implement Logger Service tests (12 tests)
**Hour 8-10**: Implement Database Service tests (20 tests)
**Hour 10.5**: Verify all tests pass, write completion report

**Total**: ~10 hours (includes reading + implementation)

---

## ✅ Definition of Done

**Phase 1 is complete when**:

1. **All 47 tests implemented**:
   - [ ] agent.gateway.spec.ts (15 tests)
   - [ ] console-logger.service.spec.ts (12 tests)
   - [ ] database.service.spec.ts (20 tests)

2. **All tests passing**:
   - [ ] Run `npm test` → All pass
   - [ ] No skipped tests
   - [ ] No flaky tests (run 5 times, all pass)

3. **Quality criteria met**:
   - [ ] Followed TDD workflow for every test
   - [ ] Used templates from TEST_TEMPLATES.md
   - [ ] Tests verify behavior, not implementation
   - [ ] Appropriate use of mocks vs real implementations
   - [ ] Each test is independent
   - [ ] FK constraint enablement verified (Database test #5)

4. **Documentation complete**:
   - [ ] Completion report written
   - [ ] Any new patterns documented
   - [ ] Code committed with clear messages

---

## 🚀 Starting Command

**When you're ready to begin**:

```bash
# 1. Navigate to backend
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend

# 2. Create test file for WebSocket Gateway
mkdir -p test/unit/application/gateways
touch test/unit/application/gateways/agent.gateway.spec.ts

# 3. Open template
cat /home/dev/projects/mcp-management-system/dev/headless-agent-manager/docs/testing/TEST_TEMPLATES.md

# 4. Start watch mode (TDD)
npm run test:watch -- agent.gateway.spec

# 5. Begin implementing tests one by one
```

---

## 📞 What to Do If...

**...tests are failing unexpectedly?**
- Check you're using real vs mock correctly
- Verify imports are correct
- Check Jest configuration
- Read existing similar tests for patterns

**...you're unsure about test structure?**
- Look at existing test files in `backend/test/unit/`
- Use templates from TEST_TEMPLATES.md
- Follow the template structure exactly

**...you're unsure what a test should verify?**
- Reread the test description in COMPREHENSIVE_TEST_PLAN.md
- Think: "What behavior am I verifying?"
- Ask: "If implementation breaks, should this test fail?"

**...you find bugs in existing code?**
- Document the bug
- Write a test that exposes it
- Fix the bug
- Verify test passes

---

## 🎉 After Completion

**When Phase 1 is done**:

1. **Celebrate** - You've implemented critical test infrastructure!
2. **Report completion** - Share PHASE_1_COMPLETION_REPORT.md
3. **Run full test suite** - Verify nothing broke
4. **Prepare for Phase 2** - Contract tests (more interesting!)

**Phase 2 will be easier** because:
- You'll understand the patterns
- Helpers will be available
- Templates will be familiar
- TDD workflow will be natural

---

## 📚 Quick Reference

**Test currently failing?**
→ Check backend/ARCHITECTURE_AUDIT_FK_BUG.md for debugging approach

**Forgot TDD workflow?**
→ docs/testing/TESTING_ARCHITECTURE_GUIDE.md - "The TDD Workflow"

**Need a template?**
→ docs/testing/TEST_TEMPLATES.md

**Need the test list?**
→ docs/testing/COMPREHENSIVE_TEST_PLAN.md - Phase 1

**Forgot the rules?**
→ docs/testing/TESTING_ARCHITECTURE_GUIDE.md - "The Testing Constitution"

**Lost?**
→ docs/testing/README.md

---

## 🚦 Ready to Begin?

**Checklist before you start**:

- [ ] I've read docs/testing/README.md
- [ ] I've read docs/testing/TESTING_ARCHITECTURE_GUIDE.md (especially "The Testing Constitution")
- [ ] I've read docs/testing/COMPREHENSIVE_TEST_PLAN.md Phase 1
- [ ] I understand the TDD workflow (RED → GREEN → REFACTOR)
- [ ] I understand when to mock vs use real implementations
- [ ] I have TEST_TEMPLATES.md open for reference
- [ ] I'm in the backend directory
- [ ] I'm ready to write tests FIRST

**If all checked**: You're ready! Begin with Step 3 above. 🚀

---

**Good luck! The entire testing infrastructure foundation depends on Phase 1 being done correctly.**

**Remember**: Tests aren't a chore - they're the specification that enables autonomous development. Write them with care!

---

**Created**: 2025-11-24
**Purpose**: Onboard first AI agent to test infrastructure implementation
**Next Agent**: Will receive instructions for Phase 2 after Phase 1 complete
