# Test Cleanup Architecture Implementation

## Executive Summary

This document outlines the design and implementation of a robust test cleanup architecture that guarantees clean state between E2E tests through synchronous verification, force mechanisms, and comprehensive cleanup tracking.

---

## Part 1: Current Issues Analysis

### Critical Issues Found

#### 1. **DELETE Endpoint Doesn't Actually Delete from Database** ❌
**Location**: `backend/src/presentation/controllers/agent.controller.ts:198-239`

**Current Behavior**:
- `DELETE /api/agents/:id` calls `terminateAgent()`
- `terminateAgent()` marks agent as "terminated" status
- Agent record **remains in database** with status=`terminated`
- Repository has a `delete()` method but it's **never called**

**Impact**: Tests accumulate agents in database, causing interference.

**Evidence**:
```typescript
// agent.controller.ts:220
await this.orchestrationService.terminateAgent(agentId);

// agent-orchestration.service.ts:251-277
async terminateAgent(agentId: AgentId): Promise<void> {
  const agent = await this.agentRepository.findById(agentId);
  await runner.stop(agentId);
  agent.markAsTerminated();  // ❌ Just changes status!
  await this.agentRepository.save(agent);  // ❌ Saves "terminated" agent
  // ❌ NEVER calls repository.delete()!
}
```

#### 2. **No Verification That Cleanup Succeeded** ❌
**Location**: `frontend/e2e/helpers/cleanup.ts:16-65`

