# Instructions Feature - TDD Implementation Plan

## Executive Summary

**Feature**: Add optional "instructions" parameter to agent launching that temporarily replaces CLAUDE.md files during agent startup.

**Critical Requirement**: Implement **launch queue** to serialize agent starts and prevent CLAUDE.md file conflicts.

**Architecture Approach**:
- Domain-driven with Clean Architecture
- Queue at Application layer (orchestration concern)
- File manipulation at Infrastructure layer (adapter concern)
- Strict TDD with RED → GREEN → REFACTOR

---

## Problem Statement

### User Story
```
As a user launching a Claude Code agent,
I want to provide custom instructions that override CLAUDE.md files,
So that the agent operates with specific context instead of default context.
```

### Technical Requirements

1. **Temporary File Replacement**
   - Clear user-level CLAUDE.md (`~/.claude/CLAUDE.md`)
   - Replace project-level CLAUDE.md (`./CLAUDE.md`) with custom instructions
   - Restore files after agent starts (instructions cached by Claude)

2. **Concurrency Safety**
   - Only ONE agent can launch at a time (serialization required)
   - Queue subsequent launch requests
   - Prevent race conditions on CLAUDE.md files

3. **Clean Architecture Compliance**
   - Domain layer: Queue abstraction (port)
   - Application layer: Queue orchestration
   - Infrastructure layer: Queue implementation (adapter)

4. **Error Handling**
   - Restore files even if agent startup fails
   - Queue continues processing on errors
   - Clear error messages to user

---

## Architecture Analysis

### Current State (From Investigation)

**Strengths**:
- ✅ IFileSystem port available
- ✅ DTO extensible via AgentConfigurationDto
- ✅ Session passes configuration to adapters
- ✅ Adapters have access to file operations

**Gaps**:
- ❌ No launch queue (simultaneous starts possible)
- ❌ No file backup/restore logic
- ❌ No instructions parameter in DTO
- ❌ No mutex/lock on agent launches

### New Components Needed

```
┌─────────────────────────────────────────────────────────┐
│                    DOMAIN LAYER                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ IAgentLaunchQueue (Port)                          │  │
│  │ - enqueue(request): Promise<Agent>                │  │
│  │ - getQueueLength(): number                        │  │
│  │ - cancelRequest(id): void                         │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ LaunchRequest (Value Object)                      │  │
│  │ - id, agentType, prompt, instructions             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│                 APPLICATION LAYER                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │ AgentOrchestrationService (UPDATED)               │  │
│  │ - Uses IAgentLaunchQueue for serialization        │  │
│  │ - Delegates to InstructionHandler for file ops    │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ IInstructionHandler (Port)                        │  │
│  │ - prepareEnvironment(instructions): Backup        │  │
│  │ - restoreEnvironment(backup): void                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│               INFRASTRUCTURE LAYER                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ InMemoryAgentLaunchQueue (Adapter)                │  │
│  │ - Queue data structure (FIFO)                     │  │
│  │ - Async lock mechanism                            │  │
│  │ - Processes one launch at a time                  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ClaudeInstructionHandler (Adapter)                │  │
│  │ - Backs up CLAUDE.md files                        │  │
│  │ - Writes custom instructions                      │  │
│  │ - Restores original files                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases (TDD)

### Phase 1: Domain Layer - Queue Abstraction ⏱️ ~2 hours

**Test File**: `backend/test/unit/domain/value-objects/launch-request.vo.spec.ts`

#### RED: Write Failing Tests
```typescript
describe('LaunchRequest', () => {
  describe('create', () => {
    it('should create valid launch request with required fields', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      expect(request.id).toBeDefined();
      expect(request.agentType).toBe(AgentType.CLAUDE_CODE);
      expect(request.prompt).toBe('Test prompt');
      expect(request.instructions).toBeUndefined();
    });

    it('should create launch request with instructions', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
      });

      expect(request.instructions).toBe('Custom instructions');
    });

    it('should throw error if prompt is empty', () => {
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: '',
        })
      ).toThrow('Prompt cannot be empty');
    });

    it('should throw error if instructions exceed max length', () => {
      const longInstructions = 'x'.repeat(100001);

      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test',
          instructions: longInstructions,
        })
      ).toThrow('Instructions exceed maximum length of 100000 characters');
    });

    it('should generate unique IDs for each request', () => {
      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test 1',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test 2',
      });

      expect(request1.id).not.toBe(request2.id);
    });
  });

  describe('hasInstructions', () => {
    it('should return true when instructions are provided', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: 'Custom',
      });

      expect(request.hasInstructions()).toBe(true);
    });

    it('should return false when instructions are not provided', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      expect(request.hasInstructions()).toBe(false);
    });
  });

  describe('toConfiguration', () => {
    it('should convert to AgentConfiguration', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
        sessionId: 'session-123',
        metadata: { key: 'value' },
      });

      const config = request.toConfiguration();

      expect(config.sessionId).toBe('session-123');
      expect(config.instructions).toBe('Custom instructions');
      expect(config.metadata).toEqual({ key: 'value' });
    });
  });
});
```

#### GREEN: Implement LaunchRequest Value Object
**File**: `backend/src/domain/value-objects/launch-request.vo.ts`

```typescript
import { randomUUID } from 'crypto';
import { AgentType } from '../value-objects/agent-type.vo';
import { AgentConfiguration } from '../value-objects/agent-configuration.vo';

export interface CreateLaunchRequestData {
  agentType: AgentType;
  prompt: string;
  instructions?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  configuration?: Partial<AgentConfiguration>;
}

export class LaunchRequest {
  private static readonly MAX_INSTRUCTIONS_LENGTH = 100000;

