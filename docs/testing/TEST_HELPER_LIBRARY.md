# Test Helper Library Specification

**Utility functions and mocks for efficient test writing**

---

## Overview

This document specifies all test helper functions, mock factories, and utilities that AI agents should implement and use when writing tests.

**Purpose**: Reduce duplication, increase consistency, make tests easier to write.

**Location**:
```
backend/test/
├── helpers/          # Utility functions
├── mocks/           # Reusable mocks
├── fixtures/        # Test data
└── setup/           # Global test configuration
```

---

## HELPERS LIBRARY

### File: `test/helpers/database-helpers.ts`

**Purpose**: Common database operations for tests

```typescript
import { DatabaseService } from '@infrastructure/database/database.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentMessageService } from '@application/services/agent-message.service';
import type { AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Create a fresh in-memory database with schema
 *
 * @returns Initialized DatabaseService
 *
 * @example
 * const db = createTestDatabase()
 * // Use in tests
 * db.close() // Clean up
 */
export function createTestDatabase(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.onModuleInit();

  // Verify FK constraints are enabled
  const fk = db.getDatabase().pragma('foreign_keys', { simple: true });
  if (fk !== 1) {
    throw new Error(
      'CRITICAL: Foreign keys not enabled in test database! ' +
      'Tests will give false confidence.'
    );
  }

  return db;
}

/**
 * Create and save a test agent to database
 *
 * @param db - Database service
 * @param overrides - Optional fields to override
 * @returns Created agent
 *
 * @example
 * const agent = await createTestAgent(db, { prompt: 'Custom prompt' })
 */
export async function createTestAgent(
  db: DatabaseService,
  overrides?: Partial<{
    type: AgentType;
    prompt: string;
    configuration: Record<string, unknown>;
    status: 'initializing' | 'running' | 'completed';
  }>
): Promise<Agent> {
  const agent = Agent.create({
    type: overrides?.type || AgentType.SYNTHETIC,
    prompt: overrides?.prompt || 'Test agent',
    configuration: overrides?.configuration || { outputFormat: 'stream-json' },
  });

  // Apply status if specified
  if (overrides?.status === 'running') {
    agent.markAsRunning();
  } else if (overrides?.status === 'completed') {
    agent.markAsRunning();
    agent.markAsCompleted();
  }

  const repository = new SqliteAgentRepository(db);
  await repository.save(agent);

  return agent;
}

/**
 * Create and save test messages for an agent
 *
 * @param db - Database service
 * @param agentId - Agent ID (as string)
 * @param count - Number of messages to create
 * @param overrides - Optional message overrides
 * @returns Array of created messages
 *
 * @example
 * const messages = await createTestMessages(db, agent.id.toString(), 10)
 */
export async function createTestMessages(
  db: DatabaseService,
  agentId: string,
  count: number,
  overrides?: Partial<{
    type: 'assistant' | 'user' | 'system' | 'error';
    content: string;
  }>
): Promise<AgentMessage[]> {
  const messageService = new AgentMessageService(db);
  const messages: AgentMessage[] = [];

  for (let i = 0; i < count; i++) {
    const message = await messageService.saveMessage({
      agentId,
      type: overrides?.type || 'assistant',
      content: overrides?.content || `Test message ${i + 1}`,
    });
    messages.push(message);
  }

  return messages;
}

/**
 * Clean all data from database
 *
 * @param db - Database service
 *
 * @example
 * afterEach(() => cleanDatabase(db))
 */
export function cleanDatabase(db: DatabaseService): void {
  const database = db.getDatabase();
  // Order matters: delete children before parents (FK constraint)
  database.exec('DELETE FROM agent_messages');
  database.exec('DELETE FROM agents');
}

/**
 * Assert that foreign key constraints are enabled
 *
 * @param db - Database service
 * @throws Error if FK constraints are not enabled
 *
 * @example
 * beforeEach(() => assertForeignKeysEnabled(db))
 */
export function assertForeignKeysEnabled(db: DatabaseService): void {
  const fk = db.getDatabase().pragma('foreign_keys', { simple: true });
  if (fk !== 1) {
    throw new Error(
      'Foreign keys are NOT enabled! This test would give false confidence.'
    );
  }
}

/**
 * Get agent from database (bypassing repository layer)
 *
 * @param db - Database service
 * @param agentId - Agent ID
 * @returns Raw database row or undefined
 *
 * @example
 * const row = getAgentFromDb(db, agentId)
 * expect(row.status).toBe('running')
 */
export function getAgentFromDb(
  db: DatabaseService,
  agentId: string
): any | undefined {
  return db.getDatabase()
    .prepare('SELECT * FROM agents WHERE id = ?')
    .get(agentId);
}

/**
 * Get messages from database (bypassing repository layer)
 *
 * @param db - Database service
 * @param agentId - Agent ID
 * @returns Array of message rows
 *
 * @example
 * const messages = getMessagesFromDb(db, agentId)
 * expect(messages).toHaveLength(5)
 */
export function getMessagesFromDb(
  db: DatabaseService,
  agentId: string
): any[] {
  return db.getDatabase()
    .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
    .all(agentId) as any[];
}

/**
 * Assert FK constraint violation
 *
 * @param fn - Function that should violate FK
 * @param expectedMessage - Expected error message pattern
 *
 * @example
 * assertForeignKeyViolation(
 *   () => db.exec("INSERT INTO agent_messages (agent_id, ...) VALUES ('fake', ...)"),
 *   /FOREIGN KEY constraint failed/
 * )
 */
export function assertForeignKeyViolation(
  fn: () => void,
  expectedMessage: RegExp = /FOREIGN KEY constraint failed/
): void {
  let error: Error | undefined;

  try {
    fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error('Expected FK constraint violation, but function succeeded');
  }

  if (!expectedMessage.test(error.message)) {
    throw new Error(
      `Expected FK error matching ${expectedMessage}, got: ${error.message}`
    );
  }
}
```