**Current Behavior**:
- Cleanup calls `DELETE` for each agent
- Waits arbitrary 1500ms
- Checks if agents remain, but only logs warning (doesn't fail)
- No retry mechanism if cleanup incomplete

**Impact**: Flaky tests due to race conditions.

**Evidence**:
```typescript
// cleanup.ts:45-60
await new Promise(resolve => setTimeout(resolve, 1500)); // ❌ Arbitrary wait
const remainingAgents = await verifyResponse.json();
if (remainingAgents.length === 0) {
  console.log(`✅ Cleanup verified`);
} else {
  console.warn(`⚠️ Cleanup incomplete`); // ❌ Only warns, doesn't retry!
}
```

#### 3. **Race Between DELETE API Call and Actual Cleanup** ❌
**Location**: `backend/src/infrastructure/adapters/claude-python-proxy.adapter.ts:119-158`

**Current Behavior**:
- `runner.stop()` aborts HTTP stream and calls Python `/agent/stop/` endpoint
- Python proxy terminates subprocess
- **BUT**: There's no synchronous wait for process to fully exit
- The `stop()` method returns immediately after initiating termination

**Impact**: Agent processes may still be running when next test starts.

**Evidence**:
```typescript
// claude-python-proxy.adapter.ts:119-158
async stop(agentId: AgentId): Promise<void> {
  agentInfo.abortController.abort();  // ✅ Aborts stream

  await fetch(`${this.proxyUrl}/agent/stop/${pythonAgentId}`, {
    method: 'POST',  // ❌ Fire and forget, doesn't wait for termination
  });

  this.runningAgents.delete(id);  // ❌ Immediately removes from map
  // ❌ No verification that process actually exited!
}
```

#### 4. **Agent Completion Doesn't Clean Up Runner Storage** ⚠️
**Location**: `backend/src/application/services/streaming.service.ts:289-319`

**Current Behavior**:
- When agent completes naturally via `onComplete()`, status is saved to DB
- **BUT**: `runnerStorage` in orchestration service is NOT cleaned up
- Only `terminateAgent()` removes from `runnerStorage` (line 273)

**Impact**: Memory leak - completed agents never removed from memory.

**Evidence**:
```typescript
// streaming.service.ts:289-305
async broadcastComplete(agentId: AgentId, result: AgentResult): Promise<void> {
  const agent = await this.agentRepository.findById(agentId);
  agent.markAsCompleted();
  await this.agentRepository.save(agent);  // ✅ Saves to DB
  // ❌ But orchestrationService.runnerStorage still has entry!
}

// agent-orchestration.service.ts:273
this.runnerStorage.delete(agentId.toString()); // Only in terminateAgent()!
```

#### 5. **WebSocket Subscriptions Not Cleaned on Agent Completion** ⚠️
**Location**: `backend/src/application/services/streaming.service.ts:112-116`

**Current Behavior**:
- `unsubscribeFromAgent()` only happens when:
  - Client disconnects
  - Client manually unsubscribes
- **NOT** when agent completes/fails
- Subscriptions linger in memory even after agent is done

**Impact**: Memory leak + potential duplicate events on reuse.

#### 6. **Test Reset Endpoint Only Deletes from Database** ⚠️
**Location**: `backend/src/presentation/controllers/test.controller.ts:36-45`

**Current Behavior**:
```typescript
@Post('reset-database')
async resetDatabase(): Promise<void> {
  database.prepare('DELETE FROM agents').run();  // ✅ Deletes from DB
  // ❌ But doesn't:
  //    - Stop running processes
  //    - Clean up runnerStorage
  //    - Clean up streaming subscriptions
  //    - Wait for async operations
}
```

**Impact**: Database is clean but in-memory state is polluted.

### Summary of Issues

| Issue | Severity | Impact on Tests |
|-------|----------|----------------|
| DELETE doesn't actually delete from DB | 🔴 Critical | Agents accumulate, slow queries, FK violations |
| No verification of cleanup success | 🔴 Critical | Flaky tests, race conditions |
| No synchronous wait for process exit | 🟡 High | Process leaks, port conflicts |
| Completed agents leak memory | 🟡 High | Memory grows, OOM in long test runs |
| WebSocket subscriptions leak | 🟠 Medium | Memory leak, potential duplicate events |
| Reset endpoint incomplete | 🟡 High | Tests start with polluted in-memory state |

---

## Part 2: Robust Cleanup Architecture Design

### Design Principles

1. **SYNCHRONOUS CLEANUP**: Every async operation MUST be awaited
2. **VERIFICATION**: Confirm cleanup succeeded, don't assume
3. **FORCE MECHANISMS**: Fallback if graceful cleanup fails
4. **IDEMPOTENT**: Safe to run multiple times
5. **FAST**: Complete in <2 seconds (not <500ms - too aggressive)

### Components Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 Test Cleanup Architecture                   │
└─────────────────────────────────────────────────────────────┘

Frontend (E2E Tests)                Backend (NestJS)
┌────────────────────┐             ┌──────────────────────┐
│ TestCleanupManager │────HTTP────▶│ TestController       │
│  - cleanupAll()    │             │  - resetEnvironment()│
│  - verifyClean()   │             │  - forceCleanup()    │
│  - waitForCleanup()│             │  - getCleanupStatus()│
└────────────────────┘             └──────────────────────┘
         │                                   │
         │ Polls for verification            │ Orchestrates
         │                                   │
         ▼                                   ▼
┌────────────────────┐             ┌──────────────────────┐
│ Verification       │             │ CleanupOrchestrator  │
│  - No agents exist │             │  - Stop all agents   │
│  - No processes    │             │  - Clear DB          │
│  - DB clean        │             │  - Clear memory      │
└────────────────────┘             │  - Verify complete   │
                                   └──────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            ┌───────────────┐      ┌──────────────┐      ┌────────────────┐
            │ Agent Runner  │      │ Repository   │      │ Streaming Svc  │
            │  - stop()     │      │  - delete()  │      │  - cleanup()   │
            │  - waitExit() │      │  - truncate()│      │  - unsub all   │
            └───────────────┘      └──────────────┘      └────────────────┘
```

### Data Flow: Cleanup Sequence

```
1. Test calls cleanupAll()
   ↓
2. Frontend → POST /api/test/reset-environment?force=true&wait=true
   ↓
3. Backend CleanupOrchestrator:
   ├─ Get all agents from DB
   ├─ For each agent:
   │  ├─ Call runner.stop() → Terminates process
   │  ├─ Wait for process exit (with timeout)
   │  └─ Remove from runnerStorage
   ├─ Clear all streaming subscriptions
   ├─ DELETE FROM agents (CASCADE deletes messages)
   ├─ Verify DB empty
   └─ Return { success: true, cleanedCount: N }
   ↓
4. Frontend verifyClean():
   ├─ GET /api/agents → Should return []
   ├─ GET /api/test/cleanup-status → Verify state
   └─ Return true/false
   ↓
5. If verification fails:
   └─ Retry with force=true (killall processes, TRUNCATE tables)
```

---

## Part 3: Implementation Plan

### Phase 1: Backend - Domain Layer (TDD)

**New Value Objects:**
```typescript
// backend/src/domain/value-objects/cleanup-result.vo.ts
export class CleanupResult {
  readonly success: boolean;
  readonly cleanedAgentsCount: number;
  readonly cleanedMessagesCount: number;
  readonly duration: number;
  readonly errors: string[];

  static create(data): CleanupResult;
  static failed(errors: string[]): CleanupResult;
  hasErrors(): boolean;
}

// backend/src/domain/value-objects/cleanup-options.vo.ts
export class CleanupOptions {
  readonly force: boolean;         // Kill processes if graceful stop fails
  readonly waitForCompletion: boolean;  // Wait for all async ops
  readonly timeout: number;         // Max wait time (ms)
  readonly verifyClean: boolean;    // Verify DB empty after cleanup

  static create(options): CleanupOptions;
  static default(): CleanupOptions { force: false, wait: true, timeout: 10000, verify: true }
  static forceCleanup(): CleanupOptions { force: true, wait: true, timeout: 5000, verify: true }
}
```

**Tests (20+ tests)**:
- `cleanup-result.vo.spec.ts` (10 tests)
  - Create with valid data
  - Create failed result
  - hasErrors() detection
  - Immutability
  - Edge cases (0 agents, huge numbers)

- `cleanup-options.vo.spec.ts` (10 tests)
  - Create with custom options
  - Default options
  - Force cleanup options
  - Validation (negative timeout, etc.)
  - Immutability

### Phase 2: Backend - Application Layer (TDD)

**New Port:**
```typescript
// backend/src/application/ports/cleanup-orchestrator.port.ts
export interface ICleanupOrchestrator {
  /**
   * Clean up all agents and related resources
   * @param options - Cleanup configuration
   * @returns Result with counts and errors
   */
  cleanupAll(options: CleanupOptions): Promise<CleanupResult>;

  /**
   * Verify environment is clean
   * @returns true if no agents, processes, or subscriptions exist
   */
  verifyClean(): Promise<boolean>;

  /**
   * Get current cleanup status (for polling)
   */
  getStatus(): Promise<{
    agentCount: number;
    runningProcesses: number;
    activeSubscriptions: number;
  }>;
}
```

**New Service:**
```typescript
// backend/src/application/services/cleanup-orchestrator.service.ts
@Injectable()
export class CleanupOrchestratorService implements ICleanupOrchestrator {
  constructor(
    private readonly orchestrationService: AgentOrchestrationService,
    private readonly streamingService: StreamingService,
    private readonly agentRepository: IAgentRepository,
    private readonly messageRepository: IAgentMessageRepository,
    private readonly logger: ILogger,
  ) {}

  async cleanupAll(options: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // 1. Get all agents
    const agents = await this.agentRepository.findAll();
    const agentCount = agents.length;

    // 2. Stop each agent with timeout
    for (const agent of agents) {
      try {
        await this.stopAgentWithTimeout(agent, options);
      } catch (error) {
        errors.push(`Failed to stop ${agent.id}: ${error.message}`);
        if (!options.force) {
          throw error; // Fail fast unless force=true
        }
      }
    }

    // 3. Clear all streaming subscriptions
    this.streamingService.clearAllSubscriptions();

    // 4. Delete from database (CASCADE deletes messages)
    const messagesDeleted = await this.agentRepository.deleteAll();

    // 5. Verify if requested
    if (options.verifyClean) {
      const isClean = await this.verifyClean();
      if (!isClean) {
        errors.push('Verification failed: environment not clean');
      }
    }

    return CleanupResult.create({
      success: errors.length === 0,
      cleanedAgentsCount: agentCount,
      cleanedMessagesCount: messagesDeleted,
      duration: Date.now() - startTime,
      errors,
    });
  }

  private async stopAgentWithTimeout(
    agent: Agent,
    options: CleanupOptions
  ): Promise<void> {
    const timeoutMs = options.timeout;

    const stopPromise = this.orchestrationService.terminateAgent(agent.id);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );

    try {
      await Promise.race([stopPromise, timeoutPromise]);
    } catch (error) {
      if (options.force) {
        // Force kill via agent runner (send SIGKILL)
        await this.forceStopAgent(agent);
      } else {
        throw error;
      }
    }
  }

  async verifyClean(): Promise<boolean> {
    const agents = await this.agentRepository.findAll();
    const messages = await this.messageRepository.count();
    const subscriptions = this.streamingService.getActiveSubscriptionCount();

    return agents.length === 0 && messages === 0 && subscriptions === 0;
  }

  async getStatus() {
    const agents = await this.agentRepository.findAll();
    return {
      agentCount: agents.length,
      runningProcesses: this.orchestrationService.getRunnerCount(),
      activeSubscriptions: this.streamingService.getActiveSubscriptionCount(),
    };
  }
}
```

**Tests (30+ tests)**:
- `cleanup-orchestrator.service.spec.ts` (30 tests)
  - cleanupAll with 0 agents
  - cleanupAll with multiple agents
  - cleanupAll with force=false (fails on error)
  - cleanupAll with force=true (continues on error)
  - Stop timeout handling
  - Verification success/failure
  - Multiple cleanup calls (idempotent)
  - Concurrent cleanup calls
  - Error accumulation
  - Database cascade deletion

### Phase 3: Backend - Infrastructure Enhancements (TDD)

**Update Repository:**
```typescript
// backend/src/infrastructure/repositories/sqlite-agent.repository.ts
export class SqliteAgentRepository implements IAgentRepository {
  // ... existing methods ...