  private constructor(
    public readonly id: string,
    public readonly agentType: AgentType,
    public readonly prompt: string,
    public readonly instructions?: string,
    public readonly sessionId?: string,
    public readonly metadata?: Record<string, unknown>,
    public readonly configuration?: Partial<AgentConfiguration>,
  ) {}

  static create(data: CreateLaunchRequestData): LaunchRequest {
    // Validation
    if (!data.prompt || data.prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    if (data.instructions && data.instructions.length > this.MAX_INSTRUCTIONS_LENGTH) {
      throw new Error(
        `Instructions exceed maximum length of ${this.MAX_INSTRUCTIONS_LENGTH} characters`
      );
    }

    return new LaunchRequest(
      randomUUID(),
      data.agentType,
      data.prompt,
      data.instructions,
      data.sessionId,
      data.metadata,
      data.configuration,
    );
  }

  hasInstructions(): boolean {
    return !!this.instructions && this.instructions.trim().length > 0;
  }

  toConfiguration(): AgentConfiguration {
    return {
      ...this.configuration,
      sessionId: this.sessionId,
      instructions: this.instructions,
      metadata: this.metadata,
    };
  }
}
```

#### Port Interface
**Test File**: `backend/test/unit/application/ports/agent-launch-queue.port.spec.ts`

```typescript
describe('IAgentLaunchQueue (Contract)', () => {
  let queue: IAgentLaunchQueue;

  beforeEach(() => {
    // Will be implemented in infrastructure layer
    queue = new InMemoryAgentLaunchQueue(
      mockOrchestrationService,
      mockLogger
    );
  });

  describe('enqueue', () => {
    it('should add request to queue and return promise', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);

      expect(promise).toBeInstanceOf(Promise);
      expect(queue.getQueueLength()).toBe(1);
    });

    it('should process queue in FIFO order', async () => {
      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'First',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Second',
      });

      const promise1 = queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      const agent1 = await promise1;
      const agent2 = await promise2;

      expect(agent1.session.prompt).toBe('First');
      expect(agent2.session.prompt).toBe('Second');
    });

    it('should serialize launches (no concurrent processing)', async () => {
      const processingOrder: string[] = [];

      // Mock orchestration to track order
      mockOrchestrationService.launchAgent.mockImplementation(
        async (request) => {
          processingOrder.push(request.prompt);
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
          return mockAgent;
        }
      );

      const requests = [
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'A' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'B' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'C' }),
      ];

      // Enqueue all at once
      const promises = requests.map(r => queue.enqueue(r));

      await Promise.all(promises);

      // Should process in order, not concurrently
      expect(processingOrder).toEqual(['A', 'B', 'C']);
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.getQueueLength()).toBe(0);
    });

    it('should return correct count for pending requests', () => {
      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'First',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Second',
      });

      queue.enqueue(request1);
      queue.enqueue(request2);

      expect(queue.getQueueLength()).toBe(2);
    });

    it('should decrement as requests are processed', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);
      expect(queue.getQueueLength()).toBe(1);

      await promise;
      expect(queue.getQueueLength()).toBe(0);
    });
  });

  describe('cancelRequest', () => {
    it('should remove pending request from queue', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      queue.enqueue(request);
      expect(queue.getQueueLength()).toBe(1);

      queue.cancelRequest(request.id);
      expect(queue.getQueueLength()).toBe(0);
    });

    it('should reject promise for cancelled request', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);
      queue.cancelRequest(request.id);

      await expect(promise).rejects.toThrow('Launch request cancelled');
    });

    it('should not affect currently processing request', async () => {
      // Mock slow processing
      mockOrchestrationService.launchAgent.mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return mockAgent;
        }
      );

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Processing',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Pending',
      });

      const promise1 = queue.enqueue(request1);
      queue.enqueue(request2);

      // Try to cancel the currently processing request
      queue.cancelRequest(request1.id);

      // Should still complete successfully
      const agent = await promise1;
      expect(agent).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should continue processing queue if one request fails', async () => {
      mockOrchestrationService.launchAgent
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce(mockAgent);

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Fail',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Success',
      });

      const promise1 = queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      await expect(promise1).rejects.toThrow('First failed');
      await expect(promise2).resolves.toBeDefined();
    });
  });
});
```

**Port Definition**:
**File**: `backend/src/application/ports/agent-launch-queue.port.ts`

```typescript
import { LaunchRequest } from '../../domain/value-objects/launch-request.vo';
import { Agent } from '../../domain/entities/agent.entity';

export interface IAgentLaunchQueue {
  /**
   * Adds a launch request to the queue.
   * Returns a promise that resolves when the agent is launched.
   * Launches are serialized (one at a time).
   */
  enqueue(request: LaunchRequest): Promise<Agent>;

  /**
   * Returns the number of pending requests in the queue.
   * Does not include currently processing request.
   */
  getQueueLength(): number;