**Estimated Implementation Time**: 2 hours

---

### File: `test/helpers/async-helpers.ts`

**Purpose**: Utilities for async operations and timing

```typescript
/**
 * Wait for a condition to become true
 *
 * @param condition - Function that returns true when done
 * @param timeout - Max wait time in ms (default: 5000)
 * @param interval - Check interval in ms (default: 100)
 * @throws Error if timeout exceeded
 *
 * @example
 * await waitFor(() => messages.length > 0, 2000)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();

  while (true) {
    const result = await condition();
    if (result) return;

    if (Date.now() - start > timeout) {
      throw new Error(
        `Timeout waiting for condition after ${timeout}ms`
      );
    }

    await sleep(interval);
  }
}

/**
 * Wait for array to reach expected length
 *
 * @param array - Array to monitor
 * @param expectedLength - Expected length
 * @param timeout - Max wait time in ms
 *
 * @example
 * await waitForLength(messages, 5) // Wait for 5 messages
 */
export async function waitForLength<T>(
  array: T[],
  expectedLength: number,
  timeout: number = 5000
): Promise<void> {
  await waitFor(() => array.length >= expectedLength, timeout);
}

/**
 * Wait for promise to resolve with timeout
 *
 * @param promise - Promise to wait for
 * @param timeout - Timeout in ms
 * @returns Promise result
 * @throws Error if timeout exceeded
 *
 * @example
 * const result = await withTimeout(slowOperation(), 1000)
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
    ),
  ]);
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 *
 * @example
 * await sleep(1000) // Wait 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry operation until it succeeds or max attempts reached
 *
 * @param fn - Function to retry
 * @param maxAttempts - Maximum retry attempts
 * @param delay - Delay between attempts in ms
 *
 * @example
 * await retry(() => checkDatabaseReady(), 5, 1000)
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`
  );
}
```

**Estimated Implementation Time**: 1 hour

---

### File: `test/helpers/assertion-helpers.ts`

**Purpose**: Custom assertions for domain-specific checks

```typescript
/**
 * Assert that value is a valid UUID v4
 *
 * @param value - Value to check
 *
 * @example
 * assertIsUUID(agent.id.toString())
 */
