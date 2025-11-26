# Testing Guide - TDD Best Practices

## Philosophy

This project follows **strict Test-Driven Development (TDD)**. Every line of production code must be written in response to a failing test. No exceptions.

---

## The Red-Green-Refactor Cycle

### Workflow

```
┌──────────────────────────────────────────────────────────┐
│  1. RED: Write failing test                              │
│     - Write test for ONE behavior                        │
│     - Run test → verify it FAILS                         │
│     - If it passes without implementation, test is wrong │
├──────────────────────────────────────────────────────────┤
│  2. GREEN: Make it pass                                  │
│     - Write MINIMAL code to pass the test                │
│     - Don't add "might need later" code                  │
│     - Run test → verify it PASSES                        │
├──────────────────────────────────────────────────────────┤
│  3. REFACTOR: Improve code                               │
│     - Remove duplication                                 │
│     - Improve naming                                     │
│     - Extract methods/classes                            │
│     - Run test → verify it still PASSES                  │
├──────────────────────────────────────────────────────────┤
│  4. COMMIT: Save progress                                │
│     - Commit test + implementation together              │
│     - Descriptive message: what behavior was added       │
├──────────────────────────────────────────────────────────┤
│  5. REPEAT: Next behavior                                │
│     - Back to step 1 for next test                       │
└──────────────────────────────────────────────────────────┘
```

### Example TDD Session

**Feature**: Create an Agent entity

```typescript
// STEP 1: RED - Write failing test
describe('Agent', () => {
  it('should create agent with INITIALIZING status', () => {
    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {}
    });

    expect(agent.status).toBe(AgentStatus.INITIALIZING);
  });
});

// Run test → FAILS (Agent.create doesn't exist)
```

```typescript
// STEP 2: GREEN - Minimal implementation
export class Agent {
  constructor(
    private _status: AgentStatus,
    // ... other fields
  ) {}

  static create(data: CreateAgentData): Agent {
    return new Agent(AgentStatus.INITIALIZING);
  }

  get status(): AgentStatus {
    return this._status;
  }
}

// Run test → PASSES
```

```typescript
// STEP 3: REFACTOR - Improve code
export class Agent {
  private constructor( // Make constructor private
    private readonly _id: AgentId, // Add missing fields
    private _status: AgentStatus,
    private readonly _session: Session,
    private readonly _createdAt: Date
  ) {}

  static create(data: CreateAgentData): Agent {
    // Add validation
    if (!data.prompt) {
      throw new DomainException('Prompt is required');
    }

    return new Agent(
      AgentId.generate(),
      AgentStatus.INITIALIZING,
      Session.create(data.prompt, data.configuration),
      new Date()
    );
  }

  get status(): AgentStatus {
    return this._status;
  }
}

// Run test → Still PASSES
```

```bash
# STEP 4: COMMIT
git add .
git commit -m "feat: create agent with INITIALIZING status"
```

```typescript
// STEP 5: REPEAT - Next behavior
describe('Agent', () => {
  it('should transition to RUNNING when started', () => {
    const agent = Agent.create({/*...*/});

    agent.markAsRunning();

    expect(agent.status).toBe(AgentStatus.RUNNING);
  });
});

// Run test → FAILS (markAsRunning doesn't exist)
// ... continue cycle
```

---

## Test Pyramid

### Distribution

```
         ╱╲
        ╱  ╲       E2E (5%)
       ╱────╲      - Full system tests
      ╱      ╲     - Critical user flows only
     ╱────────╲    - Slow, expensive
    ╱          ╲
   ╱────────────╲  Integration (15%)
  ╱              ╲ - Multiple components
 ╱────────────────╲ - Real dependencies
╱                  ╲
╱──────────────────╲ Unit Tests (80%)
                     - Single class/function
                     - Fast, isolated
                     - Mocked dependencies
```

### Test Coverage Targets