  /**
   * Cancels a pending request.
   * Has no effect if request is already processing or completed.
   */
  cancelRequest(requestId: string): void;
}
```

---

### Phase 2: Infrastructure Layer - Queue Implementation ⏱️ ~3 hours

**Test File**: `backend/test/unit/infrastructure/queue/in-memory-agent-launch-queue.adapter.spec.ts`

#### RED: Write Failing Tests
```typescript
describe('InMemoryAgentLaunchQueue', () => {
  let queue: InMemoryAgentLaunchQueue;
  let mockOrchestrationService: jest.Mocked<AgentOrchestrationService>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockOrchestrationService = {
      launchAgentDirect: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    queue = new InMemoryAgentLaunchQueue(
      mockOrchestrationService,
      mockLogger
    );
  });

  describe('enqueue', () => {
    it('should process single request immediately', async () => {
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const result = await queue.enqueue(request);

      expect(result).toBe(mockAgent);
      expect(mockOrchestrationService.launchAgentDirect).toHaveBeenCalledWith(
        request
      );
    });

    it('should queue multiple requests and process sequentially', async () => {
      const processingTimes: number[] = [];
      const startTime = Date.now();

      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async (request) => {
          const elapsed = Date.now() - startTime;
          processingTimes.push(elapsed);
          await new Promise(resolve => setTimeout(resolve, 50));
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: request.prompt,
          });
        }
      );

      const requests = [
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'A' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'B' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'C' }),
      ];

      const promises = requests.map(r => queue.enqueue(r));
      await Promise.all(promises);

      // Verify sequential processing (each starts after previous finishes)
      expect(processingTimes[1]).toBeGreaterThan(processingTimes[0] + 40);
      expect(processingTimes[2]).toBeGreaterThan(processingTimes[1] + 40);
    });

    it('should log queue operations', async () => {
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      await queue.enqueue(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request added to queue',
        expect.objectContaining({ requestId: request.id })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing launch request',
        expect.objectContaining({ requestId: request.id })
      );
    });
  });

  describe('getQueueLength', () => {
    it('should return correct queue length', () => {
      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: 'Test',
          });
        }
      );

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'First',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Second',
      });

      queue.enqueue(request1);
      queue.enqueue(request2);

      // First is processing, second is pending
      expect(queue.getQueueLength()).toBe(1);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel pending request', async () => {
      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: 'Test',
          });
        }
      );

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Processing',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Pending',
      });

      queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      queue.cancelRequest(request2.id);

      await expect(promise2).rejects.toThrow('Launch request cancelled');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request cancelled',
        expect.objectContaining({ requestId: request2.id })
      );
    });

    it('should not cancel currently processing request', async () => {
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);
      queue.cancelRequest(request.id); // Try to cancel while processing

      const result = await promise;
      expect(result).toBe(mockAgent);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from orchestration service', async () => {
      const error = new Error('Launch failed');
      mockOrchestrationService.launchAgentDirect.mockRejectedValue(error);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      await expect(queue.enqueue(request)).rejects.toThrow('Launch failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Launch request failed',
        expect.objectContaining({ error, requestId: request.id })
      );
    });

    it('should continue processing queue after error', async () => {
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      mockOrchestrationService.launchAgentDirect
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce(mockAgent);

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Fail',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Success',
      });

      const promise1 = queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      await expect(promise1).rejects.toThrow();
      const result2 = await promise2;
      expect(result2).toBe(mockAgent);
    });
  });

  describe('concurrency safety', () => {
    it('should never process multiple requests concurrently', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;

      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async (request) => {
          activeCount++;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          await new Promise(resolve => setTimeout(resolve, 50));
          activeCount--;
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: request.prompt,
          });
        }
      );

      const requests = Array.from({ length: 10 }, (_, i) =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: `Request ${i}`,
        })
      );

      await Promise.all(requests.map(r => queue.enqueue(r)));

      expect(maxActiveCount).toBe(1); // Never more than 1 active
    });
  });
});
```

#### GREEN: Implement Queue Adapter
**File**: `backend/src/infrastructure/queue/in-memory-agent-launch-queue.adapter.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { IAgentLaunchQueue } from '../../application/ports/agent-launch-queue.port';
import { LaunchRequest } from '../../domain/value-objects/launch-request.vo';
import { Agent } from '../../domain/entities/agent.entity';
import { ILogger } from '../../application/ports/logger.port';
import { AgentOrchestrationService } from '../../application/services/agent-orchestration.service';

interface QueuedRequest {
  request: LaunchRequest;
  resolve: (agent: Agent) => void;
  reject: (error: Error) => void;
}