export function assertIsUUID(value: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) {
    throw new Error(`Expected valid UUID v4, got: ${value}`);
  }
}

/**
 * Assert that date string is valid ISO 8601
 *
 * @param dateString - Date string to validate
 *
 * @example
 * assertIsISO8601(agent.createdAt.toISOString())
 */
export function assertIsISO8601(dateString: string): void {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO 8601 date: ${dateString}`);
  }

  // Verify it round-trips
  if (date.toISOString() !== dateString) {
    throw new Error(`Date string is not in ISO 8601 format: ${dateString}`);
  }
}

/**
 * Assert that messages have monotonically increasing sequence numbers
 *
 * @param messages - Messages to check
 *
 * @example
 * assertMonotonicSequence(messages)
 */
export function assertMonotonicSequence(messages: AgentMessage[]): void {
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1].sequenceNumber;
    const curr = messages[i].sequenceNumber;

    if (curr <= prev) {
      throw new Error(
        `Sequence not monotonic: message ${i - 1} has seq ${prev}, ` +
        `message ${i} has seq ${curr}`
      );
    }
  }
}

/**
 * Assert that messages have no gaps in sequence numbers
 *
 * @param messages - Messages to check (must be sorted)
 *
 * @example
 * assertNoGapsInSequence(messages)
 */
export function assertNoGapsInSequence(messages: AgentMessage[]): void {
  const sequences = messages
    .filter(m => m.sequenceNumber > 0) // Skip temporary messages (-1)
    .map(m => m.sequenceNumber)
    .sort((a, b) => a - b);

  for (let i = 1; i < sequences.length; i++) {
    const expected = sequences[i - 1] + 1;
    const actual = sequences[i];

    if (actual !== expected) {
      throw new Error(
        `Gap in sequence: expected ${expected}, got ${actual}`
      );
    }
  }
}

/**
 * Assert that array has no duplicates (by field)
 *
 * @param array - Array to check
 * @param field - Field to check for duplicates
 *
 * @example
 * assertNoDuplicates(messages, 'id')
 */
export function assertNoDuplicates<T>(
  array: T[],
  field: keyof T
): void {
  const seen = new Set();

  for (const item of array) {
    const value = item[field];

    if (seen.has(value)) {
      throw new Error(`Duplicate found: ${field}=${value}`);
    }

    seen.add(value);
  }
}

/**
 * Assert that execution time is within limit
 *
 * @param fn - Function to measure
 * @param maxMs - Maximum allowed time in milliseconds
 *
 * @example
 * await assertPerformance(() => service.query(), 100) // Must complete in <100ms
 */
export async function assertPerformance<T>(
  fn: () => Promise<T>,
  maxMs: number
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (duration > maxMs) {
    throw new Error(
      `Performance requirement failed: took ${duration.toFixed(2)}ms, ` +
      `expected <${maxMs}ms`
    );
  }

  return result;
}
```

**Estimated Implementation Time**: 2 hours

---

### File: `test/helpers/websocket-helpers.ts`

**Purpose**: WebSocket testing utilities

```typescript
import { io, Socket } from 'socket.io-client';

/**
 * Create and connect a test WebSocket client
 *
 * @param url - WebSocket URL
 * @param timeout - Connection timeout
 * @returns Connected socket
 *
 * @example
 * const socket = await createTestSocket('http://localhost:3000')
 * // Use socket
 * socket.close()
 */
export async function createTestSocket(
  url: string = 'http://localhost:3000',
  timeout: number = 5000
): Promise<Socket> {
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

/**
 * Wait for specific WebSocket event
 *
 * @param socket - Socket instance
 * @param eventName - Event to wait for
 * @param timeout - Timeout in ms
 * @returns Event payload
 *
 * @example
 * const event = await waitForSocketEvent(socket, 'agent:created')
 * expect(event.agent.id).toBe(agentId)
 */
export async function waitForSocketEvent<T = any>(
  socket: Socket,
  eventName: string,
  timeout: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${eventName}" after ${timeout}ms`));
    }, timeout);

    socket.once(eventName, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Capture all events of a specific type
 *
 * @param socket - Socket instance
 * @param eventName - Event to capture
 * @returns Array that will be populated with events
 *
 * @example
 * const messages = captureSocketEvents(socket, 'agent:message')
 * // Wait for events...
 * expect(messages).toHaveLength(5)
 */
export function captureSocketEvents<T = any>(
  socket: Socket,
  eventName: string
): T[] {
  const events: T[] = [];

  socket.on(eventName, (event: T) => {
    events.push(event);
  });

  return events;
}

/**
 * Subscribe to agent and wait for confirmation
 *
 * @param socket - Socket instance
 * @param agentId - Agent ID to subscribe to
 *
 * @example
 * await subscribeToAgent(socket, agentId)
 * // Now receiving agent messages
 */
export async function subscribeToAgent(
  socket: Socket,
  agentId: string
): Promise<void> {
  socket.emit('subscribe', { agentId });

  await waitForSocketEvent(socket, 'subscribed', 2000);
}

/**
 * Unsubscribe from agent and wait for confirmation
 */
export async function unsubscribeFromAgent(
  socket: Socket,
  agentId: string
): Promise<void> {
  socket.emit('unsubscribe', { agentId });

  await waitForSocketEvent(socket, 'unsubscribed', 2000);
}
```

**Estimated Implementation Time**: 2 hours

---

## MOCKS LIBRARY

### File: `test/mocks/agent-runner.mock.ts`

**Purpose**: Reusable mock for IAgentRunner interface

```typescript
import { IAgentRunner, IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';

export interface MockAgentRunnerOptions {
  /**
   * Agent to return from start() (default: creates new synthetic agent)
   */
  mockAgent?: Agent;

  /**
   * Should start() fail?
   */
  shouldFail?: boolean;

  /**
   * Delay before start() resolves (ms)
   */
  startDelay?: number;

  /**
   * Messages to emit automatically
   */
  emitMessages?: Array<{
    delay: number;
    type: string;
    content: string;
  }>;
}

/**
 * Create a mock IAgentRunner for testing
 *
 * @param options - Configuration options
 * @returns Mocked runner
 *
 * @example
 * const mockRunner = createMockAgentRunner({
 *   shouldFail: true
 * })
 *
 * expect(mockRunner.start).toThrow()
 */
export function createMockAgentRunner(
  options: MockAgentRunnerOptions = {}
): jest.Mocked<IAgentRunner> {
  // Default mock agent
  const defaultAgent = Agent.create({
    type: AgentType.SYNTHETIC,
    prompt: 'Mock agent',
    configuration: { outputFormat: 'stream-json' },
  });
  defaultAgent.markAsRunning();

  const mockAgent = options.mockAgent || defaultAgent;

  const mock: jest.Mocked<IAgentRunner> = {
    start: jest.fn().mockImplementation(async () => {
      if (options.shouldFail) {
        throw new Error('Mock agent failed to start');
      }

      if (options.startDelay) {
        await new Promise(resolve => setTimeout(resolve, options.startDelay));
      }

      return mockAgent;
    }),

    stop: jest.fn().mockResolvedValue(undefined),

    getStatus: jest.fn().mockResolvedValue(AgentStatus.RUNNING),

    subscribe: jest.fn().mockImplementation((agentId: AgentId, observer: IAgentObserver) => {
      // If emitMessages configured, emit them
      if (options.emitMessages) {
        options.emitMessages.forEach(msg => {
          setTimeout(() => {
            const message: AgentMessage = {
              agentId: agentId.toString(),
              type: msg.type as any,
              content: msg.content,
              metadata: {},
            };
            observer.onMessage(message);
          }, msg.delay);
        });
      }
    }),

    unsubscribe: jest.fn(),
  };

  return mock;
}
```

**Estimated Implementation Time**: 1.5 hours

---

### File: `test/mocks/websocket-gateway.mock.ts`

**Purpose**: Mock WebSocket gateway for service tests

```typescript
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';

export interface MockWebSocketGatewayOptions {
  /**
   * Should emits fail?
   */
  shouldFail?: boolean;

  /**
   * Capture emitted events for verification
   */
  captureEvents?: boolean;
}

export interface CapturedEvent {
  type: 'emitToClient' | 'emitToAll' | 'emitToRoom';
  eventName: string;
  data: any;
  target?: string; // clientId or room name
}

/**
 * Create mock WebSocket gateway
 *
 * @param options - Configuration
 * @returns Mock gateway with event capture
 *
 * @example
 * const { gateway, events } = createMockWebSocketGateway({ captureEvents: true })
 * // Use gateway
 * expect(events).toContainEqual(expect.objectContaining({ eventName: 'agent:created' }))
 */
export function createMockWebSocketGateway(
  options: MockWebSocketGatewayOptions = {}
): {
  gateway: jest.Mocked<IWebSocketGateway>;
  events: CapturedEvent[];
} {
  const events: CapturedEvent[] = [];

  const gateway: jest.Mocked<IWebSocketGateway> = {
    emitToClient: jest.fn().mockImplementation((clientId, eventName, data) => {
      if (options.shouldFail) {
        throw new Error('Mock gateway failed');
      }

      if (options.captureEvents) {
        events.push({ type: 'emitToClient', eventName, data, target: clientId });
      }
    }),

    emitToAll: jest.fn().mockImplementation((eventName, data) => {
      if (options.shouldFail) {
        throw new Error('Mock gateway failed');
      }

      if (options.captureEvents) {
        events.push({ type: 'emitToAll', eventName, data });
      }
    }),

    emitToRoom: jest.fn().mockImplementation((room, eventName, data) => {
      if (options.shouldFail) {
        throw new Error('Mock gateway failed');
      }

      if (options.captureEvents) {
        events.push({ type: 'emitToRoom', eventName, data, target: room });
      }
    }),
  } as any;

  return { gateway, events };
}
```

**Estimated Implementation Time**: 1 hour

---

### File: `test/mocks/repository.mock.ts`

**Purpose**: Mock repository for application layer tests

```typescript
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';

/**
 * Create in-memory repository mock (simulates real behavior)
 *
 * @returns Mock repository with in-memory storage
 *
 * @example
 * const mockRepo = createMockRepository()
 * await mockRepo.save(agent)
 * const found = await mockRepo.findById(agent.id)
 */
export function createMockRepository(): jest.Mocked<IAgentRepository> {
  const storage = new Map<string, Agent>();

  return {
    save: jest.fn().mockImplementation(async (agent: Agent) => {
      storage.set(agent.id.toString(), agent);
    }),

    findById: jest.fn().mockImplementation(async (id: AgentId) => {
      return storage.get(id.toString()) || null;
    }),

    findAll: jest.fn().mockImplementation(async () => {
      return Array.from(storage.values());
    }),

    findByStatus: jest.fn().mockImplementation(async (status: AgentStatus) => {
      return Array.from(storage.values()).filter(a => a.status === status);
    }),

    delete: jest.fn().mockImplementation(async (id: AgentId) => {
      storage.delete(id.toString());
    }),

    exists: jest.fn().mockImplementation(async (id: AgentId) => {
      return storage.has(id.toString());
    }),
  } as any;
}
```

**Estimated Implementation Time**: 1 hour

---

## FIXTURES LIBRARY

### File: `test/fixtures/claude-code/simple-success.jsonl`

**Purpose**: Realistic Claude Code CLI output for testing

```jsonl
{"type":"system","role":"init","content":"Claude Code CLI v1.0"}
{"type":"user","content":"Write a hello world function"}
{"type":"assistant","content":"I'll write a simple hello world function for you."}
{"type":"assistant","content":"```typescript\nfunction helloWorld() {\n  console.log('Hello, World!');\n}\n```"}
{"type":"system","role":"result","stats":{"duration":1200,"tokensUsed":45}}
```

### File: `test/fixtures/claude-code/tool-use.jsonl`

**Purpose**: Claude Code output with tool usage

```jsonl
{"type":"system","role":"init","content":"Claude Code CLI v1.0"}
{"type":"user","content":"Read the package.json file"}
{"type":"assistant","content":"I'll read the package.json file."}
{"type":"assistant","tool_use":{"type":"read_file","path":"package.json"}}
{"type":"tool_result","tool_use_id":"1","content":"{\n  \"name\": \"test\"\n}"}
{"type":"assistant","content":"The package.json shows the project name is 'test'."}
{"type":"system","role":"result","stats":{"duration":2400,"tokensUsed":120}}
```

### File: `test/fixtures/websocket/events.ts`

**Purpose**: Sample WebSocket event payloads

```typescript
export const sampleEvents = {
  agentCreated: {
    agent: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'claude-code',
      status: 'initializing',
      session: {
        id: 'session-123',
        prompt: 'Test prompt',
        messageCount: 0
      },
      createdAt: '2025-11-23T12:00:00.000Z',
      startedAt: null,
      completedAt: null
    },
    timestamp: '2025-11-23T12:00:00.000Z'
  },

  agentMessage: {
    agentId: '550e8400-e29b-41d4-a716-446655440000',
    message: {
      id: 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e5',
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      sequenceNumber: 1,
      type: 'assistant',
      role: 'assistant',
      content: 'Test message',
      metadata: {},
      createdAt: '2025-11-23T12:00:01.000Z'
    },
    timestamp: '2025-11-23T12:00:01.000Z'
  },

  agentStatus: {
    agentId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'running',
    timestamp: '2025-11-23T12:00:02.000Z'
  },

  agentComplete: {
    agentId: '550e8400-e29b-41d4-a716-446655440000',
    result: {
      status: 'success',
      duration: 5000,
      messageCount: 10
    },
    timestamp: '2025-11-23T12:00:05.000Z'
  },

  agentDeleted: {
    agentId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: '2025-11-23T12:00:06.000Z'
  }
};
```

**Estimated Implementation Time**: 2 hours (all fixtures)

---

## SETUP & CONFIGURATION

### File: `test/setup/global-setup.ts`

**Purpose**: Global test configuration

```typescript
/**
 * Global test setup (runs once before all tests)
 */

export default async function globalSetup() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

  // Verify test database directory exists
  const testDbDir = path.join(__dirname, '../../data/test');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  console.log('✓ Global test setup complete');
}
```

### File: `test/setup/global-teardown.ts`

**Purpose**: Global test cleanup

```typescript
/**
 * Global test teardown (runs once after all tests)
 */

