# System Architecture Documentation

## Overview

The Headless AI Agent Management System follows **Clean Architecture (Hexagonal)** principles with strict layer separation and dependency inversion. This document provides detailed architectural guidance for developers.

---

## Architectural Principles

### 1. The Dependency Rule

**Core Principle**: Dependencies point inward. Inner layers know nothing about outer layers.

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│              (Controllers, WebSocket Gateways)               │
│                           │                                  │
│                           ▼ depends on                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Application Layer                       │   │
│  │         (Use Cases, Services, Ports)                │   │
│  │                     │                                │   │
│  │                     ▼ depends on                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │            Domain Layer                       │  │   │
│  │  │      (Entities, Value Objects, Rules)         │  │   │
│  │  │          NO DEPENDENCIES                      │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                     ▲                                │   │
│  │                     │ implements                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ▲                                  │
│                           │ implements ports                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Infrastructure Layer                       │   │
│  │    (Adapters, Repositories, External Services)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Key Rules:**
- Domain layer has ZERO dependencies (pure TypeScript)
- Application layer depends only on domain
- Infrastructure implements application ports
- Presentation depends on application services

### 2. Ports and Adapters Pattern

**Ports** (Interfaces) define contracts in the application layer.
**Adapters** implement ports in the infrastructure layer.

```typescript
// Application Layer: Port (Interface)
// File: src/application/ports/agent-runner.port.ts
export interface IAgentRunner {
  start(session: Session): Promise<Agent>;
  stop(agentId: AgentId): Promise<void>;
  subscribe(agentId: AgentId, observer: IAgentObserver): void;
}

// Infrastructure Layer: Adapter (Implementation)
// File: src/infrastructure/adapters/claude-code.adapter.ts
@Injectable()
export class ClaudeCodeAdapter implements IAgentRunner {
  constructor(
    private readonly processManager: IProcessManager,
    private readonly messageParser: IMessageParser
  ) {}

  async start(session: Session): Promise<Agent> {
    const process = this.processManager.spawn('claude', [
      '-p', session.prompt,
      '--output-format', 'stream-json'
    ]);
    // Implementation details...
  }
}
```

---

## Layer Details

### Domain Layer (`src/domain/`)

**Purpose**: Encapsulate core business logic and rules independent of frameworks.

**Components:**

#### Entities
Business objects with unique identity and lifecycle.

```typescript
// src/domain/entities/agent.entity.ts
export class Agent {
  private constructor(
    private readonly _id: AgentId,
    private _status: AgentStatus,
    private readonly _session: Session,
    private readonly _createdAt: Date,
    private _startedAt?: Date,
    private _completedAt?: Date
  ) {}

  static create(data: CreateAgentData): Agent {
    // Validation
    if (!data.type) {
      throw new DomainException('Agent type is required');
    }

    const id = AgentId.generate();
    const session = Session.create(data.prompt, data.configuration);

    return new Agent(
      id,
      AgentStatus.INITIALIZING,
      session,
      new Date()
    );
  }

  // Behavior methods
  markAsRunning(): void {
    if (this._status !== AgentStatus.INITIALIZING) {
      throw new DomainException('Agent must be initializing to start');
    }
    this._status = AgentStatus.RUNNING;
    this._startedAt = new Date();
  }

  markAsCompleted(): void {
    if (this._status !== AgentStatus.RUNNING) {
      throw new DomainException('Agent must be running to complete');
    }
    this._status = AgentStatus.COMPLETED;
    this._completedAt = new Date();
  }

  // Getters (no setters - immutable from outside)
  get id(): AgentId { return this._id; }
  get status(): AgentStatus { return this._status; }
  get session(): Session { return this._session; }
}
```

#### Value Objects
Objects without identity, defined by their values.

