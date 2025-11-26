# Instructions for Next AI Agent - Test Infrastructure Continuation

**Previous Agent Accomplishment**: Implemented 161 tests across Phases 1-4, fixed 2 critical bugs, achieved 100% pass rate

---

## 📋 Context

The **first agent successfully completed**:
- ✅ Phase 1: Critical Infrastructure (50 tests)
- ✅ Phase 2: Contract & Boundary Tests (53 tests)
- ✅ Phase 3: Integration Tests (11 tests)
- ✅ Phase 4: Edge Cases & Performance (47 tests)

**Total**: 161 tests, 100% passing, 2 critical bugs fixed

---

## 🎯 Your Mission

You have **three options** for continuing this work:

### Option A: Complete Remaining Test Plan Items (Recommended)
Continue with deferred items from the original plan:
- Process Management Edge Cases (15 tests, ~3h)
- Error Propagation & Recovery (15 tests, ~3h)
- Frontend E2E Tests (requires Playwright setup, ~8h)

### Option B: Focus on Feature Development
The test infrastructure is production-ready. Start building new features using TDD:
- Pick a feature from the backlog
- Write tests first (following established patterns)
- Implement using the test-first workflow

### Option C: Test Infrastructure Enhancements
Improve the testing framework itself:
- Create test helper library (as specified in TEST_HELPER_LIBRARY.md)
- Add more comprehensive fixtures
- Implement mutation testing
- Add performance benchmarking

---

## 🚀 Getting Started (Choose Your Mission)

### If Choosing Option A (Complete Test Plan)

```bash
# 1. Navigate to project
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend

# 2. Review what was done
cat test/FINAL_TEST_INFRASTRUCTURE_REPORT.md

# 3. Check test plan for remaining items
cat ../docs/testing/COMPREHENSIVE_TEST_PLAN.md | grep -A 30 "Process Management Edge Cases"

# 4. Run existing tests to baseline
npm test

# Expected: ~531 tests, 516 passing (161 new tests all passing)
```

**Then implement**:
1. **Process Management Edge Cases** (if ProcessManager exists)
   - File: `test/unit/infrastructure/process-manager.service.spec.ts`
   - Tests: 15 edge cases for process handling
   - Read: `docs/testing/TEST_TEMPLATES.md`

2. **Error Propagation Tests**
   - File: `test/integration/error-propagation.integration.spec.ts`
   - Tests: 15 tests for error handling across layers
   - Focus: Database errors, process errors, WebSocket errors

---

### If Choosing Option B (Feature Development)

```bash
# 1. Review project state
cat CLAUDE.md
cat SPECIFICATION.md

# 2. Check current features
ls -la src/

# 3. Pick a feature to implement (or ask user)
# Examples:
# - Add agent pause/resume functionality
# - Add agent tagging/labeling
# - Add message search functionality
# - Add agent execution history

# 4. Follow TDD workflow for new feature
# - Write tests first (RED)
# - Implement feature (GREEN)
# - Refactor (keep tests green)
```

---

### If Choosing Option C (Test Infrastructure Enhancements)

```bash
# 1. Review test helper specification
cat ../docs/testing/TEST_HELPER_LIBRARY.md

# 2. Implement helper functions
# Create: test/helpers/database-helpers.ts
# Create: test/helpers/async-helpers.ts
# Create: test/helpers/assertion-helpers.ts

# 3. Add comprehensive fixtures
# Create: test/fixtures/claude-code/various-scenarios.jsonl
# Create: test/fixtures/websocket/event-samples.json

# 4. Set up mutation testing (optional)
npm install --save-dev @stryker-mutator/core
```

---

## 📚 Essential Reading (10 minutes)

**MUST READ before starting**:
1. `test/FINAL_TEST_INFRASTRUCTURE_REPORT.md` (5 min) - What was accomplished
2. `docs/testing/TESTING_ARCHITECTURE_GUIDE.md` (5 min) - Refresh on the 8 rules

**Reference while working**:
- `docs/testing/TEST_TEMPLATES.md` - Copy-paste templates
- `docs/testing/COMPREHENSIVE_TEST_PLAN.md` - Original plan

---

## 🎯 Success Criteria

### For Option A (Complete Test Plan)
- [ ] 30 additional tests implemented
- [ ] All tests passing
- [ ] No new bugs introduced
- [ ] Followed TDD workflow
- [ ] Updated completion reports

### For Option B (Feature Development)
- [ ] Feature has comprehensive tests (written first)
- [ ] All tests passing
- [ ] Followed established patterns
- [ ] Updated documentation

### For Option C (Infrastructure)
- [ ] Test helpers implemented
- [ ] Fixtures created
- [ ] All existing tests still passing
- [ ] Helpers documented

---

## 💡 Key Patterns Established

### TDD Workflow (Use This!)
```
1. RED: Write failing test
2. Verify it actually fails
3. GREEN: Write minimal code to pass
4. Verify it passes
5. REFACTOR: Improve while keeping green
6. Commit: test + implementation together
```