@Injectable()
export class InMemoryAgentLaunchQueue implements IAgentLaunchQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  constructor(
    @Inject('AgentOrchestrationService')
    private readonly orchestrationService: AgentOrchestrationService,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  async enqueue(request: LaunchRequest): Promise<Agent> {
    this.logger.info('Launch request added to queue', {
      requestId: request.id,
      agentType: request.agentType,
      hasInstructions: request.hasInstructions(),
      queueLength: this.queue.length,
    });

    return new Promise<Agent>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  cancelRequest(requestId: string): void {
    const index = this.queue.findIndex(item => item.request.id === requestId);

    if (index === -1) {
      this.logger.warn('Cannot cancel request - not in queue', { requestId });
      return;
    }

    const [cancelled] = this.queue.splice(index, 1);
    cancelled.reject(new Error('Launch request cancelled'));

    this.logger.info('Launch request cancelled', {
      requestId,
      remainingQueueLength: this.queue.length,
    });
  }

  private async processQueue(): Promise<void> {
    // Already processing - new requests will be handled when queue continues
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      this.logger.info('Processing launch request', {
        requestId: item.request.id,
        remainingInQueue: this.queue.length,
      });

      try {
        // Call orchestration service to perform the actual launch
        const agent = await this.orchestrationService.launchAgentDirect(
          item.request
        );

        this.logger.info('Launch request completed', {
          requestId: item.request.id,
          agentId: agent.id,
        });

        item.resolve(agent);
      } catch (error) {
        this.logger.error('Launch request failed', {
          requestId: item.request.id,
          error: error instanceof Error ? error.message : String(error),
        });

        item.reject(error as Error);
      }
    }

    this.processing = false;
  }
}
```

---

### Phase 3: Application Layer - Instruction Handler Port ⏱️ ~2 hours

**Test File**: `backend/test/unit/application/services/instruction-handler.service.spec.ts`

#### RED: Write Tests for Port Contract

```typescript
describe('IInstructionHandler (Contract)', () => {
  describe('ClaudeInstructionHandler', () => {
    let handler: ClaudeInstructionHandler;
    let mockFileSystem: jest.Mocked<IFileSystem>;
    let mockLogger: jest.Mocked<ILogger>;

    beforeEach(() => {
      mockFileSystem = {
        exists: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        deleteFile: jest.fn(),
      } as any;

      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any;

      handler = new ClaudeInstructionHandler(mockFileSystem, mockLogger);
    });

    describe('prepareEnvironment', () => {
      it('should backup and replace CLAUDE.md files when instructions provided', async () => {
        const instructions = 'Custom instructions for this agent';

        // Mock both files exist
        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readFile
          .mockResolvedValueOnce('User CLAUDE.md content')
          .mockResolvedValueOnce('Project CLAUDE.md content');

        const backup = await handler.prepareEnvironment(instructions);

        expect(backup).toBeDefined();
        expect(backup.userClaudeContent).toBe('User CLAUDE.md content');
        expect(backup.projectClaudeContent).toBe('Project CLAUDE.md content');

        // Should clear user CLAUDE.md
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('.claude/CLAUDE.md'),
          ''
        );

        // Should replace project CLAUDE.md
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('CLAUDE.md'),
          instructions
        );
      });

      it('should handle missing user CLAUDE.md gracefully', async () => {
        const instructions = 'Custom instructions';

        mockFileSystem.exists
          .mockResolvedValueOnce(false) // User file doesn't exist
          .mockResolvedValueOnce(true);  // Project file exists
        mockFileSystem.readFile.mockResolvedValue('Project content');

        const backup = await handler.prepareEnvironment(instructions);

        expect(backup.userClaudeContent).toBeUndefined();
        expect(backup.projectClaudeContent).toBe('Project content');

        // Should not try to write user file if it didn't exist
        expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'User CLAUDE.md not found, skipping backup',
          expect.any(Object)
        );
      });

      it('should handle missing project CLAUDE.md gracefully', async () => {
        const instructions = 'Custom instructions';

        mockFileSystem.exists
          .mockResolvedValueOnce(true)  // User file exists
          .mockResolvedValueOnce(false); // Project file doesn't exist
        mockFileSystem.readFile.mockResolvedValue('User content');

        const backup = await handler.prepareEnvironment(instructions);

        expect(backup.userClaudeContent).toBe('User content');
        expect(backup.projectClaudeContent).toBeUndefined();

        // Should still write project file with instructions
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('CLAUDE.md'),
          instructions
        );
      });

      it('should return null if no instructions provided', async () => {
        const backup = await handler.prepareEnvironment(undefined);

        expect(backup).toBeNull();
        expect(mockFileSystem.exists).not.toHaveBeenCalled();
        expect(mockFileSystem.readFile).not.toHaveBeenCalled();
        expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
      });

      it('should throw error if file operations fail', async () => {
        const instructions = 'Custom instructions';

        mockFileSystem.exists.mockRejectedValue(
          new Error('Filesystem error')
        );

        await expect(handler.prepareEnvironment(instructions)).rejects.toThrow(
          'Failed to prepare instruction environment'
        );
      });
    });

    describe('restoreEnvironment', () => {
      it('should restore both CLAUDE.md files from backup', async () => {
        const backup: ClaudeFileBackup = {
          userClaudeContent: 'Original user content',
          projectClaudeContent: 'Original project content',
          userClaudePath: '/home/user/.claude/CLAUDE.md',
          projectClaudePath: '/home/user/project/CLAUDE.md',
          timestamp: new Date(),
        };

        await handler.restoreEnvironment(backup);

        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          backup.userClaudePath,
          'Original user content'
        );
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          backup.projectClaudePath,
          'Original project content'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Environment restored from backup',
          expect.any(Object)
        );
      });

      it('should only restore user file if project was not backed up', async () => {
        const backup: ClaudeFileBackup = {
          userClaudeContent: 'Original user content',
          projectClaudeContent: undefined,
          userClaudePath: '/home/user/.claude/CLAUDE.md',
          projectClaudePath: '/home/user/project/CLAUDE.md',
          timestamp: new Date(),
        };

        await handler.restoreEnvironment(backup);

        expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          backup.userClaudePath,
          'Original user content'
        );
      });

      it('should handle restore errors gracefully', async () => {
        const backup: ClaudeFileBackup = {
          userClaudeContent: 'Original user content',
          projectClaudeContent: 'Original project content',
          userClaudePath: '/home/user/.claude/CLAUDE.md',
          projectClaudePath: '/home/user/project/CLAUDE.md',
          timestamp: new Date(),
        };

        mockFileSystem.writeFile.mockRejectedValue(
          new Error('Write failed')
        );

        await expect(handler.restoreEnvironment(backup)).rejects.toThrow(
          'Failed to restore environment'
        );
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should do nothing if backup is null', async () => {
        await handler.restoreEnvironment(null);

        expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'No backup to restore',
          expect.any(Object)
        );
      });
    });

    describe('file paths', () => {
      it('should use correct paths for CLAUDE.md files', async () => {
        const instructions = 'Custom instructions';

        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readFile.mockResolvedValue('content');

        await handler.prepareEnvironment(instructions);

        // Check user file path
        expect(mockFileSystem.exists).toHaveBeenCalledWith(
          expect.stringMatching(/\.claude\/CLAUDE\.md$/)
        );

        // Check project file path
        expect(mockFileSystem.exists).toHaveBeenCalledWith(
          expect.stringMatching(/CLAUDE\.md$/)
        );
      });
    });
  });
});
```

#### Port Definition
**File**: `backend/src/application/ports/instruction-handler.port.ts`

```typescript
export interface ClaudeFileBackup {
  userClaudeContent?: string;
  projectClaudeContent?: string;
  userClaudePath: string;
  projectClaudePath: string;
  timestamp: Date;
}