  /**
   * Delete ALL agents (for testing only!)
   * Returns count of messages deleted (CASCADE)
   */
  async deleteAll(): Promise<number> {
    const db = this.databaseService.getDatabase();

    // Count messages before delete (CASCADE will delete them)
    const { count } = db.prepare('SELECT COUNT(*) as count FROM agent_messages').get();

    // Delete all agents (CASCADE deletes messages)
    db.prepare('DELETE FROM agents').run();

    return count;
  }
}
```

**Update Streaming Service:**
```typescript
// backend/src/application/services/streaming.service.ts
export class StreamingService {
  // ... existing methods ...

  /**
   * Clear all subscriptions (for testing cleanup)
   */
  clearAllSubscriptions(): void {
    // Unsubscribe all observers
    for (const [agentKey, subscription] of this.subscriptions) {
      subscription.runner.unsubscribe(subscription.agentId, subscription.observer);
    }

    this.subscriptions.clear();
    this.clientSubscriptions.clear();

    this.logger.info('All subscriptions cleared');
  }

  /**
   * Get count of active subscriptions (for status check)
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
```

**Update Agent Orchestration:**
```typescript
// backend/src/application/services/agent-orchestration.service.ts
export class AgentOrchestrationService {
  // ... existing methods ...

  /**
   * Get count of active runners (for cleanup verification)
   */
  getRunnerCount(): number {
    return this.runnerStorage.size;
  }

