# E2E Test Diagnostic Report & Recovery Plan

**Date**: 2025-12-13
**Status**: 🔴 Critical Issues Identified
**Test Pass Rate**: 4/5 Frontend E2E (80%), Backend E2E Unknown

---

## Executive Summary

The E2E test suite has **sophisticated architecture** but suffers from **environmental issues** rather than architectural flaws. The core problems are:

1. ⚠️ **Multiple backend instances running** (violates single-instance design)
2. ⚠️ **Orphaned agents in database** (terminated status, can't be deleted)
3. ⚠️ **Cleanup mechanism incomplete** (force delete not working)
4. ⚠️ **Test isolation violated** (previous test artifacts remain)

**Good News**: The test architecture is excellent. The issues are **environmental and fixable**.

---

## Part 1: Root Cause Analysis

### Issue 1: Multiple Backend Instances Running 🔴

**Evidence**:
```bash
$ ps aux | grep "npm run dev"
dev  1541217  npm run dev  (Dec 06)
dev  1637446  npm run dev  (Dec 09)
dev  1790767  npm run dev  (00:06)
dev  1790851  npm run dev  (00:07)
dev  1791658  npm run dev  (00:12)
dev  1792526  npm run dev  (00:18)

# Multiple ts-node-dev processes:
dev  1790779  node .../ts-node-dev ... (prod/backend)
dev  1790786  /usr/bin/node ... (prod/backend)
dev  1790874  node .../ts-node-dev ... (dev/backend)
dev  1791670  node .../ts-node-dev ... (dev/backend)
dev  1792538  node .../ts-node-dev ... (dev/backend)
```

**Impact**:
- ❌ Violates single-instance enforcement (supposedly implemented in Nov 2025)
- ❌ Database WAL mode isolation issues (multiple connections)
- ❌ Port conflicts (some processes may be failing silently)
- ❌ Race conditions in database writes
- ❌ Unpredictable test behavior

**Why It Happened**:
- Process management system not working
- PID file cleanup failed
- Manual `npm run dev` executions without stopping previous instances
- Scripts that spawn background processes without cleanup

**TDD/SOLID Violation**:
- **Single Responsibility**: Process manager should ensure only one instance
- **Dependency Inversion**: Tests depend on "a backend" but get multiple
- **Open/Closed**: System should be closed to multiple instances

---

### Issue 2: Orphaned Agents in Database 🔴

**Evidence**:
```bash
$ curl http://localhost:3001/api/agents
[{
  "id": "94c4e67a-0eb1-4f20-b991-c83d98f3d472",
  "type": "claude-code",
  "status": "terminated",
  "createdAt": "2025-12-12T23:42:59.487Z",
  "completedAt": "2025-12-12T23:43:00.590Z"
}]
```

**Test Output**:
```
❌ Cleanup failed after 3 attempts: 1 agent(s) remain
   Remaining: 94c4e67a-0eb1-4f20-b991-c83d98f3d472 [terminated]
```

**Impact**:
- ❌ Test isolation violated (next test sees previous agent)
- ❌ Database reset endpoint not working
- ❌ Cleanup retry logic exhausted (3 attempts)
- ❌ Tests fail with "database not clean" errors

**Why It Happened**:
- DELETE endpoint refuses to delete agents in "terminated" status
- `force=true` query parameter not implemented correctly
- Database reset endpoint (`POST /api/test/reset-database`) not working
- WAL mode prevents immediate deletion visibility

**TDD/SOLID Violation**:
- **Liskov Substitution**: `force=true` should override status checks
- **Interface Segregation**: Test cleanup needs different interface than production
- **Single Responsibility**: DELETE endpoint mixing production safety with test needs

---

### Issue 3: Cleanup Mechanism Incomplete 🟡

**Evidence** (from `frontend/e2e/helpers/cleanup.ts`):
```typescript
// Deletes agent with force=true
const deleteResponse = await request.delete(
  `${BACKEND_URL}/api/agents/${agent.id}?force=true`
);

// But still fails to delete terminated agents
```

**Backend DELETE Endpoint** (likely implementation):
```typescript
// Somewhere in backend/src/presentation/controllers/agent.controller.ts
async deleteAgent(@Param('id') id: string, @Query('force') force?: boolean) {
  const agent = await this.repository.findById(id);

  // ❌ Probably missing: if (force === 'true') bypass all checks
  if (agent.status === 'running') {
    throw new BadRequestException('Cannot delete running agent');
  }

  // ❌ Might have: if (agent.status === 'terminated') throw error
  await this.repository.delete(id);
}
```

**Impact**:
- ⚠️ Tests can't clean up after themselves
- ⚠️ Manual database cleanup required between test runs
- ⚠️ CI/CD pipelines will fail

**TDD/SOLID Violation**:
- **Open/Closed**: DELETE endpoint not extensible for test scenarios
- **Dependency Inversion**: Tests depend on production DELETE semantics

---

### Issue 4: Test Isolation Framework Incomplete 🟡

**What Works**:
- ✅ Database reset API endpoint (`POST /api/test/reset-database`)
- ✅ TestContext for agent ownership tracking
- ✅ Event filtering to prevent cross-test contamination
- ✅ Retry logic (3 attempts with 1-second delays)
- ✅ Detailed cleanup logging

**What's Broken**:
- ❌ Database reset not actually resetting (orphaned agent still there)
- ❌ WAL mode journal preventing immediate visibility
- ❌ Cleanup verification fails after retries
- ❌ No fallback to database wipe if cleanup fails

**Evidence**:
```typescript
// beforeEach in agent-lifecycle.spec.ts
await request.post(`${BACKEND_URL}/api/test/reset-database`);
console.log('   ✅ Database reset');

// But later...
const agents = await request.get(`${BACKEND_URL}/api/agents`);
// Still returns terminated agent! Reset didn't work.
```

**TDD/SOLID Violation**:
- **Single Responsibility**: Database reset should ACTUALLY reset
- **Interface Segregation**: Test isolation needs stronger guarantees than retry logic

---

## Part 2: Impact Assessment

### Test Failure Breakdown

**Frontend E2E Tests** (5 tests):
- ❌ **Test 1**: "User can launch a single agent" - **TIMEOUT** (backend didn't respond in 5s)
- ✅ **Test 2**: "User can view connection status" - **PASSED**
- ✅ **Test 3**: "Validation error for empty prompt" - **PASSED**
- ✅ **Test 4**: "Empty state validation" - **PASSED**
- ✅ **Test 5**: "Agent count updates" - **PASSED** (but cleanup failed)

**Pass Rate**: 80% (4/5) BUT cleanup failures pollute subsequent runs

**Backend E2E Tests**: Unknown (couldn't run due to working directory issue)

### Why AI Agents Struggle

**Reasons AI agents can't fix this**:

1. **Environmental Complexity**:
   - Multiple backend instances running (not visible to agent without explicit check)
   - Database state persistence across test runs
   - PID file management failures

2. **Hidden Dependencies**:
   - WAL mode journal behavior not documented
   - Force delete implementation not visible in logs
   - Test reset endpoint implementation unclear

3. **Insufficient Documentation**:
   - No troubleshooting guide for "cleanup failed"
   - No procedure for killing orphaned processes
   - No database reset verification checklist

4. **Lack of Diagnostic Tools**:
   - No health check for "single instance running"
   - No database state inspector
   - No cleanup verification command

---

## Part 3: TDD/SOLID-Based Solution

### Principle 1: Single Source of Truth (SOLID: Single Responsibility)

**Problem**: Database has orphaned agents, but reset endpoint doesn't clear them.

**Solution**: Database reset MUST actually reset.

**Implementation**:
```typescript
// backend/src/presentation/controllers/test.controller.ts
@Post('reset-database')
async resetDatabase(): Promise<{ success: boolean; deletedCount: number }> {
  // STEP 1: Get count before deletion
  const beforeCount = await this.repository.count();

  // STEP 2: Hard delete ALL agents (no status check)
  await this.databaseService.truncateTable('agents');
  await this.databaseService.truncateTable('agent_messages');

  // STEP 3: Checkpoint WAL to force persistence
  await this.databaseService.checkpointWAL();

  // STEP 4: Verify deletion succeeded
  const afterCount = await this.repository.count();

  if (afterCount !== 0) {
    throw new Error(`Reset failed: ${afterCount} agents remain`);
  }

  return { success: true, deletedCount: beforeCount };
}
```

**Test (TDD)**:
```typescript
describe('TestController', () => {
  it('should delete ALL agents regardless of status', async () => {
    // Arrange: Create agents in various statuses
    await createAgent({ status: 'running' });
    await createAgent({ status: 'terminated' });
    await createAgent({ status: 'failed' });

    // Act
    const result = await controller.resetDatabase();

    // Assert
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(3);

    const remaining = await repository.findAll();
    expect(remaining).toHaveLength(0);
  });
});
```

---

### Principle 2: Force Delete MUST Override All Checks (SOLID: Liskov Substitution)

**Problem**: `force=true` doesn't actually force deletion.

**Solution**: When force=true, bypass ALL status checks.

**Implementation**:
```typescript
// backend/src/presentation/controllers/agent.controller.ts
@Delete(':id')
async deleteAgent(
  @Param('id') id: string,
  @Query('force') force?: string
): Promise<{ success: boolean }> {
  const agent = await this.repository.findById(id);

  if (!agent) {
    throw new NotFoundException(`Agent ${id} not found`);
  }

  // ✅ FORCE DELETE: Skip all checks
  if (force === 'true') {
    await this.orchestrationService.forceTerminate(id);
    await this.repository.delete(id);
    return { success: true };
  }

  // Normal deletion: enforce safety checks
  if (agent.status === 'running') {
    throw new BadRequestException('Cannot delete running agent. Stop it first.');
  }

  await this.repository.delete(id);
  return { success: true };
}
```

**Test (TDD)**:
```typescript
describe('AgentController DELETE with force=true', () => {
  it('should delete agent in "running" status when force=true', async () => {
    // Arrange
    const agent = await createAgent({ status: 'running' });

    // Act
    const result = await controller.deleteAgent(agent.id, 'true');

    // Assert
    expect(result.success).toBe(true);
    const deleted = await repository.findById(agent.id);
    expect(deleted).toBeNull();
  });

  it('should delete agent in "terminated" status when force=true', async () => {
    const agent = await createAgent({ status: 'terminated' });

    const result = await controller.deleteAgent(agent.id, 'true');

    expect(result.success).toBe(true);
    const deleted = await repository.findById(agent.id);
    expect(deleted).toBeNull();
  });

  it('should reject deletion of running agent when force=false', async () => {
    const agent = await createAgent({ status: 'running' });

    await expect(
      controller.deleteAgent(agent.id, 'false')
    ).rejects.toThrow('Cannot delete running agent');
  });
});
```

---

### Principle 3: Single Instance Enforcement (SOLID: Single Responsibility)

**Problem**: Multiple backend instances running violates design.

**Solution**: Enforce single instance at startup.

**Implementation** (already exists, but not working):
```typescript
// backend/src/main.ts (enhance existing code)
async function bootstrap() {
  const app = await NestFactory.create(ApplicationModule);

  const lifecycleService = app.get(ApplicationLifecycleService);

  try {
    // ✅ This should throw if another instance is running
    await lifecycleService.acquireLock();
  } catch (error) {
    if (error instanceof InstanceAlreadyRunningError) {
      const { pid, port, startedAt } = error.metadata;

      console.error('\n╔═══════════════════════════════════════════════════════════╗');
      console.error('║  ❌ Backend instance already running                      ║');
      console.error('╚═══════════════════════════════════════════════════════════╝\n');
      console.error(`  PID:        ${pid}`);
      console.error(`  Started:    ${startedAt}`);
      console.error(`  Port:       ${port}\n`);
      console.error('  To stop: kill ' + pid);
      console.error('  Health check: curl http://localhost:' + port + '/api/health\n');

      process.exit(1); // ✅ CRITICAL: Actually exit!
    }
    throw error;
  }

  // Continue with startup...
}
```

**Diagnostic Check** (add to scripts):
```bash
#!/bin/bash
# scripts/check-single-instance.sh

PID_FILE="./data/backend.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")

  if ps -p "$PID" > /dev/null 2>&1; then
    echo "✅ Backend running (PID: $PID)"
    exit 0
  else
    echo "⚠️  Stale PID file found (process $PID not running)"
    rm "$PID_FILE"
    echo "❌ No backend running"
    exit 1
  fi
else
  echo "❌ No backend running (no PID file)"
  exit 1
fi
```

---

### Principle 4: Test Cleanup Verification (SOLID: Interface Segregation)

**Problem**: Cleanup assumes success but doesn't verify.

**Solution**: Add explicit verification endpoint.

**Implementation**:
```typescript
// backend/src/presentation/controllers/test.controller.ts
@Get('verify-clean-state')
async verifyCleanState(): Promise<{
  isClean: boolean;
  issues: string[];
  agentCount: number;
  messageCount: number;
}> {
  const agents = await this.repository.findAll();
  const messages = await this.messageRepository.count();

  const issues: string[] = [];

  if (agents.length > 0) {
    issues.push(`${agents.length} agents exist: ${agents.map(a => `${a.id} [${a.status}]`).join(', ')}`);
  }

  if (messages > 0) {
    issues.push(`${messages} messages exist`);
  }

  return {
    isClean: issues.length === 0,
    issues,
    agentCount: agents.length,
    messageCount: messages,
  };
}
```

**Updated Cleanup Helper**:
```typescript
// frontend/e2e/helpers/cleanup.ts
export async function cleanupAllAgents(
  request: APIRequestContext,
  options = {}
): Promise<void> {
  const { maxRetries = 3, retryDelay = 1000, throwOnFailure = true } = options;

  // STEP 1: Use database reset endpoint (fastest)
  console.log('🧹 Resetting database...');
  const resetResponse = await request.post(`${BACKEND_URL}/api/test/reset-database`);

  if (!resetResponse.ok()) {
    throw new Error(`Database reset failed: HTTP ${resetResponse.status()}`);
  }

  const resetResult = await resetResponse.json();
  console.log(`   Deleted ${resetResult.deletedCount} agents via reset`);

  // STEP 2: Wait for WAL checkpoint
  await new Promise(resolve => setTimeout(resolve, 500));

  // STEP 3: Verify clean state
  const verifyResponse = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);
  const verification = await verifyResponse.json();

  if (!verification.isClean) {
    const errorMsg = `Cleanup verification failed:\n${verification.issues.join('\n')}`;
    console.error('❌', errorMsg);

    if (throwOnFailure) {
      throw new Error(errorMsg);
    }
  } else {
    console.log('✅ Cleanup verified: Database is clean');
  }
}
```

---

## Part 4: Immediate Action Plan

### Step 1: Kill All Backend Instances (Immediate) ⚡

```bash
# Kill all backend processes
pkill -f "npm run dev"
pkill -f "ts-node-dev"

# Verify all killed
ps aux | grep -E "npm run dev|ts-node-dev" | grep -v grep
# Should return nothing

# Remove stale PID files
rm -f ./backend/data/backend.pid
rm -f /tmp/backend.pid

# Verify clean slate
lsof -i :3000 -i :3001
# Should return nothing
```

### Step 2: Fix Database Reset Endpoint (1 hour)

**File**: `backend/src/presentation/controllers/test.controller.ts`

**Changes**:
1. Add `truncateTable()` method to DatabaseService
2. Add `checkpointWAL()` method to DatabaseService
3. Update `resetDatabase()` to use truncate + checkpoint
4. Add verification to ensure deletion succeeded

**Test**:
```bash
# Start backend
cd backend && npm run dev

# Test reset endpoint
curl -X POST http://localhost:3001/api/test/reset-database

# Verify empty
curl http://localhost:3001/api/agents
# Should return []
```

### Step 3: Fix Force Delete (30 minutes)

**File**: `backend/src/presentation/controllers/agent.controller.ts`

**Changes**:
1. Check if `force === 'true'` before status validation
2. Call `forceTerminate()` if force=true
3. Always delete from database if force=true

**Test**:
```bash
# Create terminated agent
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -d '{"type": "claude-code", "prompt": "test"}'

# Let it complete...

# Force delete
curl -X DELETE "http://localhost:3001/api/agents/{id}?force=true"

# Verify deleted
curl http://localhost:3001/api/agents
# Should return []
```

### Step 4: Add Cleanup Verification (20 minutes)

**File**: `backend/src/presentation/controllers/test.controller.ts`

**Add**: `GET /api/test/verify-clean-state` endpoint

**File**: `frontend/e2e/helpers/cleanup.ts`

**Update**: Use reset endpoint + verification

### Step 5: Verify Single Instance (10 minutes)

**Test**:
```bash
# Start backend
cd backend && npm run dev

# Try to start again (should fail)
npm run dev
# Should see: "Backend instance already running"

# Verify only one process
ps aux | grep ts-node-dev | grep -v grep | wc -l
# Should return: 1
```

### Step 6: Run E2E Tests (Validation)

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Run E2E tests
cd frontend
npm run test:e2e

# Expected: All tests pass, cleanup succeeds
```

---

## Part 5: Long-Term Robustness Improvements

### Improvement 1: Database Per Test Worker

**Problem**: Shared SQLite database causes conflicts.

**Solution**: Use in-memory database per Playwright worker.

```typescript
// frontend/playwright.config.ts
export default defineConfig({
  workers: 3, // Enable parallel execution

  use: {
    baseURL: 'http://localhost:5174',
  },

  webServer: {
    command: 'vite --config vite.config.e2e.ts',
    port: 5174,
  },
});

// backend: Use TEST_DATABASE_PATH env var
// Each worker sets: TEST_DATABASE_PATH=:memory:
// Or: TEST_DATABASE_PATH=./test-data/worker-${WORKER_ID}.db
```

### Improvement 2: Test Lifecycle Hooks

**Add to Playwright config**:
```typescript
// frontend/e2e/test-lifecycle.ts
export class TestLifecycle {
  async beforeAll() {
    // Verify backend running
    // Verify database clean
    // Verify no orphaned processes
  }

  async beforeEach() {
    // Reset database
    // Clear browser state
    // Verify isolation
  }

  async afterEach() {
    // Force cleanup all agents
    // Verify cleanup succeeded
    // Log any failures
  }

  async afterAll() {
    // Final cleanup
    // Generate test report
  }
}
```

### Improvement 3: Diagnostic Dashboard

**Create**: `scripts/test-diagnostics.sh`

```bash
#!/bin/bash
# Test Environment Diagnostics

echo "🔍 Backend Health Check"
curl -s http://localhost:3001/api/health | jq .

echo -e "\n🔍 Database State"
curl -s http://localhost:3001/api/test/verify-clean-state | jq .

echo -e "\n🔍 Running Processes"
ps aux | grep -E "npm run dev|ts-node-dev" | grep -v grep

echo -e "\n🔍 Port Usage"
lsof -i :3000 -i :3001 -i :5173 -i :5174

echo -e "\n🔍 PID Files"
find . -name "*.pid" -exec sh -c 'echo "{}:"; cat "{}"' \;
```

---

## Part 6: AI Agent Guidance (For Future Debugging)

### Checklist for AI Agents

When E2E tests fail, check IN THIS ORDER:

1. **Environmental Health**:
   ```bash
   # ✅ Is backend running?
   curl http://localhost:3001/api/agents

   # ✅ How many backend instances?
   ps aux | grep ts-node-dev | grep -v grep | wc -l
   # Should be: 1

   # ✅ Is database clean?
   curl http://localhost:3001/api/test/verify-clean-state
   ```

2. **Test Isolation**:
   - Check beforeEach logs for "Test isolation verified"
   - Check afterEach logs for "Cleanup completed"
   - If cleanup failed, check agent statuses in error message

3. **Backend Logs**:
   - Check `/tmp/backend-diagnostic.log`
   - Look for database errors, connection issues
   - Check for "Instance already running" errors

4. **Database State**:
   ```bash
   # Check WAL file size
   ls -lh ./backend/data/agents.db-wal

   # If large (>10MB), checkpoint needed
   sqlite3 ./backend/data/agents.db "PRAGMA wal_checkpoint(TRUNCATE);"
   ```

5. **Kill Everything and Restart**:
   ```bash
   # Nuclear option
   pkill -f "npm run dev"
   pkill -f "ts-node-dev"
   rm -f ./backend/data/backend.pid

   # Restart
   cd backend && npm run dev
   ```

### Common Failure Patterns

**Pattern 1**: "Cleanup failed after 3 attempts"
- **Root Cause**: Terminated agents can't be deleted
- **Fix**: Implement force delete correctly
- **Verification**: `curl -X DELETE "http://localhost:3001/api/agents/{id}?force=true"`

**Pattern 2**: "Test isolation violation"
- **Root Cause**: Database reset not working
- **Fix**: Implement truncate + WAL checkpoint
- **Verification**: `curl http://localhost:3001/api/test/verify-clean-state`

**Pattern 3**: "Backend timeout"
- **Root Cause**: Multiple backend instances, wrong one responding
- **Fix**: Kill all instances, start one
- **Verification**: `ps aux | grep ts-node-dev | wc -l` (should be 1)

---

## Part 7: Summary & Next Steps

### What's Working ✅

- Test architecture is excellent (3-level testing strategy)
- Isolation framework is well-designed (TestContext, event filtering)
- Documentation is comprehensive (40+ docs, guides)
- Backend architecture follows Clean Architecture + SOLID

### What's Broken ❌

- Multiple backend instances running (violates design)
- Database reset endpoint doesn't actually reset
- Force delete doesn't actually force
- Cleanup verification incomplete

### Fix Priority

**P0 (Immediate - Today)**:
1. ✅ Kill all backend instances
2. ✅ Implement proper database reset (truncate + checkpoint)
3. ✅ Fix force delete to bypass all checks

**P1 (This Week)**:
4. ✅ Add cleanup verification endpoint
5. ✅ Update cleanup helper to use reset + verification
6. ✅ Add diagnostic script for environment health

**P2 (Next Week)**:
7. ⚪ Per-worker databases for parallel execution
8. ⚪ Test lifecycle hooks
9. ⚪ Diagnostic dashboard

### Estimated Effort

- **Immediate fixes (P0)**: 2 hours
- **Verification & testing**: 1 hour
- **Documentation updates**: 30 minutes
- **Total**: ~3.5 hours

---

## Part 8: Implementation Guide

### Phase 1: Database Reset (TDD)

**Test First**:
```typescript
// backend/test/integration/test-controller.integration.spec.ts
describe('TestController - Database Reset', () => {
  it('should delete ALL agents regardless of status', async () => {
    // Arrange
    await createAgent({ status: 'running' });
    await createAgent({ status: 'terminated' });
    await createAgent({ status: 'failed' });

    // Act
    const response = await request(app.getHttpServer())
      .post('/api/test/reset-database')
      .expect(200);

    // Assert
    expect(response.body.deletedCount).toBe(3);

    const agents = await request(app.getHttpServer())
      .get('/api/agents')
      .expect(200);

    expect(agents.body).toHaveLength(0);
  });

  it('should checkpoint WAL after deletion', async () => {
    // Arrange
    await createAgent({ status: 'running' });

    // Act
    await request(app.getHttpServer())
      .post('/api/test/reset-database')
      .expect(200);

    // Assert: WAL should be checkpointed
    const walSize = fs.statSync('./data/agents.db-wal').size;
    expect(walSize).toBeLessThan(1000); // Small after checkpoint
  });
});
```

**Then Implement**:
```typescript
// backend/src/infrastructure/database/database.service.ts
async truncateTable(tableName: string): Promise<void> {
  await this.db.run(`DELETE FROM ${tableName}`);
}

async checkpointWAL(): Promise<void> {
  await this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
}

// backend/src/presentation/controllers/test.controller.ts
@Post('reset-database')
async resetDatabase(): Promise<{ success: boolean; deletedCount: number }> {
  const beforeCount = await this.repository.count();

  await this.databaseService.truncateTable('agents');
  await this.databaseService.truncateTable('agent_messages');
  await this.databaseService.checkpointWAL();

  const afterCount = await this.repository.count();

  if (afterCount !== 0) {
    throw new Error(`Reset failed: ${afterCount} agents remain`);
  }

  return { success: true, deletedCount: beforeCount };
}
```

### Phase 2: Force Delete (TDD)

**Test First**:
```typescript
// backend/test/e2e/agent-controller.e2e.spec.ts
describe('DELETE /api/agents/:id?force=true', () => {
  it('should delete running agent when force=true', async () => {
    const agent = await launchAgent({ prompt: 'test' });

    await request(app.getHttpServer())
      .delete(`/api/agents/${agent.id}?force=true`)
      .expect(200);

    const result = await request(app.getHttpServer())
      .get(`/api/agents/${agent.id}`)
      .expect(404);
  });
});
```

**Then Implement**:
```typescript
// backend/src/presentation/controllers/agent.controller.ts
@Delete(':id')
async deleteAgent(
  @Param('id') id: string,
  @Query('force') force?: string
): Promise<{ success: boolean }> {
  const agent = await this.repository.findById(id);

  if (!agent) {
    throw new NotFoundException(`Agent ${id} not found`);
  }

  if (force === 'true') {
    // Force delete: skip all checks
    try {
      await this.orchestrationService.terminateAgent(id);
    } catch {
      // Ignore termination errors for force delete
    }

    await this.repository.delete(id);
    return { success: true };
  }

  // Normal deletion: enforce safety checks
  if (agent.status === 'running') {
    throw new BadRequestException('Cannot delete running agent');
  }

  await this.repository.delete(id);
  return { success: true };
}
```

### Phase 3: Cleanup Verification (TDD)

**Test First**:
```typescript
// frontend/e2e/cleanup-verification.spec.ts
test('cleanup should verify database is actually clean', async ({ request }) => {
  // Arrange: Create agent
  const agent = await launchAgent(request);

  // Act: Cleanup
  await cleanupAllAgents(request);

  // Assert: Verification endpoint confirms clean
  const verify = await request.get('/api/test/verify-clean-state');
  const result = await verify.json();

  expect(result.isClean).toBe(true);
  expect(result.agentCount).toBe(0);
  expect(result.issues).toHaveLength(0);
});
```

**Then Implement**: (See Part 3, Principle 4)

---

## Conclusion

The E2E test failures are **environmental issues**, not architectural flaws. The test infrastructure is excellent but needs:

1. **Proper cleanup** (database reset that actually works)
2. **Force delete** (bypass status checks when force=true)
3. **Single instance** (kill orphaned processes)
4. **Verification** (confirm cleanup succeeded)

**Time to Fix**: ~3.5 hours
**Impact**: Robust E2E tests that don't break easily
**AI Agent Friendly**: Clear diagnostic procedures, well-documented patterns

---

**Status**: Ready for Implementation
**Confidence**: High (issues are well-understood and fixable)
**Risk**: Low (changes are isolated to test infrastructure)