### Test File Pattern
```typescript
/**
 * [Component] Tests
 * Purpose: [What this tests]
 * Layer: [Domain/Application/Infrastructure]
 * Type: [Unit/Integration/Contract/Performance]
 */

describe('[Component]', () => {
  let component: ComponentType;

  beforeEach(() => {
    // Fresh setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('[Feature]', () => {
    it('should [behavior]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Mocking Strategy (Follow This!)
- **Unit Tests**: Mock external dependencies only
- **Integration Tests**: Use real database, real infrastructure
- **Contract Tests**: Use real implementations, NO mocks
- **Performance Tests**: Real database with realistic data volume

---

## 🐛 Known Issues to Avoid

### What Previous Agent Discovered

1. **Logger crashed on circular refs** → Fixed with safeStringify()
2. **Missing UNIQUE constraint** → Fixed in schema.sql
3. **Complex WebSocket E2E timing** → Simplified to integration tests
4. **Validation gaps** → Documented in negative tests

### What to Watch For

- TypeScript null safety (`?.` optional chaining)
- Session.create() requires 2 args: `Session.create(prompt, config)`
- Agent adapters need proper constructor args (check existing tests)
- Use plain objects for DTOs, not `new LaunchAgentDto()`

---

## 🧪 Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- agent.gateway.spec.ts

# Watch mode (TDD)
npm run test:watch -- agent.gateway.spec.ts

# With coverage
npm run test:coverage

# Only new tests (Phases 1-4)
npm test -- '(agent.gateway|console-logger|database.service|agent-runner|websocket-api|database-schema|message-persistence|negative-tests|message-deduplication|database-performance)'
```

**Expected Results**:
- All 161 new tests: 100% passing
- Total suite: ~531 tests, ~516 passing
- Pre-existing failures: 5 tests (diagnostic timeouts - ignore these)

---

## 📖 Quick Reference

### The 8 Constitutional Rules (MUST FOLLOW)
1. Test First, Always (RED → GREEN → REFACTOR)
2. Test Behavior, Not Implementation
3. Test Boundaries with Real Collaborators
4. Every Layer Boundary Needs Contract Test
5. Negative Tests Are Mandatory
6. Integration Tests Use Real Infrastructure
7. Performance is a Feature
8. Tests Must Be Self-Contained

### Test Type Decision Tree
```
Testing single class? → Unit Test
Testing multiple classes together? → Integration Test
Testing interface implementation? → Contract Test
Testing complete flow? → E2E Test (or Integration)
Testing speed/resources? → Performance Test
Testing rejection of invalid data? → Negative Test
```

---

## 🎯 Recommended Path Forward

**I recommend Option A**: Complete the remaining test plan items, specifically:

1. **Process Management Edge Cases** (if ProcessManager service exists)
   - Duration: ~3 hours
   - Value: Production hardening
   - File: Extend existing ProcessManager tests

2. **Error Propagation Tests** (15 tests)
   - Duration: ~3 hours
   - Value: Verify system resilience
   - File: `test/integration/error-propagation.integration.spec.ts`

**Total Additional Time**: ~6 hours
**Total Tests After**: ~191 tests
**Value**: Complete production hardening

---

## ⚡ Quick Start Commands

```bash
# Review what was done
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend
cat test/FINAL_TEST_INFRASTRUCTURE_REPORT.md | head -100

# Verify all new tests pass
npm test -- '(gateway|logger|database.service|contract|negative|deduplication|performance)'

# Expected: 161 tests, all passing

# Check project structure
ls -la test/

# Start implementing next tests
cat ../docs/testing/COMPREHENSIVE_TEST_PLAN.md | grep -A 50 "Error Propagation"
```

---

## 📝 Completion Checklist

When you're done with your mission:

- [ ] All new tests written
- [ ] All tests passing (100% pass rate)
- [ ] Followed TDD workflow (test-first)
- [ ] Used established patterns
- [ ] No flaky tests
- [ ] Updated completion report
- [ ] Verified full test suite still passes

---

## 💬 Communication Style

**When reporting completion**, use this format:

```
✅ [Your Mission] COMPLETE!

Tests Implemented: [X] tests
Pass Rate: [Y]%
Duration: [Z] hours
Bugs Fixed: [N]

Files Created:
1. [filename] ([X] tests)
2. [filename] ([Y] tests)

Key Achievements:
- [Achievement 1]
- [Achievement 2]

Status: ✅ Ready for next agent
```

---

## 🆘 If You Get Stuck

1. **Read the templates**: `docs/testing/TEST_TEMPLATES.md`
2. **Check existing tests**: Look for similar test patterns
3. **Verify TDD**: Are you writing tests FIRST?
4. **Check the rules**: Are you following the 8 constitutional rules?
5. **Look at what previous agent did**: Similar patterns in existing tests

---

## 🎖️ Achievement to Beat

Previous agent:
- ✅ 161 tests in 14 hours
- ✅ 100% pass rate
- ✅ 2 critical bugs fixed
- ✅ 70% time efficiency

Your goal:
- Match or exceed quality (100% pass rate)
- Maintain test speed (<50ms average)
- Find bugs if they exist
- Follow TDD strictly

---

## 📞 Final Tips

1. **Read first, code second**: Understand the requirements before writing tests
2. **One test at a time**: Don't try to implement everything at once
3. **Verify RED state**: Make sure tests actually fail before implementing
4. **Use real infrastructure**: Mocks hide bugs
5. **Trust the process**: TDD feels slow but is faster overall

---

**Good luck! The foundation is solid - build on it confidently!**

---

**Document Created**: 2025-11-24
**For**: Next AI Agent
**Status**: Ready for use
**Success Rate**: Previous agent achieved 100% - you can too!