  /**
   * ENHANCEMENT: Cleanup runner storage on completion
   * Called by StreamingService.broadcastComplete()
   */
  cleanupCompletedAgent(agentId: AgentId): void {
    this.runnerStorage.delete(agentId.toString());
    this.logger.log(`Cleaned up completed agent: ${agentId.toString()}`);
  }
}
```

**Tests (25+ tests)**:
- `sqlite-agent.repository.spec.ts` additions (5 tests)
  - deleteAll with 0 agents
  - deleteAll with agents + messages (verify CASCADE)
  - deleteAll returns correct message count
  - deleteAll is idempotent

- `streaming.service.spec.ts` additions (10 tests)
  - clearAllSubscriptions with 0 subscriptions
  - clearAllSubscriptions with multiple agents
  - clearAllSubscriptions unsubscribes observers
  - getActiveSubscriptionCount accuracy

- `agent-orchestration.service.spec.ts` additions (10 tests)
  - getRunnerCount accuracy
  - cleanupCompletedAgent removes from storage
  - cleanupCompletedAgent is idempotent

### Phase 4: Backend - Presentation Layer (TDD)

**New DTOs:**
```typescript
// backend/src/application/dto/cleanup-request.dto.ts
export class CleanupRequestDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean = false;

  @IsOptional()
  @IsBoolean()
  waitForCompletion?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeout?: number = 10000;

  toCleanupOptions(): CleanupOptions {
    return CleanupOptions.create({
      force: this.force ?? false,
      waitForCompletion: this.waitForCompletion ?? true,
      timeout: this.timeout ?? 10000,
      verifyClean: true,
    });
  }
}

// backend/src/application/dto/cleanup-response.dto.ts
export class CleanupResponseDto {
  success: boolean;
  cleanedAgentsCount: number;
  cleanedMessagesCount: number;
  duration: number;
  errors: string[];

  static fromResult(result: CleanupResult): CleanupResponseDto {
    return {
      success: result.success,
      cleanedAgentsCount: result.cleanedAgentsCount,
      cleanedMessagesCount: result.cleanedMessagesCount,
      duration: result.duration,
      errors: result.errors,
    };
  }
}
```

**Update Controller:**
```typescript
// backend/src/presentation/controllers/test.controller.ts
@Controller('test')
export class TestController {
  constructor(
    private readonly cleanupOrchestrator: ICleanupOrchestrator,
    // ... other dependencies
  ) {}