export interface IInstructionHandler {
  /**
   * Prepares the environment for custom instructions.
   * Backs up existing CLAUDE.md files and replaces them.
   * Returns backup data for restoration.
   *
   * @param instructions - Custom instructions to inject
   * @returns Backup data, or null if no instructions
   */
  prepareEnvironment(
    instructions: string | undefined
  ): Promise<ClaudeFileBackup | null>;

  /**
   * Restores CLAUDE.md files from backup.
   *
   * @param backup - Backup data from prepareEnvironment
   */
  restoreEnvironment(backup: ClaudeFileBackup | null): Promise<void>;
}
```

#### GREEN: Implement Instruction Handler
**File**: `backend/src/infrastructure/instruction-handlers/claude-instruction-handler.adapter.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import {
  IInstructionHandler,
  ClaudeFileBackup,
} from '../../application/ports/instruction-handler.port';
import { IFileSystem } from '../../application/ports/filesystem.port';
import { ILogger } from '../../application/ports/logger.port';

@Injectable()
export class ClaudeInstructionHandler implements IInstructionHandler {
  private readonly userClaudePath: string;
  private readonly projectClaudePath: string;

  constructor(
    @Inject('IFileSystem') private readonly fileSystem: IFileSystem,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {
    this.userClaudePath = join(homedir(), '.claude', 'CLAUDE.md');
    this.projectClaudePath = join(process.cwd(), 'CLAUDE.md');
  }

  async prepareEnvironment(
    instructions: string | undefined,
  ): Promise<ClaudeFileBackup | null> {
    if (!instructions || instructions.trim().length === 0) {
      this.logger.debug('No instructions provided, skipping environment preparation');
      return null;
    }

    this.logger.info('Preparing instruction environment', {
      instructionsLength: instructions.length,
      userPath: this.userClaudePath,
      projectPath: this.projectClaudePath,
    });

    try {
      const backup: ClaudeFileBackup = {
        userClaudePath: this.userClaudePath,
        projectClaudePath: this.projectClaudePath,
        timestamp: new Date(),
      };

      // Backup user CLAUDE.md (if exists)
      if (await this.fileSystem.exists(this.userClaudePath)) {
        backup.userClaudeContent = await this.fileSystem.readFile(
          this.userClaudePath,
        );
        this.logger.debug('Backed up user CLAUDE.md', {
          length: backup.userClaudeContent.length,
        });

        // Clear user CLAUDE.md
        await this.fileSystem.writeFile(this.userClaudePath, '');
        this.logger.info('Cleared user CLAUDE.md');
      } else {
        this.logger.info('User CLAUDE.md not found, skipping backup', {
          path: this.userClaudePath,
        });
      }

      // Backup project CLAUDE.md (if exists)
      if (await this.fileSystem.exists(this.projectClaudePath)) {
        backup.projectClaudeContent = await this.fileSystem.readFile(
          this.projectClaudePath,
        );
        this.logger.debug('Backed up project CLAUDE.md', {
          length: backup.projectClaudeContent.length,
        });
      } else {
        this.logger.info('Project CLAUDE.md not found, will create new', {
          path: this.projectClaudePath,
        });
      }

      // Write custom instructions to project CLAUDE.md
      await this.fileSystem.writeFile(this.projectClaudePath, instructions);
      this.logger.info('Wrote custom instructions to project CLAUDE.md', {
        instructionsLength: instructions.length,
      });

      return backup;
    } catch (error) {
      this.logger.error('Failed to prepare instruction environment', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to prepare instruction environment');
    }
  }

  async restoreEnvironment(backup: ClaudeFileBackup | null): Promise<void> {
    if (!backup) {
      this.logger.debug('No backup to restore');
      return;
    }

    this.logger.info('Restoring environment from backup', {
      timestamp: backup.timestamp,
      hasUserBackup: !!backup.userClaudeContent,
      hasProjectBackup: !!backup.projectClaudeContent,
    });

    try {
      // Restore user CLAUDE.md
      if (backup.userClaudeContent !== undefined) {
        await this.fileSystem.writeFile(
          backup.userClaudePath,
          backup.userClaudeContent,
        );
        this.logger.debug('Restored user CLAUDE.md');
      }

      // Restore project CLAUDE.md
      if (backup.projectClaudeContent !== undefined) {
        await this.fileSystem.writeFile(
          backup.projectClaudePath,
          backup.projectClaudeContent,
        );
        this.logger.debug('Restored project CLAUDE.md');
      }

      this.logger.info('Environment restored from backup');
    } catch (error) {
      this.logger.error('Failed to restore environment', {
        error: error instanceof Error ? error.message : String(error),
        backup,
      });
      throw new Error('Failed to restore environment');
    }
  }
}
```

---

### Phase 4: Update Orchestration Service ⏱️ ~3 hours

**Test File**: `backend/test/unit/application/services/agent-orchestration.service.spec.ts`

#### RED: Add Tests for Queue Integration

```typescript
describe('AgentOrchestrationService (Updated)', () => {
  // ... existing tests

  describe('launchAgent (with queue)', () => {
    it('should enqueue launch request instead of launching directly', async () => {
      const dto: LaunchAgentDto = {
        type: 'claude-code',
        prompt: 'Test prompt',
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: dto.prompt,
      });

      mockLaunchQueue.enqueue.mockResolvedValue(mockAgent);

      const result = await service.launchAgent(dto);

      expect(result).toBe(mockAgent);
      expect(mockLaunchQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test prompt',
        })
      );
    });

    it('should pass instructions to launch queue', async () => {
      const dto: LaunchAgentDto = {
        type: 'claude-code',
        prompt: 'Test prompt',
        configuration: {
          instructions: 'Custom instructions',
        },
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: dto.prompt,
      });

      mockLaunchQueue.enqueue.mockResolvedValue(mockAgent);

      await service.launchAgent(dto);

      expect(mockLaunchQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: 'Custom instructions',
        })
      );
    });

    it('should return queue length when requested', () => {
      mockLaunchQueue.getQueueLength.mockReturnValue(5);

      const length = service.getQueueLength();

      expect(length).toBe(5);
    });

    it('should cancel queued request', () => {
      const requestId = 'request-123';

      service.cancelLaunchRequest(requestId);

      expect(mockLaunchQueue.cancelRequest).toHaveBeenCalledWith(requestId);
    });
  });

  describe('launchAgentDirect (new method for queue)', () => {
    it('should launch agent with instructions handling', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
      });

      const mockBackup: ClaudeFileBackup = {
        userClaudeContent: 'Original user',
        projectClaudeContent: 'Original project',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: request.prompt,
      });

      mockInstructionHandler.prepareEnvironment.mockResolvedValue(mockBackup);
      mockRunner.start.mockResolvedValue(mockAgent);
      mockInstructionHandler.restoreEnvironment.mockResolvedValue(undefined);

      const result = await service.launchAgentDirect(request);

      expect(result).toBe(mockAgent);

      // Verify instruction handling flow
      expect(mockInstructionHandler.prepareEnvironment).toHaveBeenCalledWith(
        'Custom instructions'
      );
      expect(mockRunner.start).toHaveBeenCalled();
      expect(mockInstructionHandler.restoreEnvironment).toHaveBeenCalledWith(
        mockBackup
      );
    });

    it('should restore environment even if agent start fails', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
      });

      const mockBackup: ClaudeFileBackup = {
        userClaudeContent: 'Original',
        projectClaudeContent: 'Original',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      mockInstructionHandler.prepareEnvironment.mockResolvedValue(mockBackup);
      mockRunner.start.mockRejectedValue(new Error('Agent start failed'));
      mockInstructionHandler.restoreEnvironment.mockResolvedValue(undefined);

      await expect(service.launchAgentDirect(request)).rejects.toThrow(
        'Agent start failed'
      );

      // Verify cleanup happened
      expect(mockInstructionHandler.restoreEnvironment).toHaveBeenCalledWith(
        mockBackup
      );
    });

    it('should skip instruction handling if no instructions provided', async () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: request.prompt,
      });

      mockInstructionHandler.prepareEnvironment.mockResolvedValue(null);
      mockRunner.start.mockResolvedValue(mockAgent);

      const result = await service.launchAgentDirect(request);

      expect(result).toBe(mockAgent);
      expect(mockInstructionHandler.prepareEnvironment).toHaveBeenCalledWith(
        undefined
      );
      expect(mockInstructionHandler.restoreEnvironment).not.toHaveBeenCalled();
    });
  });
});
```

#### GREEN: Update Orchestration Service
**File**: `backend/src/application/services/agent-orchestration.service.ts`

```typescript
@Injectable()
export class AgentOrchestrationService {
  constructor(
    @Inject('IAgentFactory') private readonly agentFactory: IAgentFactory,
    @Inject('IAgentRepository') private readonly repository: IAgentRepository,
    @Inject('ILogger') private readonly logger: ILogger,
    @Inject('IAgentLaunchQueue') private readonly launchQueue: IAgentLaunchQueue,
    @Inject('IInstructionHandler') private readonly instructionHandler: IInstructionHandler,
  ) {}