```typescript
// src/domain/value-objects/agent-id.vo.ts
export class AgentId {
  private constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new DomainException('AgentId cannot be empty');
    }
  }

  static generate(): AgentId {
    return new AgentId(crypto.randomUUID());
  }

  static fromString(value: string): AgentId {
    return new AgentId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: AgentId): boolean {
    return this.value === other.value;
  }
}

// src/domain/value-objects/agent-status.vo.ts
export enum AgentStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

**Design Guidelines:**
- Entities enforce invariants through private constructors
- Use factory methods (`create`, `fromString`) for construction
- No setters - behavior through methods
- Value objects are immutable
- Rich domain models (behavior + data)

---

### Application Layer (`src/application/`)

**Purpose**: Orchestrate domain objects to fulfill use cases.

**Components:**

#### Ports (Interfaces)
Define contracts for external dependencies.

```typescript
// src/application/ports/agent-runner.port.ts
export interface IAgentRunner {
  start(session: Session): Promise<Agent>;
  stop(agentId: AgentId): Promise<void>;
  getStatus(agentId: AgentId): Promise<AgentStatus>;
  subscribe(agentId: AgentId, observer: IAgentObserver): void;
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void;
}

// src/application/ports/agent-repository.port.ts
export interface IAgentRepository {
  save(agent: Agent): Promise<void>;
  findById(id: AgentId): Promise<Agent | null>;
  findAll(): Promise<Agent[]>;
  findByStatus(status: AgentStatus): Promise<Agent[]>;
  delete(id: AgentId): Promise<void>;
}

// src/application/ports/agent-factory.port.ts
export interface IAgentFactory {
  create(type: AgentType): IAgentRunner;
}
```

#### Services (Use Cases)
Coordinate domain objects and infrastructure.

```typescript
// src/application/services/agent-orchestration.service.ts
@Injectable()
export class AgentOrchestrationService {
  constructor(
    @Inject('IAgentFactory')
    private readonly agentFactory: IAgentFactory,

    @Inject('IAgentRepository')
    private readonly agentRepository: IAgentRepository,

    private readonly streamingService: StreamingService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  async launchAgent(request: LaunchAgentRequest): Promise<Agent> {
    // 1. Create domain entity
    const agent = Agent.create({
      type: request.type,
      prompt: request.prompt,
      configuration: request.configuration
    });

    try {
      // 2. Get appropriate runner from factory
      const runner = this.agentFactory.create(request.type);

      // 3. Subscribe streaming service to agent output
      runner.subscribe(agent.id, {
        onMessage: (message) => {
          this.streamingService.broadcastMessage(agent.id, message);
        },
        onStatusChange: (status) => {
          agent.updateStatus(status);
          this.agentRepository.save(agent);
          this.eventBus.emit('agent:status', { agentId: agent.id, status });
        },
        onError: (error) => {
          agent.markAsFailed(error);
          this.agentRepository.save(agent);
          this.eventBus.emit('agent:error', { agentId: agent.id, error });
        },
        onComplete: (result) => {
          agent.markAsCompleted();
          this.agentRepository.save(agent);
          this.eventBus.emit('agent:complete', { agentId: agent.id, result });
        }
      });

      // 4. Start the agent
      await runner.start(agent.session);
      agent.markAsRunning();

      // 5. Persist agent
      await this.agentRepository.save(agent);

      this.logger.info('Agent launched successfully', { agentId: agent.id });

      return agent;

    } catch (error) {
      agent.markAsFailed(error);
      await this.agentRepository.save(agent);
      this.logger.error('Failed to launch agent', { error, agentId: agent.id });
      throw error;
    }
  }

  async terminateAgent(agentId: AgentId): Promise<void> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }

    const runner = this.agentFactory.create(agent.type);
    await runner.stop(agentId);

    agent.markAsTerminated();
    await this.agentRepository.save(agent);

    this.eventBus.emit('agent:terminated', { agentId });
  }

  async getAgentStatus(agentId: AgentId): Promise<AgentStatus> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    return agent.status;
  }

  async listActiveAgents(): Promise<Agent[]> {
    return this.agentRepository.findByStatus(AgentStatus.RUNNING);
  }
}
```

#### DTOs (Data Transfer Objects)
Define request/response shapes for API boundaries.

```typescript
// src/application/dto/launch-agent.dto.ts
export class LaunchAgentDto {
  @IsEnum(AgentType)
  type: AgentType;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsOptional()
  @IsObject()
  configuration?: AgentConfiguration;
}