- **Overall**: 80% minimum
- **Domain Layer**: 100% (pure business logic)
- **Application Layer**: 95% (orchestration)
- **Infrastructure Layer**: 80% (adapters, parsers)
- **Presentation Layer**: 70% (controllers, gateways)

---

## Unit Testing

### Characteristics

✅ **Fast**: <5ms per test
✅ **Isolated**: No external dependencies
✅ **Deterministic**: Same input → same output
✅ **Independent**: Order doesn't matter

### Domain Layer Tests

**Testing Entities:**

```typescript
// test/unit/domain/entities/agent.entity.spec.ts
describe('Agent Entity', () => {
  describe('create', () => {
    it('should create agent with generated ID', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {}
      });

      expect(agent.id).toBeDefined();
      expect(agent.id.toString()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    });

    it('should throw when prompt is empty', () => {
      expect(() => {
        Agent.create({
          type: AgentType.CLAUDE_CODE,
          prompt: '',
          configuration: {}
        });
      }).toThrow(DomainException);
    });
  });

  describe('markAsRunning', () => {
    it('should transition from INITIALIZING to RUNNING', () => {
      const agent = Agent.create({/*...*/});

      agent.markAsRunning();

      expect(agent.status).toBe(AgentStatus.RUNNING);
      expect(agent.startedAt).toBeDefined();
    });

    it('should throw when not in INITIALIZING state', () => {
      const agent = Agent.create({/*...*/});
      agent.markAsRunning();

      expect(() => agent.markAsRunning()).toThrow(
        'Agent must be initializing to start'
      );
    });
  });
});
```

**Testing Value Objects:**

```typescript
// test/unit/domain/value-objects/agent-id.vo.spec.ts
describe('AgentId Value Object', () => {
  describe('generate', () => {
    it('should generate unique IDs', () => {
      const id1 = AgentId.generate();
      const id2 = AgentId.generate();

      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('fromString', () => {
    it('should create AgentId from valid string', () => {
      const id = AgentId.fromString('test-id-123');

      expect(id.toString()).toBe('test-id-123');
    });

    it('should throw when string is empty', () => {
      expect(() => AgentId.fromString('')).toThrow(DomainException);
    });
  });

  describe('equals', () => {
    it('should return true for same value', () => {
      const id1 = AgentId.fromString('same-id');
      const id2 = AgentId.fromString('same-id');

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different values', () => {
      const id1 = AgentId.fromString('id-1');
      const id2 = AgentId.fromString('id-2');

      expect(id1.equals(id2)).toBe(false);
    });
  });
});
```

### Application Layer Tests

**Testing Services with Mocks:**