  /**
   * Public API: Launches agent via queue (serialized)
   */
  async launchAgent(dto: LaunchAgentDto): Promise<Agent> {
    this.logger.info('Launching agent via queue', {
      type: dto.type,
      hasInstructions: !!dto.configuration?.instructions,
    });

    // Convert DTO to LaunchRequest
    const request = LaunchRequest.create({
      agentType: this.parseAgentType(dto.type),
      prompt: dto.prompt,
      instructions: dto.configuration?.instructions,
      sessionId: dto.configuration?.sessionId,
      metadata: dto.configuration?.metadata,
      configuration: dto.configuration,
    });

    // Enqueue (will be processed sequentially)
    return this.launchQueue.enqueue(request);
  }

  /**
   * Internal API: Called by queue to actually launch agent
   * This is where the real work happens (with instruction handling)
   */
  async launchAgentDirect(request: LaunchRequest): Promise<Agent> {
    let backup: ClaudeFileBackup | null = null;

    try {
      // Step 1: Prepare instruction environment (if needed)
      if (request.hasInstructions()) {
        this.logger.info('Preparing custom instruction environment', {
          requestId: request.id,
          instructionsLength: request.instructions?.length,
        });
        backup = await this.instructionHandler.prepareEnvironment(
          request.instructions,
        );
      }

      // Step 2: Create agent entity
      const agent = Agent.create({
        type: request.agentType,
        prompt: request.prompt,
        configuration: request.toConfiguration(),
      });

      // Step 3: Save to database BEFORE starting
      await this.repository.save(agent);
      this.logger.info('Agent created and saved', {
        agentId: agent.id,
        status: agent.status,
      });

      // Step 4: Get runner and start
      const runner = this.agentFactory.create(request.agentType);
      await runner.start(agent.session);

      // Step 5: Mark as running and save again
      agent.markAsRunning();
      await this.repository.save(agent);
      this.logger.info('Agent marked as running', { agentId: agent.id });

      // Step 6: Restore environment (instructions now cached by Claude)
      if (backup) {
        this.logger.info('Restoring environment after agent start', {
          requestId: request.id,
        });
        await this.instructionHandler.restoreEnvironment(backup);
      }

      return agent;
    } catch (error) {
      this.logger.error('Failed to launch agent', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // CRITICAL: Restore environment even on failure
      if (backup) {
        try {
          await this.instructionHandler.restoreEnvironment(backup);
          this.logger.info('Environment restored after error');
        } catch (restoreError) {
          this.logger.error('Failed to restore environment after error', {
            error: restoreError instanceof Error
              ? restoreError.message
              : String(restoreError),
          });
        }
      }

      throw error;
    }
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.launchQueue.getQueueLength();
  }

  /**
   * Cancel a pending launch request
   */
  cancelLaunchRequest(requestId: string): void {
    this.logger.info('Cancelling launch request', { requestId });
    this.launchQueue.cancelRequest(requestId);
  }

  // ... existing methods (listAgents, getAgent, etc.)
}
```

---

### Phase 5: Update DTOs and API ⏱️ ~1 hour

**Test File**: `backend/test/unit/application/dto/launch-agent.dto.spec.ts`

#### RED: Add Tests for Instructions Field

```typescript
describe('LaunchAgentDto', () => {
  // ... existing tests

  describe('instructions field', () => {
    it('should accept valid instructions', () => {
      const dto = plainToClass(LaunchAgentDto, {
        type: 'claude-code',
        prompt: 'Test prompt',
        configuration: {
          instructions: 'Custom instructions for this agent',
        },
      });

      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
      expect(dto.configuration?.instructions).toBe(
        'Custom instructions for this agent'
      );
    });

    it('should accept undefined instructions', () => {
      const dto = plainToClass(LaunchAgentDto, {
        type: 'claude-code',
        prompt: 'Test prompt',
        configuration: {},
      });

      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
      expect(dto.configuration?.instructions).toBeUndefined();
    });

    it('should reject non-string instructions', () => {
      const dto = plainToClass(LaunchAgentDto, {
        type: 'claude-code',
        prompt: 'Test prompt',
        configuration: {
          instructions: 12345,
        },
      });

      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isString');
    });

    it('should reject instructions exceeding max length', () => {
      const longInstructions = 'x'.repeat(100001);

      const dto = plainToClass(LaunchAgentDto, {
        type: 'claude-code',
        prompt: 'Test prompt',
        configuration: {
          instructions: longInstructions,
        },
      });

      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });
  });
});
```

#### GREEN: Update DTO

**File**: `backend/src/application/dto/launch-agent.dto.ts`

```typescript
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

class AgentConfigurationDto {
  @IsOptional()
  @IsString()
  outputFormat?: 'stream-json' | 'json';

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000, {
    message: 'Instructions cannot exceed 100000 characters',
  })
  instructions?: string;