export default async function globalTeardown() {
  // Clean up test databases
  const testDbDir = path.join(__dirname, '../../data/test');

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }

  console.log('✓ Global test teardown complete');
}
```

### File: `test/setup/jest-extended.ts`

**Purpose**: Custom Jest matchers

```typescript
/**
 * Custom Jest matchers for domain-specific assertions
 */

expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid UUID`
          : `Expected ${received} to be a valid UUID v4`,
    };
  },

  toBeISO8601(received: string) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime()) && date.toISOString() === received;

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be ISO 8601`
          : `Expected ${received} to be valid ISO 8601 date string`,
    };
  },

  toHaveMonotonicSequence(received: AgentMessage[]) {
    let pass = true;
    let failureMessage = '';

    for (let i = 1; i < received.length; i++) {
      if (received[i].sequenceNumber <= received[i - 1].sequenceNumber) {
        pass = false;
        failureMessage = `Sequence not monotonic at index ${i}: ` +
          `${received[i - 1].sequenceNumber} → ${received[i].sequenceNumber}`;
        break;
      }
    }

    return {
      pass,
      message: () => failureMessage || 'Sequence is monotonic',
    };
  },
});

// Type declarations for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeISO8601(): R;
      toHaveMonotonicSequence(): R;
    }
  }
}
```

**Usage**:
```typescript
expect(agent.id.toString()).toBeValidUUID()
expect(agent.createdAt.toISOString()).toBeISO8601()
expect(messages).toHaveMonotonicSequence()
```

**Estimated Implementation Time**: 1.5 hours

---

## FRONTEND TEST HELPERS

### File: `frontend/test/helpers/redux-helpers.ts`

**Purpose**: Redux testing utilities

```typescript
import { createMockStore } from '@headless-agent-manager/client/testing';
import { connected, agentCreated, messageReceived } from '@headless-agent-manager/client';