  /**
   * ENHANCED: Reset entire test environment
   * POST /api/test/reset-environment
   *
   * Replaces /reset-database with comprehensive cleanup
   */
  @Post('reset-environment')
  @HttpCode(HttpStatus.OK)
  async resetEnvironment(
    @Query() dto: CleanupRequestDto
  ): Promise<CleanupResponseDto> {
    const options = dto.toCleanupOptions();
    const result = await this.cleanupOrchestrator.cleanupAll(options);

    return CleanupResponseDto.fromResult(result);
  }

  /**
   * NEW: Get cleanup status for polling
   * GET /api/test/cleanup-status
   */
  @Get('cleanup-status')
  async getCleanupStatus() {
    return this.cleanupOrchestrator.getStatus();
  }

  /**
   * DEPRECATED: Old reset-database endpoint
   * Kept for backward compatibility, redirects to reset-environment
   */
  @Post('reset-database')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetDatabase(): Promise<void> {
    await this.cleanupOrchestrator.cleanupAll(CleanupOptions.default());
  }
}
```

**Tests (15+ tests)**:
- `test.controller.spec.ts` enhancements (15 tests)
  - POST /reset-environment with default options
  - POST /reset-environment with force=true
  - POST /reset-environment with custom timeout
  - POST /reset-environment returns correct DTO
  - GET /cleanup-status returns accurate counts
  - Error handling (cleanup failure)

### Phase 5: Frontend - Cleanup Manager (TDD)

**New Manager Class:**
```typescript
// frontend/e2e/helpers/TestCleanupManager.ts
import type { APIRequestContext } from '@playwright/test';

export interface CleanupResult {
  success: boolean;
  cleanedAgentsCount: number;
  cleanedMessagesCount: number;
  duration: number;
  errors: string[];
}

export interface CleanupStatus {
  agentCount: number;
  runningProcesses: number;
  activeSubscriptions: number;
}

/**
 * Test Cleanup Manager
 *
 * Robust cleanup system with verification and retry logic.
 * Guarantees clean state between tests.
 */
export class TestCleanupManager {
  private readonly backendUrl: string;

  constructor(
    private readonly request: APIRequestContext,
    backendUrl: string = 'http://localhost:3001'
  ) {
    this.backendUrl = backendUrl;
  }