// src/application/dto/agent-response.dto.ts
export class AgentResponseDto {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  static fromEntity(agent: Agent): AgentResponseDto {
    return {
      id: agent.id.toString(),
      type: agent.type,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      startedAt: agent.startedAt?.toISOString(),
      completedAt: agent.completedAt?.toISOString()
    };
  }
}
```

---

### Infrastructure Layer (`src/infrastructure/`)

**Purpose**: Implement technical details and external integrations.

**Components:**

#### Adapters
Implement application ports with concrete technology.

```typescript
// src/infrastructure/adapters/claude-code.adapter.ts
@Injectable()
export class ClaudeCodeAdapter implements IAgentRunner {
  private runningAgents = new Map<string, ChildProcess>();
  private observers = new Map<string, IAgentObserver[]>();

  constructor(
    private readonly processManager: IProcessManager,
    private readonly messageParser: ClaudeMessageParser,
    private readonly logger: ILogger
  ) {}

  async start(session: Session): Promise<Agent> {
    const args = [
      '-p', session.prompt,
      '--output-format', 'stream-json'
    ];

    if (session.id) {
      args.push('--session-id', session.id);
    }

    const process = this.processManager.spawn('claude', args);
    const agentId = session.agentId.toString();
    this.runningAgents.set(agentId, process);

    // Subscribe to stdout stream
    const reader = this.processManager.getStreamReader(process);

    (async () => {
      try {
        for await (const line of reader) {
          const message = this.messageParser.parse(line);
          this.notifyObservers(agentId, 'onMessage', message);
        }
        this.notifyObservers(agentId, 'onComplete', { success: true });
      } catch (error) {
        this.notifyObservers(agentId, 'onError', error);
      }
    })();

    // Handle process events
    process.on('error', (error) => {
      this.notifyObservers(agentId, 'onError', error);
    });

    process.on('exit', (code) => {
      this.runningAgents.delete(agentId);
      if (code !== 0) {
        this.notifyObservers(agentId, 'onError',
          new Error(`Process exited with code ${code}`)
        );
      }
    });

    this.logger.info('Claude Code agent started', { agentId });
    return Agent.fromSession(session);
  }

  async stop(agentId: AgentId): Promise<void> {
    const id = agentId.toString();
    const process = this.runningAgents.get(id);

    if (!process) {
      throw new Error(`No running agent found: ${id}`);
    }

    process.kill('SIGTERM');
    this.runningAgents.delete(id);
    this.observers.delete(id);

    this.logger.info('Claude Code agent stopped', { agentId: id });
  }

  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const existing = this.observers.get(id) || [];
    this.observers.set(id, [...existing, observer]);
  }

  unsubscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const existing = this.observers.get(id) || [];
    this.observers.set(id, existing.filter(o => o !== observer));
  }

  private notifyObservers(
    agentId: string,
    method: keyof IAgentObserver,
    data: any
  ): void {
    const observers = this.observers.get(agentId) || [];
    observers.forEach(observer => {
      if (observer[method]) {
        (observer[method] as Function).call(observer, data);
      }
    });
  }
}
```

#### Process Manager
Abstraction over Node.js child_process.

```typescript
// src/infrastructure/process/process-manager.service.ts
@Injectable()
export class ProcessManager implements IProcessManager {
  private processes = new Map<number, ChildProcess>();

  constructor(private readonly logger: ILogger) {}

  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    this.processes.set(process.pid!, process);

    this.logger.debug('Process spawned', {
      command,
      args,
      pid: process.pid
    });

    process.on('exit', () => {
      this.processes.delete(process.pid!);
    });