```typescript
// test/unit/application/services/agent-orchestration.service.spec.ts
describe('AgentOrchestrationService', () => {
  let service: AgentOrchestrationService;
  let mockAgentFactory: jest.Mocked<IAgentFactory>;
  let mockAgentRepository: jest.Mocked<IAgentRepository>;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockEventBus: jest.Mocked<IEventBus>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    // Create mocks
    mockAgentFactory = {
      create: jest.fn()
    } as any;

    mockAgentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn()
    } as any;

    mockStreamingService = {
      subscribeToAgent: jest.fn(),
      broadcastMessage: jest.fn()
    } as any;

    mockEventBus = {
      emit: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    // Create service with mocks
    service = new AgentOrchestrationService(
      mockAgentFactory,
      mockAgentRepository,
      mockStreamingService,
      mockEventBus,
      mockLogger
    );
  });

  describe('launchAgent', () => {
    it('should create and start agent successfully', async () => {
      // Arrange
      const request = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'test prompt',
        configuration: {}
      };

      const mockRunner = {
        start: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn()
      } as any;

      mockAgentFactory.create.mockReturnValue(mockRunner);
      mockAgentRepository.save.mockResolvedValue(undefined);

      // Act
      const result = await service.launchAgent(request);

      // Assert
      expect(result.status).toBe(AgentStatus.RUNNING);
      expect(mockAgentFactory.create).toHaveBeenCalledWith(AgentType.CLAUDE_CODE);
      expect(mockRunner.start).toHaveBeenCalled();
      expect(mockAgentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AgentStatus.RUNNING
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent launched successfully',
        expect.any(Object)
      );
    });

    it('should mark agent as failed when start throws error', async () => {
      // Arrange
      const request = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {}
      };

      const mockRunner = {
        start: jest.fn().mockRejectedValue(new Error('Failed to start')),
        subscribe: jest.fn()
      } as any;

      mockAgentFactory.create.mockReturnValue(mockRunner);
      mockAgentRepository.save.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.launchAgent(request)).rejects.toThrow('Failed to start');

      expect(mockAgentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AgentStatus.FAILED
        })
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('terminateAgent', () => {
    it('should stop agent and mark as terminated', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {}
      });
      agent.markAsRunning();

      const mockRunner = {
        stop: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockAgentRepository.findById.mockResolvedValue(agent);
      mockAgentFactory.create.mockReturnValue(mockRunner);
      mockAgentRepository.save.mockResolvedValue(undefined);

      // Act
      await service.terminateAgent(agent.id);

      // Assert
      expect(mockRunner.stop).toHaveBeenCalledWith(agent.id);
      expect(agent.status).toBe(AgentStatus.TERMINATED);
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:terminated', {
        agentId: agent.id
      });
    });

    it('should throw NotFoundException when agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      mockAgentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.terminateAgent(agentId)).rejects.toThrow(NotFoundException);
    });
  });
});
```

### Infrastructure Layer Tests

**Testing Adapters:**

```typescript
// test/unit/infrastructure/adapters/claude-code.adapter.spec.ts
describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let mockProcessManager: jest.Mocked<IProcessManager>;
  let mockMessageParser: jest.Mocked<ClaudeMessageParser>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockProcessManager = {
      spawn: jest.fn(),
      kill: jest.fn(),
      getStreamReader: jest.fn()
    } as any;

    mockMessageParser = {
      parse: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    } as any;

    adapter = new ClaudeCodeAdapter(
      mockProcessManager,
      mockMessageParser,
      mockLogger
    );
  });

  describe('start', () => {
    it('should spawn claude process with correct arguments', async () => {
      // Arrange
      const session = Session.create('test prompt', {});
      const mockProcess = new EventEmitter() as ChildProcess;

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function*() {
          yield '{"type":"system","content":"test"}';
        })()
      );

      // Act
      await adapter.start(session);

      // Assert
      expect(mockProcessManager.spawn).toHaveBeenCalledWith('claude', [
        '-p', 'test prompt',
        '--output-format', 'stream-json'
      ]);
    });

    it('should parse output lines and notify observers', async () => {
      // Arrange
      const session = Session.create('test prompt', {});
      const mockProcess = new EventEmitter() as ChildProcess;
      const parsedMessage = { type: 'assistant', content: 'response' };

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function*() {
          yield '{"type":"assistant","content":"response"}';
        })()
      );
      mockMessageParser.parse.mockReturnValue(parsedMessage as any);

      const observer = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn()
      };

      adapter.subscribe(session.agentId, observer);

      // Act
      await adapter.start(session);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(mockMessageParser.parse).toHaveBeenCalledWith(
        '{"type":"assistant","content":"response"}'
      );
      expect(observer.onMessage).toHaveBeenCalledWith(parsedMessage);
    });
  });

  describe('stop', () => {
    it('should terminate process and clean up', async () => {
      // Arrange
      const session = Session.create('test', {});
      const mockProcess = new EventEmitter() as ChildProcess;
      mockProcess.kill = jest.fn();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function*() {})()
      );

      await adapter.start(session);

      // Act
      await adapter.stop(session.agentId);

      // Assert
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
```

---

## Integration Testing