  /**
   * Clean up all agents and verify success
   *
   * @param options - Cleanup configuration
   * @returns Cleanup result with counts
   * @throws Error if cleanup fails and force=false
   */
  async cleanupAll(options: {
    force?: boolean;
    timeout?: number;
    maxRetries?: number;
  } = {}): Promise<CleanupResult> {
    const {
      force = false,
      timeout = 10000,
      maxRetries = 2,
    } = options;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      attempt++;

      try {
        // Call backend cleanup endpoint
        const response = await this.request.post(
          `${this.backendUrl}/api/test/reset-environment`,
          {
            data: {
              force: attempt > 1 ? true : force,  // Force on retries
              waitForCompletion: true,
              timeout,
            },
          }
        );

        if (!response.ok()) {
          throw new Error(`Cleanup failed: ${response.status()} ${response.statusText()}`);
        }

        const result: CleanupResult = await response.json();

        // Verify cleanup succeeded
        if (result.success) {
          const isClean = await this.verifyCleanState();
          if (isClean) {
            console.log(`✅ Cleanup successful (attempt ${attempt}/${maxRetries}):`, {
              agents: result.cleanedAgentsCount,
              messages: result.cleanedMessagesCount,
              duration: `${result.duration}ms`,
            });
            return result;
          } else {
            console.warn(`⚠️ Cleanup reported success but verification failed (attempt ${attempt})`);
          }
        } else {
          console.warn(`⚠️ Cleanup incomplete (attempt ${attempt}):`, result.errors);
        }

      } catch (error) {
        lastError = error as Error;
        console.error(`❌ Cleanup attempt ${attempt} failed:`, error);

        if (attempt >= maxRetries) {
          break;
        }

        // Wait before retry (exponential backoff)
        const waitMs = 500 * Math.pow(2, attempt - 1);
        console.log(`⏳ Waiting ${waitMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    // All retries failed
    throw new Error(
      `Cleanup failed after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Verify environment is completely clean
   *
   * @returns true if no agents, processes, or subscriptions exist
   */
  async verifyCleanState(): Promise<boolean> {
    try {
      // Check backend status
      const statusResponse = await this.request.get(
        `${this.backendUrl}/api/test/cleanup-status`
      );

      if (!statusResponse.ok()) {
        console.warn('Failed to check cleanup status:', statusResponse.status());
        return false;
      }

      const status: CleanupStatus = await statusResponse.json();

      // Verify all counts are 0
      const isClean =
        status.agentCount === 0 &&
        status.runningProcesses === 0 &&
        status.activeSubscriptions === 0;

      if (!isClean) {
        console.warn('❌ Verification failed:', status);
      }

      return isClean;

    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }

  /**
   * Wait for cleanup to complete (with polling)
   *
   * @param timeoutMs - Max time to wait
   * @returns true if cleanup completed, false if timeout
   */
  async waitForCleanup(timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 200; // Check every 200ms

    while (Date.now() - startTime < timeoutMs) {
      const isClean = await this.verifyCleanState();
      if (isClean) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`⏱️ Cleanup timeout after ${timeoutMs}ms`);
    return false;
  }

  /**
   * Force cleanup (killall + TRUNCATE)
   * Use as last resort if normal cleanup fails
   */
  async forceCleanup(): Promise<CleanupResult> {
    console.log('⚠️ Force cleanup initiated');

    return this.cleanupAll({
      force: true,
      timeout: 5000,
      maxRetries: 1,
    });
  }
}
```

**Tests (20+ tests)**:
```typescript
// frontend/e2e/helpers/TestCleanupManager.spec.ts
describe('TestCleanupManager', () => {
  describe('cleanupAll', () => {
    test('cleans up 0 agents successfully');
    test('cleans up multiple agents');
    test('retries on failure');
    test('uses force on retry');
    test('throws after max retries exceeded');
    test('verifies clean state after cleanup');
    test('respects custom timeout');
  });

  describe('verifyCleanState', () => {
    test('returns true when clean');
    test('returns false when agents exist');
    test('returns false when processes exist');
    test('handles API errors gracefully');
  });

  describe('waitForCleanup', () => {
    test('returns true when cleanup completes');
    test('returns false on timeout');
    test('polls at correct interval');
  });

  describe('forceCleanup', () => {
    test('uses force=true');
    test('uses reduced timeout');
  });
});
```

### Phase 6: Integration and Migration

**Update global-setup.ts:**
```typescript
// frontend/e2e/global-setup.ts
import { TestCleanupManager } from './helpers/TestCleanupManager';

export default async function globalSetup() {
  // ... backend health check ...

  // Reset environment before ALL tests
  const request = await apiRequestContext.create({
    baseURL: BACKEND_URL,
  });

  const cleanupManager = new TestCleanupManager(request);
  await cleanupManager.cleanupAll({ force: true });

  console.log('✅ Test environment reset before test suite');
}
```

**Update test files:**
```typescript
// frontend/e2e/fullstack/*.spec.ts
import { TestCleanupManager } from '../helpers/TestCleanupManager';

test.describe('Event-Driven Core', () => {
  let cleanupManager: TestCleanupManager;

  test.beforeAll(async ({ request }) => {
    cleanupManager = new TestCleanupManager(request);
  });

  test.beforeEach(async () => {
    // Clean state before each test
    await cleanupManager.cleanupAll();
  });

  test.afterEach(async () => {
    // Verify cleanup after test (catch leaks early)
    const isClean = await cleanupManager.verifyCleanState();
    if (!isClean) {
      console.warn('⚠️ Test left environment dirty!');
      await cleanupManager.forceCleanup();
    }
  });

  test('my test', async () => {
    // Test code
  });
});
```

**Deprecate old cleanup.ts:**
```typescript
// frontend/e2e/helpers/cleanup.ts
/**
 * @deprecated Use TestCleanupManager instead
 * This file is kept for backward compatibility only
 */
import { TestCleanupManager } from './TestCleanupManager';

export async function cleanupAllAgents(request: APIRequestContext): Promise<void> {
  console.warn('⚠️ cleanupAllAgents is deprecated, use TestCleanupManager');
  const manager = new TestCleanupManager(request);
  await manager.cleanupAll();
}
```

---

## Part 4: Validation Plan

### Validation Tests

**Backend Cleanup Tests** (`backend/test/e2e/cleanup.e2e.spec.ts`):
```typescript
describe('Cleanup System E2E', () => {
  test('cleanup with 0 agents completes instantly', async () => {
    const result = await cleanupOrchestrator.cleanupAll(CleanupOptions.default());
    expect(result.success).toBe(true);
    expect(result.cleanedAgentsCount).toBe(0);
    expect(result.duration).toBeLessThan(100);
  });

  test('cleanup with 5 agents completes in <2 seconds', async () => {
    // Launch 5 agents
    const agents = await Promise.all([...Array(5)].map(() => launchAgent()));

    const result = await cleanupOrchestrator.cleanupAll(CleanupOptions.default());

    expect(result.success).toBe(true);
    expect(result.cleanedAgentsCount).toBe(5);
    expect(result.duration).toBeLessThan(2000);

    // Verify DB clean
    const remaining = await agentRepository.findAll();
    expect(remaining).toHaveLength(0);
  });

  test('cleanup is idempotent (safe to call multiple times)', async () => {
    await launchAgent();

    const result1 = await cleanupOrchestrator.cleanupAll(CleanupOptions.default());
    const result2 = await cleanupOrchestrator.cleanupAll(CleanupOptions.default());

    expect(result1.cleanedAgentsCount).toBe(1);
    expect(result2.cleanedAgentsCount).toBe(0);
    expect(result2.success).toBe(true);
  });

  test('cleanup with force=true kills stuck processes', async () => {
    // Create agent with stuck process (mock runner.stop() to hang)
    const agent = await launchAgent();
    mockRunnerStop.mockImplementation(() => new Promise(() => {})); // Never resolves

    const result = await cleanupOrchestrator.cleanupAll(
      CleanupOptions.create({ force: true, timeout: 1000 })
    );

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

**Frontend Cleanup Tests** (`frontend/e2e/helpers/TestCleanupManager.spec.ts`):
```typescript
describe('TestCleanupManager Integration', () => {
  test('cleans up real agents via HTTP', async ({ request }) => {
    const manager = new TestCleanupManager(request);

    // Launch real agent
    await request.post('http://localhost:3001/api/test/agents/synthetic', {
      data: {
        prompt: 'Test',
        schedule: [{ delay: 5000, type: 'complete' }],
      },
    });

    // Cleanup
    const result = await manager.cleanupAll();

    expect(result.success).toBe(true);
    expect(result.cleanedAgentsCount).toBeGreaterThan(0);

    // Verify
    const isClean = await manager.verifyCleanState();
    expect(isClean).toBe(true);
  });
});
```

**Test Isolation Tests** (validate tests don't interfere):
```bash
# Run event-driven suite 5 times - should pass every time
for i in {1..5}; do
  echo "Run $i/5"
  npm run test:e2e -- event-driven-core.spec.ts
done

# Expected: 100% pass rate (no flakiness)
```

### Performance Benchmarks

| Scenario | Target Time | Actual Time | Status |
|----------|-------------|-------------|--------|
| Cleanup 0 agents | <100ms | TBD | ⏳ |
| Cleanup 1 agent | <500ms | TBD | ⏳ |
| Cleanup 5 agents | <2s | TBD | ⏳ |
| Cleanup 10 agents | <4s | TBD | ⏳ |
| Verification check | <50ms | TBD | ⏳ |
| Force cleanup | <1s | TBD | ⏳ |

---

## Part 5: Migration Guide

### For Test Authors

**Before (Old cleanup.ts):**
```typescript
import { cleanupAllAgents } from '../helpers/cleanup';

test.beforeEach(async ({ request }) => {
  await cleanupAllAgents(request);
  // Hope cleanup worked 🤞
});
```

**After (New TestCleanupManager):**
```typescript
import { TestCleanupManager } from '../helpers/TestCleanupManager';

let cleanupManager: TestCleanupManager;

test.beforeAll(async ({ request }) => {
  cleanupManager = new TestCleanupManager(request);
});

test.beforeEach(async () => {
  await cleanupManager.cleanupAll();
  // ✅ Guaranteed clean or throws
});

test.afterEach(async () => {
  // Verify test cleaned up after itself
  const isClean = await cleanupManager.verifyCleanState();
  if (!isClean) {
    await cleanupManager.forceCleanup();
  }
});
```

### Rollout Plan

1. **Phase 1**: Implement backend (don't change tests yet)
   - All backend changes
   - Keep old `/test/reset-database` working
   - Add new `/test/reset-environment`

2. **Phase 2**: Add frontend manager (opt-in)
   - Create `TestCleanupManager`
   - Don't delete old `cleanup.ts` yet
   - Update 1-2 test files to use new manager

3. **Phase 3**: Validate stability
   - Run migrated tests 100 times
   - Confirm 0% flakiness
   - Performance meets targets

4. **Phase 4**: Migrate all tests
   - Update all E2E tests to use `TestCleanupManager`
   - Keep old `cleanup.ts` with deprecation warning

5. **Phase 5**: Remove old code
   - Delete `cleanup.ts`
   - Remove `/test/reset-database` endpoint
   - Update docs

---

## Part 6: Success Criteria

### Definition of Done

- ✅ All backend tests pass (100% coverage on new code)
- ✅ All frontend cleanup manager tests pass
- ✅ All E2E tests updated to use new cleanup
- ✅ Cleanup completes in <2 seconds for 5 agents
- ✅ Verification detects dirty state correctly
- ✅ Force cleanup handles stuck processes
- ✅ Zero test flakiness (100 runs = 100 passes)
- ✅ Documentation updated
- ✅ Migration guide written
- ✅ Old code deprecated with warnings

### Performance Impact

**Expected Performance**:
- Cleanup time: **1-2 seconds** (acceptable for test isolation)
- Verification time: **50-100ms** (negligible)
- Overall test suite time: **+5-10%** (worth it for reliability)

**Tradeoff Analysis**:
```
Old System:
  - Speed: Fast (but unreliable)
  - Reliability: ~70% (flaky due to race conditions)
  - Debuggability: Hard (mystery failures)

New System:
  - Speed: Slower (+1-2s per test)
  - Reliability: ~99% (guaranteed clean state)
  - Debuggability: Easy (verification catches leaks)

Verdict: ✅ Reliability > Speed for E2E tests
```

---

## Appendix A: File Checklist

### Backend Files Created (13 files)

**Domain Layer:**
- [ ] `backend/src/domain/value-objects/cleanup-result.vo.ts`
- [ ] `backend/src/domain/value-objects/cleanup-options.vo.ts`
- [ ] `backend/test/unit/domain/value-objects/cleanup-result.vo.spec.ts`
- [ ] `backend/test/unit/domain/value-objects/cleanup-options.vo.spec.ts`

**Application Layer:**
- [ ] `backend/src/application/ports/cleanup-orchestrator.port.ts`
- [ ] `backend/src/application/services/cleanup-orchestrator.service.ts`
- [ ] `backend/src/application/dto/cleanup-request.dto.ts`
- [ ] `backend/src/application/dto/cleanup-response.dto.ts`
- [ ] `backend/test/unit/application/services/cleanup-orchestrator.service.spec.ts`
- [ ] `backend/test/unit/application/dto/cleanup-request.dto.spec.ts`

**E2E Tests:**
- [ ] `backend/test/e2e/cleanup.e2e.spec.ts`

**Updated Files:**
- [ ] `backend/src/infrastructure/repositories/sqlite-agent.repository.ts` (+deleteAll method)
- [ ] `backend/src/application/services/streaming.service.ts` (+clearAllSubscriptions, +getActiveSubscriptionCount)
- [ ] `backend/src/application/services/agent-orchestration.service.ts` (+getRunnerCount, +cleanupCompletedAgent)
- [ ] `backend/src/presentation/controllers/test.controller.ts` (new endpoints)
- [ ] `backend/src/application/application.module.ts` (register CleanupOrchestratorService)

### Frontend Files Created (3 files)

- [ ] `frontend/e2e/helpers/TestCleanupManager.ts`
- [ ] `frontend/e2e/helpers/TestCleanupManager.spec.ts`
- [ ] `frontend/e2e/global-setup.ts` (enhanced)

**Updated Files:**
- [ ] `frontend/e2e/helpers/cleanup.ts` (deprecation notice)
- [ ] All `frontend/e2e/fullstack/*.spec.ts` files (use TestCleanupManager)

---

## Appendix B: Test Count Summary

| Component | Unit Tests | Integration Tests | E2E Tests | Total |
|-----------|-----------|-------------------|-----------|-------|
| cleanup-result.vo | 10 | - | - | 10 |
| cleanup-options.vo | 10 | - | - | 10 |
| cleanup-request.dto | 8 | - | - | 8 |
| cleanup-orchestrator.service | 30 | - | - | 30 |
| sqlite-agent.repository | 5 | - | - | 5 |
| streaming.service | 10 | - | - | 10 |
| agent-orchestration.service | 10 | - | - | 10 |
| test.controller | 15 | - | - | 15 |
| TestCleanupManager | - | 20 | - | 20 |
| Cleanup E2E | - | - | 10 | 10 |
| **TOTAL** | **98** | **20** | **10** | **128** |

**Grand Total: 128 new tests**

---

## Conclusion

This cleanup architecture provides:

1. **Guaranteed Clean State**: Every test starts fresh
2. **Fast Feedback**: Verification catches leaks immediately
3. **Robust Handling**: Force mechanisms for edge cases
4. **Clear Debugging**: Status endpoint shows exact state
5. **Performance Conscious**: <2 second overhead acceptable for reliability

**Next Steps**: Begin implementation with Phase 1 (Domain Layer TDD).