    return process;
  }

  async kill(pid: number): Promise<void> {
    const process = this.processes.get(pid);
    if (!process) {
      throw new Error(`No process found with PID: ${pid}`);
    }

    return new Promise((resolve, reject) => {
      process.on('exit', () => {
        this.processes.delete(pid);
        resolve();
      });

      process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.processes.has(pid)) {
          process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  async *getStreamReader(process: ChildProcess): AsyncIterable<string> {
    const readline = createInterface({
      input: process.stdout!,
      crlfDelay: Infinity
    });

    for await (const line of readline) {
      yield line;
    }
  }
}
```

---

### Presentation Layer (`src/presentation/`)

**Purpose**: Handle HTTP/WebSocket communication with clients.

**Components:**

#### REST Controllers
Handle HTTP requests.

```typescript
// src/presentation/http/controllers/agent.controller.ts
@Controller('agents')
@ApiTags('agents')
export class AgentController {
  constructor(
    private readonly orchestrationService: AgentOrchestrationService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Launch a new agent' })
  @ApiResponse({ status: 201, type: AgentResponseDto })
  async launchAgent(@Body() dto: LaunchAgentDto): Promise<AgentResponseDto> {
    const agent = await this.orchestrationService.launchAgent(dto);
    return AgentResponseDto.fromEntity(agent);
  }

  @Get()
  @ApiOperation({ summary: 'List all agents' })
  async listAgents(): Promise<AgentResponseDto[]> {
    const agents = await this.orchestrationService.listActiveAgents();
    return agents.map(AgentResponseDto.fromEntity);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent by ID' })
  async getAgent(@Param('id') id: string): Promise<AgentResponseDto> {
    const agentId = AgentId.fromString(id);
    const agent = await this.orchestrationService.getAgentById(agentId);
    return AgentResponseDto.fromEntity(agent);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Terminate agent' })
  @HttpCode(204)
  async terminateAgent(@Param('id') id: string): Promise<void> {
    const agentId = AgentId.fromString(id);
    await this.orchestrationService.terminateAgent(agentId);
  }
}
```

#### WebSocket Gateway
Handle real-time communication.

```typescript
// src/presentation/websocket/agent.gateway.ts
@WebSocketGateway({ cors: true })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientSubscriptions = new Map<string, Set<AgentId>>();

  constructor(
    private readonly streamingService: StreamingService,
    private readonly logger: ILogger
  ) {}

  handleConnection(client: Socket): void {
    this.logger.info('Client connected', { clientId: client.id });
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket): void {
    const subscriptions = this.clientSubscriptions.get(client.id);

    subscriptions?.forEach(agentId => {
      this.streamingService.unsubscribe(agentId, client.id);
    });

    this.clientSubscriptions.delete(client.id);
    this.logger.info('Client disconnected', { clientId: client.id });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string }
  ): void {
    const agentId = AgentId.fromString(data.agentId);

    this.streamingService.subscribe(agentId, client.id, (message) => {
      client.emit('agent:message', {
        agentId: agentId.toString(),
        timestamp: new Date().toISOString(),
        message
      });
    });

    const subscriptions = this.clientSubscriptions.get(client.id)!;
    subscriptions.add(agentId);

    this.logger.debug('Client subscribed to agent', {
      clientId: client.id,
      agentId: agentId.toString()
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string }
  ): void {
    const agentId = AgentId.fromString(data.agentId);

    this.streamingService.unsubscribe(agentId, client.id);

    const subscriptions = this.clientSubscriptions.get(client.id)!;
    subscriptions.delete(agentId);

    this.logger.debug('Client unsubscribed from agent', {
      clientId: client.id,
      agentId: agentId.toString()
    });
  }
}
```

---

## Data Flow Diagrams

### Agent Launch Flow

```
┌─────────┐      POST /agents      ┌────────────────┐
│ Client  │ ───────────────────────>│ AgentController│
└─────────┘                         └───────┬────────┘
                                            │
                                            │ launchAgent(dto)
                                            ▼
                                ┌──────────────────────────┐
                                │ AgentOrchestrationService │
                                └──────────┬───────────────┘
                                           │
                   ┌───────────────────────┼───────────────────────┐
                   │                       │                       │
                   │ create entity         │ get runner        save│
                   ▼                       ▼                       ▼
           ┌──────────────┐      ┌────────────────┐     ┌──────────────────┐
           │ Agent.create │      │  AgentFactory  │     │ AgentRepository  │
           └──────────────┘      └───────┬────────┘     └──────────────────┘
                                         │
                                         │ returns IAgentRunner
                                         ▼
                              ┌────────────────────────┐
                              │  ClaudeCodeAdapter     │
                              │  (implements           │
                              │   IAgentRunner)        │
                              └───────┬────────────────┘
                                      │
                                      │ start(session)
                                      ▼
                              ┌────────────────────────┐
                              │   ProcessManager       │
                              │   spawn('claude'...)   │
                              └───────┬────────────────┘
                                      │
                                      │ stdout stream
                                      ▼
                              ┌────────────────────────┐
                              │  ClaudeMessageParser   │
                              └───────┬────────────────┘
                                      │
                                      │ onMessage callback
                                      ▼
                              ┌────────────────────────┐
                              │   StreamingService     │
                              └───────┬────────────────┘
                                      │
                                      │ broadcastMessage
                                      ▼
                              ┌────────────────────────┐
                              │   AgentGateway         │
                              │   (WebSocket)          │
                              └───────┬────────────────┘
                                      │
                                      │ emit('agent:message')
                                      ▼
                              ┌────────────────────────┐
                              │   Connected Clients    │
                              └────────────────────────┘
```

---

## Dependency Injection Setup

### Module Configuration (NestJS)

```typescript
// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot(),
    DomainModule,
    ApplicationModule,
    InfrastructureModule,
    PresentationModule
  ]
})
export class AppModule {}

// src/infrastructure/infrastructure.module.ts
@Module({
  providers: [
    ProcessManager,
    ClaudeMessageParser,
    GeminiMessageParser,
    {
      provide: 'IAgentFactory',
      useClass: AgentFactoryAdapter
    },
    {
      provide: 'IAgentRepository',
      useClass: InMemoryAgentRepository
    },
    ClaudeCodeAdapter,
    GeminiCLIAdapter
  ],
  exports: [
    'IAgentFactory',
    'IAgentRepository'
  ]
})
export class InfrastructureModule {}

// src/application/application.module.ts
@Module({
  imports: [InfrastructureModule],
  providers: [
    AgentOrchestrationService,
    StreamingService,
    SessionManagementService
  ],
  exports: [
    AgentOrchestrationService,
    StreamingService,
    SessionManagementService
  ]
})
export class ApplicationModule {}
```

---

## Best Practices

### 1. Keep Domain Pure
```typescript
// ✅ GOOD: Pure domain logic
class Agent {
  markAsCompleted(): void {
    if (this.status !== AgentStatus.RUNNING) {
      throw new DomainException('Cannot complete non-running agent');
    }
    this.status = AgentStatus.COMPLETED;
  }
}

// ❌ BAD: Framework dependencies in domain
class Agent {
  @Column()
  status: string; // TypeORM decorator!
}
```

### 2. Use Interfaces for Dependencies
```typescript
// ✅ GOOD: Depend on abstraction
class OrchestrationService {
  constructor(private readonly repository: IAgentRepository) {}
}

// ❌ BAD: Depend on concrete implementation
class OrchestrationService {
  constructor(private readonly repository: InMemoryAgentRepository) {}
}
```

### 3. Single Responsibility
```typescript
// ✅ GOOD: Focused responsibility
class ClaudeMessageParser {
  parse(line: string): AgentMessage { /*...*/ }
}

// ❌ BAD: Too many responsibilities
class ClaudeAdapter {
  parse(line: string): AgentMessage { /*...*/ }
  start(session: Session): Promise<Agent> { /*...*/ }
  log(message: string): void { /*...*/ }
  saveToDatabase(agent: Agent): Promise<void> { /*...*/ }
}
```

---

## Testing the Architecture

### Testing Layers in Isolation

**Domain Tests** (no dependencies):
```typescript
describe('Agent', () => {
  it('should create agent in initializing state', () => {
    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test',
      configuration: {}
    });

    expect(agent.status).toBe(AgentStatus.INITIALIZING);
  });
});
```

**Application Tests** (mock ports):
```typescript
describe('AgentOrchestrationService', () => {
  let service: AgentOrchestrationService;
  let mockFactory: jest.Mocked<IAgentFactory>;
  let mockRepository: jest.Mocked<IAgentRepository>;

  beforeEach(() => {
    mockFactory = createMock<IAgentFactory>();
    mockRepository = createMock<IAgentRepository>();
    service = new AgentOrchestrationService(
      mockFactory,
      mockRepository,
      // ... other mocks
    );
  });

  it('should launch agent successfully', async () => {
    const mockRunner = createMock<IAgentRunner>();
    mockFactory.create.mockReturnValue(mockRunner);

    await service.launchAgent({ type: 'claude-code', prompt: 'test' });

    expect(mockRunner.start).toHaveBeenCalled();
    expect(mockRepository.save).toHaveBeenCalled();
  });
});
```

---

**Last Updated**: 2025-11-09
**Status**: Living Document - Update as architecture evolves