/**
 * Create store with pre-populated state
 *
 * @param initialState - Initial state overrides
 * @returns Configured mock store
 */
export function createStoreWithState(initialState: Partial<RootState>) {
  const store = createMockStore();

  // Apply initial state via actions
  if (initialState.connection?.isConnected) {
    store.dispatch(connected({ connectionId: 'test-connection' }));
  }

  if (initialState.agents?.byId) {
    Object.values(initialState.agents.byId).forEach(agent => {
      store.dispatch(agentCreated(agent));
    });
  }

  return store;
}

/**
 * Wait for Redux state to match condition
 *
 * @param store - Redux store
 * @param selector - State selector
 * @param expected - Expected value
 * @param timeout - Timeout in ms
 */
export async function waitForReduxState<T>(
  store: any,
  selector: (state: any) => T,
  expected: T,
  timeout: number = 5000
): Promise<void> {
  const start = Date.now();

  while (true) {
    const actual = selector(store.getState());

    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      return;
    }

    if (Date.now() - start > timeout) {
      throw new Error(
        `Timeout waiting for state. Expected: ${JSON.stringify(expected)}, ` +
        `Got: ${JSON.stringify(actual)}`
      );
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Dispatch action and wait for state update
 */
export async function dispatchAndWait(
  store: any,
  action: any,
  selector: (state: any) => any,
  timeout: number = 5000
): Promise<void> {
  const stateBefore = selector(store.getState());

  store.dispatch(action);

  await waitFor(() => {
    const stateAfter = selector(store.getState());
    return JSON.stringify(stateBefore) !== JSON.stringify(stateAfter);
  }, timeout);
}
```

**Estimated Implementation Time**: 1.5 hours

---

## COMPLETE HELPER LIBRARY SUMMARY

| File | Purpose | Functions | Est. Time |
|------|---------|-----------|-----------|
| `helpers/database-helpers.ts` | DB operations | 8 | 2h |
| `helpers/async-helpers.ts` | Async utilities | 5 | 1h |
| `helpers/assertion-helpers.ts` | Custom assertions | 6 | 2h |
| `helpers/websocket-helpers.ts` | WebSocket utils | 6 | 2h |
| `mocks/agent-runner.mock.ts` | Runner mock | 1 factory | 1.5h |
| `mocks/websocket-gateway.mock.ts` | Gateway mock | 1 factory | 1h |
| `mocks/repository.mock.ts` | Repository mock | 1 factory | 1h |
| `setup/global-setup.ts` | Global config | 1 | 0.5h |
| `setup/global-teardown.ts` | Global cleanup | 1 | 0.5h |
| `setup/jest-extended.ts` | Custom matchers | 3 | 1.5h |
| `fixtures/` | Test data | Multiple | 2h |
| `frontend/test/helpers/redux-helpers.ts` | Redux utils | 3 | 1.5h |
| **Total** | - | **35+** | **17h** |

---

## Usage Examples

### Example 1: Integration Test with Helpers

```typescript
import { createTestDatabase, createTestAgent, cleanDatabase } from '@test/helpers/database-helpers';
import { waitFor } from '@test/helpers/async-helpers';
import { assertIsUUID, assertMonotonicSequence } from '@test/helpers/assertion-helpers';

describe('AgentOrchestration (Integration)', () => {
  let db: DatabaseService;

  beforeEach(() => {
    db = createTestDatabase(); // Helper!
  });

  afterEach(() => {
    cleanDatabase(db); // Helper!
    db.close();
  });

  it('should launch agent and save messages', async () => {
    const agent = await createTestAgent(db); // Helper!

    assertIsUUID(agent.id.toString()); // Helper!

    const messages = await createTestMessages(db, agent.id.toString(), 5); // Helper!

    assertMonotonicSequence(messages); // Helper!
  });
});
```

### Example 2: WebSocket Test with Helpers

```typescript
import { createTestSocket, waitForSocketEvent, subscribeToAgent } from '@test/helpers/websocket-helpers';

describe('Streaming (Integration)', () => {
  let socket: Socket;

  beforeEach(async () => {
    socket = await createTestSocket(); // Helper!
  });

  afterEach(() => {
    socket.close();
  });

  it('should stream messages to subscribed client', async () => {
    const agentId = await launchAgent();

    await subscribeToAgent(socket, agentId); // Helper!

    const messageEvent = await waitForSocketEvent(socket, 'agent:message'); // Helper!

    expect(messageEvent.agentId).toBe(agentId);
  });
});
```

### Example 3: Using Custom Matchers

```typescript
import '@test/setup/jest-extended'; // Load custom matchers

it('should return valid agent data', async () => {
  const agent = await service.launchAgent(dto);

  expect(agent.id.toString()).toBeValidUUID(); // Custom matcher!
  expect(agent.createdAt.toISOString()).toBeISO8601(); // Custom matcher!
});

it('should maintain message order', async () => {
  const messages = await getMessages();

  expect(messages).toHaveMonotonicSequence(); // Custom matcher!
});
```

---

## Implementation Priority

**Phase 1** (Week 1):
1. `database-helpers.ts` - Most frequently needed
2. `async-helpers.ts` - Critical for async tests
3. `assertion-helpers.ts` - Improve test readability

**Phase 2** (Week 2):
4. `websocket-helpers.ts` - For WebSocket tests
5. `agent-runner.mock.ts` - For service tests
6. `websocket-gateway.mock.ts` - For streaming tests

**Phase 3** (Week 3):
7. `repository.mock.ts` - For application tests
8. Fixtures - For adapter tests
9. Global setup/teardown

**Phase 4** (Week 4):
10. Custom Jest matchers
11. Frontend helpers
12. Documentation & examples

---

## Maintenance Guidelines

### Adding New Helpers

When adding a new helper function:

1. **Document it thoroughly** - Purpose, parameters, return value, examples
2. **Add tests for the helper** - Yes, test your test helpers!
3. **Update this document** - Keep specification current
4. **Add usage example** - Show how to use it

### Testing Test Helpers

```typescript
// Yes, test your test utilities!
describe('createTestDatabase helper', () => {
  it('should create database with FK enabled', () => {
    const db = createTestDatabase();

    const fk = db.getDatabase().pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);

    db.close();
  });
});
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-23
**Status**: Specification - Ready for Implementation
**Implementation Time**: 17 hours total