### Characteristics

✅ **Test component interactions**
✅ **Use real dependencies** (databases, file systems)
✅ **Test boundaries** (API, CLI, external services)
✅ **Slower than unit tests** but faster than E2E

### Testing Adapters with Real CLIs

```typescript
// test/integration/adapters/claude-code.adapter.integration.spec.ts
describe('ClaudeCodeAdapter Integration', () => {
  let adapter: ClaudeCodeAdapter;
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager(new ConsoleLogger());
    const messageParser = new ClaudeMessageParser();
    adapter = new ClaudeCodeAdapter(
      processManager,
      messageParser,
      new ConsoleLogger()
    );
  });

  afterEach(async () => {
    // Clean up any running processes
  });

  it('should successfully start Claude Code and receive output', async () => {
    // Arrange
    const session = Session.create('print "Hello World"', {});
    const messages: AgentMessage[] = [];

    const observer: IAgentObserver = {
      onMessage: (message) => messages.push(message),
      onStatusChange: jest.fn(),
      onError: jest.fn(),
      onComplete: jest.fn()
    };

    adapter.subscribe(session.agentId, observer);

    // Act
    await adapter.start(session);

    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.type === 'assistant')).toBe(true);
  }, 10000); // Longer timeout for real CLI

  it('should handle CLI errors gracefully', async () => {
    // Arrange
    const session = Session.create('invalid command syntax', {});
    const errors: Error[] = [];

    const observer: IAgentObserver = {
      onMessage: jest.fn(),
      onStatusChange: jest.fn(),
      onError: (error) => errors.push(error),
      onComplete: jest.fn()
    };

    adapter.subscribe(session.agentId, observer);

    // Act
    await adapter.start(session);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert
    expect(errors.length).toBeGreaterThan(0);
  }, 10000);
});
```

### Testing API Endpoints

```typescript
// test/integration/api/agent.controller.integration.spec.ts
describe('AgentController Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /agents', () => {
    it('should launch agent and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .send({
          type: 'claude-code',
          prompt: 'echo "test"',
          configuration: {}
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        type: 'claude-code',
        status: 'initializing'
      });
    });

    it('should return 400 for invalid request', async () => {
      await request(app.getHttpServer())
        .post('/agents')
        .send({
          type: 'invalid-type',
          prompt: ''
        })
        .expect(400);
    });
  });

  describe('GET /agents/:id', () => {
    it('should return agent details', async () => {
      // First create an agent
      const createResponse = await request(app.getHttpServer())
        .post('/agents')
        .send({
          type: 'claude-code',
          prompt: 'test',
          configuration: {}
        });

      const agentId = createResponse.body.id;

      // Then fetch it
      const response = await request(app.getHttpServer())
        .get(`/agents/${agentId}`)
        .expect(200);

      expect(response.body.id).toBe(agentId);
    });
  });
});
```

---

## E2E Testing

### Characteristics

✅ **Test complete user flows**
✅ **All real components**
✅ **Browser/client simulation**
✅ **Slowest, most expensive**

### Example E2E Test

```typescript
// test/e2e/agent-lifecycle.e2e.spec.ts
describe('Agent Lifecycle E2E', () => {
  let app: INestApplication;
  let websocketClient: Socket;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(3000);

    websocketClient = io('http://localhost:3000');
  });

  afterAll(async () => {
    websocketClient.close();
    await app.close();
  });

  it('should launch agent, stream output, and complete', async () => {
    // STEP 1: Launch agent via REST API
    const launchResponse = await request(app.getHttpServer())
      .post('/agents')
      .send({
        type: 'claude-code',
        prompt: 'echo "Hello from E2E test"',
        configuration: {}
      })
      .expect(201);

    const agentId = launchResponse.body.id;

    // STEP 2: Subscribe to agent output via WebSocket
    const messages: any[] = [];
    let completed = false;

    websocketClient.emit('subscribe', { agentId });

    await new Promise<void>((resolve) => {
      websocketClient.on('agent:message', (data) => {
        messages.push(data);
      });

      websocketClient.on('agent:complete', (data) => {
        completed = true;
        resolve();
      });

      // Timeout after 30 seconds
      setTimeout(() => resolve(), 30000);
    });

    // STEP 3: Verify results
    expect(messages.length).toBeGreaterThan(0);
    expect(completed).toBe(true);

    // STEP 4: Verify agent status via API
    const statusResponse = await request(app.getHttpServer())
      .get(`/agents/${agentId}`)
      .expect(200);

    expect(statusResponse.body.status).toBe('completed');
  }, 35000);
});
```