  @IsOptional()
  customArgs?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  timeout?: number;

  @IsOptional()
  allowedTools?: string[];

  @IsOptional()
  disallowedTools?: string[];
}

export class LaunchAgentDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsOptional()
  @IsObject()
  configuration?: AgentConfigurationDto;
}
```

#### Update Controller
**File**: `backend/src/presentation/controllers/agent.controller.ts`

```typescript
@Controller('api/agents')
export class AgentController {
  // ... existing code

  @Get('queue')
  getQueueStatus(): { queueLength: number } {
    return {
      queueLength: this.orchestrationService.getQueueLength(),
    };
  }

  @Delete('queue/:requestId')
  @HttpCode(204)
  cancelQueuedRequest(@Param('requestId') requestId: string): void {
    this.orchestrationService.cancelLaunchRequest(requestId);
  }

  // ... existing methods
}
```

---

### Phase 6: Integration & Documentation ⏱️ ~2 hours

#### Integration Tests
**File**: `backend/test/integration/instruction-handling.integration.spec.ts`

```typescript
describe('Instruction Handling Integration', () => {
  let app: INestApplication;
  let orchestrationService: AgentOrchestrationService;
  let fileSystem: IFileSystem;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    orchestrationService = moduleRef.get(AgentOrchestrationService);
    fileSystem = moduleRef.get('IFileSystem');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should launch agent with custom instructions and restore environment', async () => {
    const projectClaudePath = join(process.cwd(), 'CLAUDE.md');

    // Read original project CLAUDE.md
    const originalContent = await fileSystem.readFile(projectClaudePath);

    // Launch agent with instructions
    const dto: LaunchAgentDto = {
      type: 'claude-code',
      prompt: 'Test with instructions',
      configuration: {
        instructions: 'CUSTOM INSTRUCTION FOR TEST',
      },
    };

    const agent = await orchestrationService.launchAgent(dto);

    // Give time for queue processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify CLAUDE.md was restored
    const restoredContent = await fileSystem.readFile(projectClaudePath);
    expect(restoredContent).toBe(originalContent);

    expect(agent).toBeDefined();
    expect(agent.status).toBe('RUNNING');
  });

  it('should serialize multiple launches with instructions', async () => {
    const launches = [
      { prompt: 'First', instructions: 'FIRST INSTRUCTION' },
      { prompt: 'Second', instructions: 'SECOND INSTRUCTION' },
      { prompt: 'Third', instructions: 'THIRD INSTRUCTION' },
    ];

    const promises = launches.map(launch =>
      orchestrationService.launchAgent({
        type: 'claude-code',
        prompt: launch.prompt,
        configuration: { instructions: launch.instructions },
      })
    );

    // All should complete without file conflicts
    const agents = await Promise.all(promises);

    expect(agents).toHaveLength(3);
    agents.forEach(agent => {
      expect(agent.status).toBe('RUNNING');
    });
  });
});
```

#### E2E Tests
**File**: `backend/test/e2e/instruction-feature.e2e.spec.ts`

```typescript
describe('Instruction Feature E2E', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    // Setup test app
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/agents with instructions', async () => {
    const response = await request(httpServer)
      .post('/api/agents')
      .send({
        type: 'claude-code',
        prompt: 'Test with instructions',
        configuration: {
          instructions: 'Custom agent instructions',
        },
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.status).toBe('RUNNING');
  });

  it('GET /api/agents/queue should return queue length', async () => {
    const response = await request(httpServer)
      .get('/api/agents/queue')
      .expect(200);

    expect(response.body).toHaveProperty('queueLength');
    expect(typeof response.body.queueLength).toBe('number');
  });

  it('should handle concurrent launches via queue', async () => {
    const launches = Array.from({ length: 5 }, (_, i) =>
      request(httpServer)
        .post('/api/agents')
        .send({
          type: 'claude-code',
          prompt: `Test ${i}`,
          configuration: {
            instructions: `Instructions ${i}`,
          },
        })
    );

    const responses = await Promise.all(launches);

    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });
});
```

---

## Summary Checklist

### Phase 1: Domain Layer ✅
- [ ] `LaunchRequest` value object (tests + implementation)
- [ ] `IAgentLaunchQueue` port interface
- [ ] Unit tests for LaunchRequest validation

### Phase 2: Infrastructure Layer ✅
- [ ] `InMemoryAgentLaunchQueue` adapter (tests + implementation)
- [ ] Queue serialization tests
- [ ] Concurrency safety tests

### Phase 3: Application Layer ✅
- [ ] `IInstructionHandler` port interface
- [ ] `ClaudeInstructionHandler` adapter (tests + implementation)
- [ ] File backup/restore tests

### Phase 4: Orchestration Update ✅
- [ ] Update `AgentOrchestrationService` (tests + implementation)
- [ ] `launchAgentDirect` method with instruction handling
- [ ] Error handling and cleanup tests

### Phase 5: API Layer ✅
- [ ] Update `LaunchAgentDto` (tests + implementation)
- [ ] Add `instructions` field with validation
- [ ] Add queue status endpoints

### Phase 6: Integration ✅
- [ ] Integration tests for instruction handling
- [ ] E2E tests for full flow
- [ ] Update documentation
- [ ] Manual testing with real Claude CLI

---

## Estimated Timeline

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1 | 2 hours | None |
| Phase 2 | 3 hours | Phase 1 |
| Phase 3 | 2 hours | None (parallel with 1-2) |
| Phase 4 | 3 hours | Phases 1-3 |
| Phase 5 | 1 hour | Phase 4 |
| Phase 6 | 2 hours | Phase 5 |
| **Total** | **13 hours** | Sequential |

---

## SOLID Principles Applied

1. **Single Responsibility**
   - `LaunchRequest`: Only validates and holds launch data
   - `InMemoryAgentLaunchQueue`: Only manages queue
   - `ClaudeInstructionHandler`: Only handles file operations
   - `AgentOrchestrationService`: Only orchestrates (delegates to queue)

2. **Open/Closed**
   - `IAgentLaunchQueue`: Can add Redis-based queue later
   - `IInstructionHandler`: Can add Gemini-specific handler

3. **Liskov Substitution**
   - Any `IAgentLaunchQueue` implementation works
   - Any `IInstructionHandler` implementation works

4. **Interface Segregation**
   - Small, focused interfaces (3-4 methods each)
   - No "fat interfaces"

5. **Dependency Inversion**
   - Application layer depends on ports, not concrete implementations
   - Infrastructure layer implements ports

---

## Risk Mitigation

### Risk 1: File Restoration Failure
**Mitigation**:
- Always restore in `finally` block
- Log all file operations
- Add retry logic for file writes

### Risk 2: Queue Deadlock
**Mitigation**:
- Add timeout to queue processing
- Implement health checks on queue
- Add dead-letter queue for failed requests

### Risk 3: Claude Cache Miss
**Mitigation**:
- Document cache behavior in user docs
- Add warning if instructions are very long (cache limits)
- Consider adding explicit cache validation

### Risk 4: Concurrent File Access
**Mitigation**:
- Queue ensures serialization (only 1 launch at a time)
- File locks (if needed for future multi-process support)

---

## Testing Strategy

### Unit Tests (80%)
- All value objects, ports, adapters in isolation
- Mocked dependencies
- Fast execution (<1s total)

### Integration Tests (15%)
- Real file system operations
- Real queue processing
- Database interactions

### E2E Tests (5%)
- Full HTTP API flow
- Real Claude CLI (in smoke tests)
- End-to-end validation

---

## Next Steps After Implementation

1. **Frontend Updates**
   - Add "Custom Instructions" textarea to launch form
   - Display queue position for pending launches
   - Add queue management UI

2. **Documentation**
   - Update API reference with new endpoints
   - Add user guide for custom instructions
   - Document queue behavior

3. **Monitoring**
   - Add metrics for queue length
   - Track instruction usage stats
   - Alert on queue backup

4. **Future Enhancements**
   - Instruction templates (save/reuse)
   - Instruction validation (syntax check)
   - Instruction versioning

---

**Last Updated**: 2025-11-30
**Status**: Ready for Implementation
**Estimated Completion**: 13 hours of focused development