---

## Test Organization

### File Structure

```
backend/test/
├── unit/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── agent.entity.spec.ts
│   │   │   ├── session.entity.spec.ts
│   │   │   └── task.entity.spec.ts
│   │   └── value-objects/
│   │       ├── agent-id.vo.spec.ts
│   │       └── agent-status.vo.spec.ts
│   ├── application/
│   │   └── services/
│   │       ├── agent-orchestration.service.spec.ts
│   │       └── streaming.service.spec.ts
│   └── infrastructure/
│       ├── adapters/
│       │   ├── claude-code.adapter.spec.ts
│       │   └── gemini-cli.adapter.spec.ts
│       └── parsers/
│           └── claude-message.parser.spec.ts
├── integration/
│   ├── adapters/
│   │   └── claude-code.adapter.integration.spec.ts
│   └── api/
│       └── agent.controller.integration.spec.ts
├── e2e/
│   ├── agent-lifecycle.e2e.spec.ts
│   └── multi-agent.e2e.spec.ts
└── fixtures/
    ├── claude-output.jsonl
    ├── gemini-output.json
    └── test-helpers.ts
```

### Naming Conventions

- **Unit tests**: `*.spec.ts`
- **Integration tests**: `*.integration.spec.ts`
- **E2E tests**: `*.e2e.spec.ts`
- **Fixtures**: Descriptive names in `/fixtures/`

---

## Test Utilities

### Mock Factory

```typescript
// test/fixtures/test-helpers.ts
export class TestFactory {
  static createAgent(overrides?: Partial<CreateAgentData>): Agent {
    return Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
      ...overrides
    });
  }

  static createSession(overrides?: Partial<any>): Session {
    return Session.create('test prompt', {}, ...overrides);
  }

  static createMockRunner(): jest.Mocked<IAgentRunner> {
    return {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    } as any;
  }
}
```

### Test Fixtures

```typescript
// test/fixtures/claude-output.jsonl
{"type":"system","role":"init","content":"Session started"}
{"type":"user","content":"echo 'Hello'"}
{"type":"assistant","content":"I'll echo 'Hello' for you."}
{"type":"system","role":"result","stats":{"duration":1234}}
```

---

## Running Tests

### Commands

```bash
# Run all tests
npm test

# Watch mode (recommended for TDD)
npm run test:watch

# Run specific test file
npm test -- agent.entity.spec.ts

# Run tests matching pattern
npm test -- --testNamePattern="should create agent"

# Coverage report
npm run test:coverage

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Debug mode
npm run test:debug
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.integration.spec.ts', '**/*.e2e.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.interface.ts',
    '!src/main.ts'
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/domain/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
};
```

---

## Best Practices

### 1. One Assertion Per Test (Guideline, Not Rule)

```typescript
// ✅ GOOD: Focused test
it('should create agent with INITIALIZING status', () => {
  const agent = Agent.create({/*...*/});
  expect(agent.status).toBe(AgentStatus.INITIALIZING);
});

it('should assign unique ID to agent', () => {
  const agent = Agent.create({/*...*/});
  expect(agent.id).toBeDefined();
});

// ⚠️ ACCEPTABLE: Related assertions
it('should create agent with valid initial state', () => {
  const agent = Agent.create({/*...*/});
  expect(agent.status).toBe(AgentStatus.INITIALIZING);
  expect(agent.startedAt).toBeUndefined();
  expect(agent.completedAt).toBeUndefined();
});
```

### 2. Arrange-Act-Assert Pattern

```typescript
it('should mark agent as running', () => {
  // Arrange: Set up test data
  const agent = Agent.create({
    type: AgentType.CLAUDE_CODE,
    prompt: 'test',
    configuration: {}
  });

  // Act: Perform the action
  agent.markAsRunning();

  // Assert: Verify the outcome
  expect(agent.status).toBe(AgentStatus.RUNNING);
  expect(agent.startedAt).toBeDefined();
});
```

### 3. Test Behavior, Not Implementation

```typescript
// ✅ GOOD: Test behavior
it('should notify observers when message received', () => {
  const observer = { onMessage: jest.fn() };
  adapter.subscribe(agentId, observer);

  adapter.handleMessage(message);

  expect(observer.onMessage).toHaveBeenCalledWith(message);
});

// ❌ BAD: Test implementation details
it('should store observer in map', () => {
  adapter.subscribe(agentId, observer);
  expect(adapter['observers'].has(agentId)).toBe(true); // Testing private field!
});
```

### 4. Descriptive Test Names

```typescript
// ✅ GOOD: Clear, descriptive
it('should throw DomainException when prompt is empty', () => {/*...*/});
it('should transition to RUNNING when markAsRunning called', () => {/*...*/});
it('should notify all observers when agent completes', () => {/*...*/});

// ❌ BAD: Vague, unclear
it('should work', () => {/*...*/});
it('test agent', () => {/*...*/});
it('handles errors', () => {/*...*/});
```

### 5. Test Error Cases

```typescript
describe('Agent.create', () => {
  it('should create agent with valid data', () => {
    // Happy path
  });

  it('should throw when prompt is empty', () => {
    expect(() => Agent.create({ prompt: '' })).toThrow();
  });

  it('should throw when type is invalid', () => {
    expect(() => Agent.create({ type: 'invalid' as any })).toThrow();
  });

  it('should throw when configuration is null', () => {
    expect(() => Agent.create({ configuration: null as any })).toThrow();
  });
});
```

---

## CI/CD Integration

### Pre-commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npm run test:unit
npm run test:lint
```

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Common Pitfalls

### ❌ Writing Tests After Implementation

```typescript
// WRONG WORKFLOW:
// 1. Write implementation
// 2. Write tests to match implementation
// Result: Tests don't drive design, miss edge cases
```

### ✅ Writing Tests First (TDD)

```typescript
// CORRECT WORKFLOW:
// 1. Write test describing desired behavior
// 2. Watch it fail
// 3. Write minimal code to pass
// 4. Refactor
// Result: Better design, comprehensive coverage
```

### ❌ Testing Implementation Details

```typescript
// BAD: Testing private methods
it('should call _validatePrompt internally', () => {
  const spy = jest.spyOn(agent as any, '_validatePrompt');
  agent.create({/*...*/});
  expect(spy).toHaveBeenCalled();
});
```

### ✅ Testing Public Behavior

```typescript
// GOOD: Testing observable behavior
it('should throw when prompt is invalid', () => {
  expect(() => agent.create({ prompt: '' })).toThrow(DomainException);
});
```

---

## Checklist Before Committing

- [ ] All new code has corresponding tests
- [ ] All tests pass (`npm test`)
- [ ] Coverage hasn't decreased
- [ ] Tests follow AAA pattern
- [ ] Test names are descriptive
- [ ] Error cases tested
- [ ] No skipped tests (`.skip`) unless documented
- [ ] No focused tests (`.only`)
- [ ] TypeScript compiles without errors
- [ ] ESLint passes

---

**Last Updated**: 2025-11-09
**Status**: Living Document
