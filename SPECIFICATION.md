# Headless AI Agent Management System - MVP Specification

> **⚠️ CRITICAL UPDATE (2025-11-09)**: During implementation, we discovered that Claude CLI **does not output to stdout/stderr when spawned from Node.js child_process** (GitHub issues #6775, #771). This is an upstream limitation in Claude CLI itself.
>
> **RECOMMENDED SOLUTION**: Use the official Claude Code TypeScript SDK instead of CLI spawning for production implementation. The current architecture supports easy adapter swap-in.
>
> See: `CRITICAL_DISCOVERY_CLAUDE_CLI.md` for full details

## 1. Executive Summary

A backend application that orchestrates multiple headless AI agents running concurrently, with real-time streaming of agent outputs to a web-based frontend. The system follows clean architecture principles with dependency injection, comprehensive test coverage, and extensibility for future agent integrations.

**Note**: Original spec planned CLI spawning for Claude Code and Gemini CLI. Implementation validated the architecture but revealed Claude CLI cannot be spawned from Node.js. SDK integration is recommended for production.

---

## 2. System Requirements

### 2.1 Functional Requirements

**FR-1: Agent Lifecycle Management**
- Launch headless instances of Claude Code and Gemini CLI programmatically
- Manage multiple agent instances concurrently (no hard limit for MVP)
- Track agent state: initializing, running, paused, completed, failed
- Gracefully terminate agent instances
- Support agent resume/continuation for multi-turn conversations

**FR-2: Asynchronous Execution**
- Execute agent tasks asynchronously without blocking
- Queue management for agent task scheduling
- Handle concurrent agent execution with resource management
- Support cancellation of running tasks

**FR-3: Real-time Streaming**
- Stream agent output (stdout/stderr) in real-time to connected clients
- Parse and structure JSONL output from CLIs
- Broadcast agent events: started, progress, completed, error
- Support multiple concurrent client subscriptions per agent

**FR-4: Dependency Injection Architecture**
- IoC container for service resolution
- Interface-based design for all major components
- Factory patterns for agent instantiation
- Configuration-driven service registration

**FR-5: Frontend Integration**
- Minimal web UI for agent monitoring and testing
- Real-time display of agent outputs
- Agent management controls (start, stop, view logs)
- Multi-agent dashboard view

### 2.2 Non-Functional Requirements

**NFR-1: Testability**
- 80%+ code coverage target
- Unit tests for all business logic
- Integration tests for agent orchestration
- E2E tests for critical user flows
- TDD approach throughout development

**NFR-2: Maintainability**
- SOLID principles adherence
- Clean Architecture/Hexagonal Architecture
- Comprehensive inline documentation
- Clear separation of concerns

**NFR-3: Extensibility**
- Plugin architecture for new agent types
- Configuration-based agent definitions
- Minimal code changes for new CLI integrations

**NFR-4: Performance**
- Handle 10+ concurrent agents (MVP baseline)
- Sub-100ms latency for streaming updates
- Efficient memory management for long-running agents

**NFR-5: Reliability**
- Graceful error handling and recovery
- Agent failure isolation (one agent failure doesn't crash system)
- Comprehensive logging and observability

---

## 3. Technical Architecture

### 3.1 Architecture Pattern: Clean Architecture (Hexagonal)

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐         ┌──────────────────────────────┐  │
│  │   REST API   │         │   WebSocket Gateway          │  │
│  │  Controllers │         │   (Real-time Streaming)      │  │
│  └──────────────┘         └──────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Application Layer                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             Use Cases / Services                      │   │
│  │  - AgentOrchestrationService                         │   │
│  │  - StreamingService                                  │   │
│  │  - SessionManagementService                          │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     Domain Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Entities   │  │   Value      │  │    Domain        │  │
│  │   - Agent    │  │   Objects    │  │    Services      │  │
│  │   - Session  │  │   - AgentId  │  │                  │  │
│  │   - Task     │  │   - Status   │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Infrastructure Layer                        │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ Agent Adapters   │  │   External Services          │    │
│  │ - ClaudeCode     │  │   - FileSystemRepository     │    │
│  │ - GeminiCLI      │  │   - EventBus                 │    │
│  │ (implements      │  │   - LoggerService            │    │
│  │  IAgentRunner)   │  │                              │    │
│  └──────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Core Components

#### 3.2.1 Domain Layer

**Agent (Entity)**
```typescript
interface Agent {
  id: AgentId;
  type: AgentType; // 'claude-code' | 'gemini-cli'
  status: AgentStatus;
  session: Session;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

**Session (Value Object)**
```typescript
interface Session {
  id: string;
  prompt: string;
  configuration: AgentConfiguration;
  conversationHistory: Message[];
}
```

**AgentStatus (Value Object)**
```typescript
enum AgentStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

#### 3.2.2 Application Layer

**IAgentRunner (Port)**
```typescript
interface IAgentRunner {
  start(session: Session): Promise<Agent>;
  stop(agentId: AgentId): Promise<void>;
  getStatus(agentId: AgentId): Promise<AgentStatus>;
  subscribe(agentId: AgentId, observer: IAgentObserver): void;
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void;
}
```

**IAgentObserver (Port)**
```typescript
interface IAgentObserver {
  onMessage(message: AgentMessage): void;
  onStatusChange(status: AgentStatus): void;
  onError(error: AgentError): void;
  onComplete(result: AgentResult): void;
}
```

**AgentOrchestrationService (Use Case)**
```typescript
class AgentOrchestrationService {
  constructor(
    private agentFactory: IAgentFactory,
    private agentRepository: IAgentRepository,
    private streamingService: StreamingService,
    private eventBus: IEventBus
  ) {}

  async launchAgent(request: LaunchAgentRequest): Promise<Agent>;
  async terminateAgent(agentId: AgentId): Promise<void>;
  async getAgentStatus(agentId: AgentId): Promise<AgentStatus>;
  async listActiveAgents(): Promise<Agent[]>;
}
```

**StreamingService (Use Case)**
```typescript
class StreamingService {
  constructor(
    private websocketGateway: IWebSocketGateway,
    private messageParser: IMessageParser
  ) {}

  subscribeToAgent(agentId: AgentId, clientId: string): void;
  unsubscribeFromAgent(agentId: AgentId, clientId: string): void;
  broadcastMessage(agentId: AgentId, message: AgentMessage): void;
}
```

#### 3.2.3 Infrastructure Layer

**ClaudeCodeAdapter (Adapter)**
```typescript
class ClaudeCodeAdapter implements IAgentRunner {
  constructor(
    private processManager: IProcessManager,
    private messageParser: IMessageParser
  ) {}

  async start(session: Session): Promise<Agent> {
    // Spawn: claude -p "{prompt}" --output-format stream-json
    // Parse JSONL output stream
    // Emit events via observer pattern
  }
}
```

**GeminiCLIAdapter (Adapter)**
```typescript
class GeminiCLIAdapter implements IAgentRunner {
  constructor(
    private processManager: IProcessManager,
    private messageParser: IMessageParser
  ) {}

  async start(session: Session): Promise<Agent> {
    // Spawn: gemini -p "{prompt}" --output-format stream-json --yolo
    // Parse JSON/JSONL output stream
    // Emit events via observer pattern
  }
}
```

**ProcessManager (Infrastructure Service)**
```typescript
interface IProcessManager {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;
  kill(pid: number): Promise<void>;
  getStreamReader(process: ChildProcess): AsyncIterable<string>;
}
```

### 3.3 Data Flow

```
1. Client Request (Frontend)
   │
   ▼
2. REST API / WebSocket Gateway
   │
   ▼
3. AgentOrchestrationService
   │
   ├──▶ Create Agent Entity
   │
   ├──▶ AgentFactory.create(type)
   │    │
   │    └──▶ Returns IAgentRunner (ClaudeCodeAdapter | GeminiCLIAdapter)
   │
   ├──▶ AgentRunner.start(session)
   │    │
   │    └──▶ ProcessManager spawns CLI process
   │         │
   │         └──▶ Streams stdout/stderr
   │
   ├──▶ Subscribe StreamingService to Agent
   │
   └──▶ Store Agent in Repository
        │
        ▼
4. Agent Output Stream (JSONL)
   │
   ▼
5. MessageParser processes output
   │
   ▼
6. StreamingService broadcasts to subscribers
   │
   ▼
7. WebSocket Gateway pushes to connected clients
   │
   ▼
8. Frontend receives real-time updates
```

---

## 4. Technology Stack

### 4.1 Backend

**Runtime & Language**
- **Node.js 20+ with TypeScript 5.x**
  - Excellent async/event-driven architecture
  - Native child_process support for CLI spawning
  - Strong ecosystem for DI and testing
  - Claude Code SDK available (TypeScript)

**Web Framework**
- **NestJS** (Recommended)
  - Built-in dependency injection (IoC container)
  - Decorators for clean, testable code
  - Native WebSocket support (@nestjs/websockets)
  - Module system aligns with Clean Architecture
  - Excellent testing utilities
  - OpenAPI/Swagger integration

Alternative: **Express + InversifyJS** (lighter weight)

**Dependency Injection**
- NestJS built-in DI container (if using NestJS)
- InversifyJS (if using Express)

**Process Management**
- Node.js `child_process` module
- Library: `execa` for better process handling

**WebSocket**
- `socket.io` or `ws` library
- NestJS WebSocket module (if using NestJS)

**Testing**
- **Jest** or **Vitest** (unit & integration tests)
- **Supertest** (API testing)
- **testcontainers** (optional, for integration tests)

**Logging & Observability**
- **Winston** or **Pino** (structured logging)
- **OpenTelemetry** (optional, for tracing)

**Database (MVP)**
- **SQLite** with **better-sqlite3** (embedded database, no server needed)
- Alternative: **TypeORM** or **Prisma** (if ORM preferred)
- Reasoning: SQLite is perfect for MVP - zero configuration, file-based, sufficient for moderate scale

**Utilities**
- **RxJS** (reactive streams for agent output)
- **Zod** (schema validation)

### 4.2 Frontend (Minimal MVP)

**Framework**
- **React 18+ with TypeScript**
- **Vite** (build tool)

**UI Components**
- **shadcn/ui** or **Mantine** (component library)
- **TailwindCSS** (styling)

**WebSocket Client**
- **socket.io-client** or native WebSocket API

**State Management**
- **Zustand** or **React Context** (lightweight for MVP)

### 4.3 Development Tools

- **pnpm** or **npm** (package management)
- **ESLint + Prettier** (code quality)
- **Husky** (git hooks for pre-commit testing)
- **Docker** (optional, for containerization)

---

## 5. Implementation Plan

### Phase 1: Foundation (Week 1-2)

**1.1 Project Setup**
- [ ] Initialize monorepo structure (backend + frontend)
- [ ] Configure TypeScript, ESLint, Prettier
- [ ] Setup testing frameworks (Jest/Vitest)
- [ ] Configure NestJS project structure
- [ ] Setup DI container and module architecture

**1.2 Domain Layer (TDD)**
- [ ] Define core entities: Agent, Session, Task
- [ ] Define value objects: AgentId, AgentStatus, AgentType
- [ ] Write domain logic tests
- [ ] Implement domain models

**1.3 Core Ports (Interfaces)**
- [ ] Define IAgentRunner interface
- [ ] Define IAgentFactory interface
- [ ] Define IAgentRepository interface
- [ ] Define IWebSocketGateway interface
- [ ] Define IProcessManager interface

### Phase 2: Infrastructure Layer (Week 2-3)

**2.1 Process Management**
- [ ] Write tests for ProcessManager
- [ ] Implement ProcessManager service
- [ ] Test CLI spawning with mock processes
- [ ] Implement stream reading utilities

**2.2 Agent Adapters (TDD)**
- [ ] Research Claude Code streaming output format
  - [ ] Create test fixtures with sample JSONL output
  - [ ] Write tests for ClaudeCodeAdapter
  - [ ] Implement ClaudeCodeAdapter
  - [ ] Integration test with real Claude CLI

- [ ] Research Gemini CLI streaming output format
  - [ ] Create test fixtures with sample JSON/JSONL output
  - [ ] Write tests for GeminiCLIAdapter
  - [ ] Implement GeminiCLIAdapter
  - [ ] Integration test with real Gemini CLI

**2.3 Message Parsing**
- [ ] Write tests for JSONL parser
- [ ] Implement message parser for Claude Code format
- [ ] Implement message parser for Gemini CLI format
- [ ] Handle error messages and edge cases

**2.4 Repository Implementation**
- [x] Write tests for in-memory repository (MVP)
- [x] Implement in-memory AgentRepository
- [ ] **Database Implementation (MVP Addition)**
  - [ ] Setup SQLite database schema
  - [ ] Write tests for SQLiteAgentRepository
  - [ ] Implement SQLiteAgentRepository
  - [ ] Add database migrations
  - [ ] Test data persistence across restarts

### Phase 2.5: Database Persistence (Week 2.5-3)

**RECOMMENDED PLACEMENT**: Implement after Phase 3, before Phase 4

**2.5.1 Database Setup**
- [ ] Install SQLite dependencies (better-sqlite3)
- [ ] Design database schema for agents and sessions
- [ ] Create migration system (simple for SQLite)
- [ ] Setup database configuration

**2.5.2 SQLite Repository (TDD)**
- [ ] Write tests for SQLiteAgentRepository
- [ ] Implement CRUD operations with SQL
- [ ] Test transaction handling
- [ ] Test concurrent access
- [ ] Verify data persistence across app restarts

**2.5.3 Integration**
- [ ] Make repository swappable via DI
- [ ] Add environment variable to choose repository type
- [ ] Test switching between in-memory and SQLite
- [ ] Add database initialization to app startup

### Phase 3: Application Layer (Week 3-4)

**3.1 Agent Orchestration Service (TDD)**
- [ ] Write tests for agent launch flow
- [ ] Write tests for agent termination
- [ ] Write tests for concurrent agent execution
- [ ] Implement AgentOrchestrationService
- [ ] Implement AgentFactory
- [ ] Test error handling and recovery

**3.2 Streaming Service (TDD)**
- [ ] Write tests for subscription management
- [ ] Write tests for message broadcasting
- [ ] Implement StreamingService
- [ ] Test with multiple concurrent subscribers
- [ ] Test disconnection handling

**3.3 Session Management**
- [ ] Write tests for session creation
- [ ] Write tests for session resume (multi-turn)
- [ ] Implement SessionManagementService
- [ ] Test conversation history tracking

### Phase 4: Presentation Layer (Week 4-5)

**4.1 REST API (TDD)**
- [ ] Write API tests for agent endpoints
  - POST /api/agents (launch agent)
  - GET /api/agents (list agents)
  - GET /api/agents/:id (get agent details)
  - DELETE /api/agents/:id (terminate agent)
- [ ] Implement AgentController
- [ ] Add request validation (Zod schemas)
- [ ] Add error handling middleware
- [ ] Generate OpenAPI documentation

**4.2 WebSocket Gateway (TDD)**
- [ ] Write tests for WebSocket connection handling
- [ ] Write tests for subscription/unsubscription
- [ ] Implement WebSocketGateway
- [ ] Implement client event handlers
- [ ] Test reconnection scenarios
- [ ] Add authentication (basic for MVP)

### Phase 5: Frontend (Week 5-6)

**5.1 Core UI Components**
- [ ] Setup React + Vite project
- [ ] Create agent list view component
- [ ] Create agent detail/output view component
- [ ] Create agent launch form component
- [ ] Add basic styling with TailwindCSS

**5.2 WebSocket Integration**
- [ ] Implement WebSocket client hook
- [ ] Connect to backend WebSocket gateway
- [ ] Handle real-time message updates
- [ ] Display streaming output in UI
- [ ] Add connection status indicator

**5.3 Agent Management UI**
- [ ] Implement launch agent functionality
- [ ] Implement terminate agent functionality
- [ ] Display agent status in real-time
- [ ] Add multi-agent dashboard view
- [ ] Add basic error handling/notifications

### Phase 6: Integration & Testing (Week 6-7)

**6.1 Integration Testing**
- [ ] E2E test: Launch Claude Code agent
- [ ] E2E test: Launch Gemini CLI agent
- [ ] E2E test: Multiple concurrent agents
- [ ] E2E test: Frontend to backend flow
- [ ] Load testing with 10+ concurrent agents

**6.2 Documentation**
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Architecture documentation
- [ ] Setup and deployment guide
- [ ] Developer onboarding guide
- [ ] Agent configuration guide

**6.3 Polish & Refinement**
- [ ] Code review and refactoring
- [ ] Performance optimization
- [ ] Error message improvements
- [ ] Logging enhancements
- [ ] Final testing round

---

## 6. Key Design Patterns

### 6.1 Dependency Injection (DI)
- **Purpose**: Loose coupling, testability, extensibility
- **Implementation**: NestJS DI container with decorators
- **Example**: Services receive dependencies via constructor injection

### 6.2 Factory Pattern
- **Purpose**: Abstract agent creation logic
- **Implementation**: AgentFactory creates appropriate IAgentRunner based on type
- **Benefit**: Easy to add new agent types without modifying orchestration logic

### 6.3 Adapter Pattern
- **Purpose**: Wrap external CLI tools with consistent interface
- **Implementation**: ClaudeCodeAdapter, GeminiCLIAdapter implement IAgentRunner
- **Benefit**: Domain layer doesn't know about CLI specifics

### 6.4 Observer Pattern
- **Purpose**: Real-time streaming updates
- **Implementation**: IAgentObserver interface for event notifications
- **Benefit**: Decoupled streaming service from agent execution

### 6.5 Repository Pattern
- **Purpose**: Abstract data persistence
- **Implementation**: IAgentRepository interface
- **Benefit**: Can swap in-memory for database without changing business logic

### 6.6 Strategy Pattern
- **Purpose**: Different message parsing strategies per CLI
- **Implementation**: IMessageParser interface with CLI-specific implementations
- **Benefit**: Flexible parsing logic per agent type

---

## 7. Testing Strategy

### 7.1 Test Pyramid

```
        ┌─────────────┐
        │   E2E (5%)  │  ← Full system tests
        └─────────────┘
      ┌─────────────────┐
      │Integration (15%)│  ← API, adapters, DB
      └─────────────────┘
    ┌─────────────────────┐
    │  Unit Tests (80%)   │  ← Domain, services, utilities
    └─────────────────────┘
```

### 7.2 TDD Workflow

1. **Red**: Write failing test first
2. **Green**: Write minimal code to pass test
3. **Refactor**: Improve code while keeping tests green
4. **Repeat**: Continue for next feature

### 7.3 Test Categories

**Unit Tests**
- Domain entities and value objects
- Service business logic (mocked dependencies)
- Utilities and helpers
- Message parsers

**Integration Tests**
- Agent adapters with mock CLI processes
- Repository implementations
- API endpoints with test database
- WebSocket connections

**E2E Tests**
- Launch agent and verify output streaming
- Multi-agent concurrent execution
- Frontend-to-backend complete flows

### 7.4 Mock Strategies

- **CLI Processes**: Mock with controlled stdout/stderr streams
- **External Dependencies**: Use test doubles (mocks/stubs)
- **Time-dependent**: Use fake timers (Jest/Vitest)
- **File System**: In-memory implementations for repositories

---

## 8. API Specification (REST)

### 8.1 Endpoints

```http
POST /api/agents
Content-Type: application/json

{
  "type": "claude-code" | "gemini-cli",
  "prompt": "string",
  "configuration": {
    "outputFormat": "stream-json",
    "sessionId": "string (optional, for resume)",
    "customArgs": ["--yolo"] (optional)
  }
}

Response 201:
{
  "agentId": "uuid",
  "status": "initializing",
  "createdAt": "ISO8601"
}
```

```http
GET /api/agents
Response 200:
{
  "agents": [
    {
      "id": "uuid",
      "type": "claude-code",
      "status": "running",
      "createdAt": "ISO8601",
      "startedAt": "ISO8601"
    }
  ]
}
```

```http
GET /api/agents/:id
Response 200:
{
  "id": "uuid",
  "type": "claude-code",
  "status": "running",
  "session": {
    "id": "string",
    "prompt": "string",
    "messageCount": 42
  },
  "createdAt": "ISO8601",
  "startedAt": "ISO8601"
}
```

```http
DELETE /api/agents/:id
Response 204: No Content
```

### 8.2 WebSocket Events

**Client → Server**

```javascript
// Subscribe to agent output
{
  "event": "subscribe",
  "data": {
    "agentId": "uuid"
  }
}

// Unsubscribe from agent
{
  "event": "unsubscribe",
  "data": {
    "agentId": "uuid"
  }
}
```

**Server → Client**

```javascript
// Agent message (streaming output)
{
  "event": "agent:message",
  "data": {
    "agentId": "uuid",
    "timestamp": "ISO8601",
    "message": {
      "type": "assistant" | "system" | "error",
      "content": "string | object",
      "metadata": {}
    }
  }
}

// Agent status change
{
  "event": "agent:status",
  "data": {
    "agentId": "uuid",
    "status": "running" | "completed" | "failed",
    "timestamp": "ISO8601"
  }
}

// Agent error
{
  "event": "agent:error",
  "data": {
    "agentId": "uuid",
    "error": {
      "code": "string",
      "message": "string",
      "details": {}
    }
  }
}

// Agent completed
{
  "event": "agent:complete",
  "data": {
    "agentId": "uuid",
    "result": {
      "duration": 12340,
      "messageCount": 42,
      "status": "success" | "failed"
    }
  }
}
```

---

## 9. File Structure

```
headless-agent-manager/
├── backend/
│   ├── src/
│   │   ├── domain/                    # Domain Layer
│   │   │   ├── entities/
│   │   │   │   ├── agent.entity.ts
│   │   │   │   ├── session.entity.ts
│   │   │   │   └── task.entity.ts
│   │   │   ├── value-objects/
│   │   │   │   ├── agent-id.vo.ts
│   │   │   │   ├── agent-status.vo.ts
│   │   │   │   └── agent-type.vo.ts
│   │   │   └── services/
│   │   │       └── domain.service.ts
│   │   ├── application/               # Application Layer
│   │   │   ├── ports/
│   │   │   │   ├── agent-runner.port.ts
│   │   │   │   ├── agent-factory.port.ts
│   │   │   │   ├── agent-repository.port.ts
│   │   │   │   └── websocket-gateway.port.ts
│   │   │   ├── services/
│   │   │   │   ├── agent-orchestration.service.ts
│   │   │   │   ├── streaming.service.ts
│   │   │   │   └── session-management.service.ts
│   │   │   └── dto/
│   │   │       ├── launch-agent.dto.ts
│   │   │       └── agent-response.dto.ts
│   │   ├── infrastructure/            # Infrastructure Layer
│   │   │   ├── adapters/
│   │   │   │   ├── claude-code.adapter.ts
│   │   │   │   ├── gemini-cli.adapter.ts
│   │   │   │   └── agent-factory.adapter.ts
│   │   │   ├── repositories/
│   │   │   │   └── in-memory-agent.repository.ts
│   │   │   ├── process/
│   │   │   │   └── process-manager.service.ts
│   │   │   ├── parsers/
│   │   │   │   ├── claude-message.parser.ts
│   │   │   │   └── gemini-message.parser.ts
│   │   │   └── logging/
│   │   │       └── winston.logger.ts
│   │   ├── presentation/              # Presentation Layer
│   │   │   ├── http/
│   │   │   │   ├── controllers/
│   │   │   │   │   └── agent.controller.ts
│   │   │   │   ├── middleware/
│   │   │   │   │   └── error-handler.middleware.ts
│   │   │   │   └── validators/
│   │   │   │       └── agent.validator.ts
│   │   │   └── websocket/
│   │   │       └── agent.gateway.ts
│   │   ├── config/
│   │   │   ├── app.config.ts
│   │   │   └── di-container.config.ts
│   │   └── main.ts
│   ├── test/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── e2e/
│   │   └── fixtures/
│   │       ├── claude-output.jsonl
│   │       └── gemini-output.json
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentList.tsx
│   │   │   ├── AgentDetail.tsx
│   │   │   ├── AgentLaunchForm.tsx
│   │   │   └── OutputStream.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useAgents.ts
│   │   ├── services/
│   │   │   └── api.service.ts
│   │   ├── types/
│   │   │   └── agent.types.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   └── setup-guide.md
├── package.json (root workspace)
└── README.md
```

---

## 10. Risk Assessment & Mitigations

### 10.1 Technical Risks

**Risk: CLI Output Format Changes**
- **Impact**: High (breaking changes to parsing)
- **Probability**: Medium
- **Mitigation**:
  - Abstract parsers behind interfaces
  - Version detection for CLI tools
  - Comprehensive integration tests
  - Error handling for unknown formats

**Risk: CLI Authentication Issues (Gemini)**
- **Impact**: High (can't launch agents)
- **Probability**: Medium (headless OAuth challenges)
- **Mitigation**:
  - Pre-authenticate CLI tools during setup
  - Use service accounts where possible
  - Comprehensive setup documentation
  - Health checks for CLI availability

**Risk: Performance with Many Concurrent Agents**
- **Impact**: Medium (degraded performance)
- **Probability**: Medium
- **Mitigation**:
  - Resource pooling and limits
  - Queue management for agent launches
  - Performance testing early
  - Monitoring and metrics

**Risk: Memory Leaks from Long-Running Processes**
- **Impact**: High (system crashes)
- **Probability**: Medium
- **Mitigation**:
  - Proper cleanup in process termination
  - Memory profiling during testing
  - Process timeout mechanisms
  - Health checks and auto-restart

### 10.2 Project Risks

**Risk: Scope Creep**
- **Impact**: High (delays MVP)
- **Probability**: High
- **Mitigation**:
  - Strict MVP feature set
  - Defer non-essential features
  - Clear acceptance criteria

**Risk: Testing Overhead**
- **Impact**: Medium (slower development)
- **Probability**: Medium
- **Mitigation**:
  - Focus on critical path testing
  - Prioritize unit tests over E2E
  - Use TDD to avoid rework

---

## 11. Success Criteria

### 11.1 MVP Completion Criteria

- [ ] Successfully launch Claude Code agent headlessly
- [ ] Successfully launch Gemini CLI agent headlessly
- [ ] Run 5+ agents concurrently without failures
- [ ] Real-time streaming of agent output to frontend
- [ ] Frontend displays multiple agent outputs simultaneously
- [ ] Clean architecture with DI verified via code review
- [ ] 80%+ test coverage achieved
- [ ] All critical E2E tests passing
- [ ] Documentation complete (setup, API, architecture)
- [ ] No critical bugs or security vulnerabilities

### 11.2 Quality Gates

- [ ] All tests passing (unit, integration, E2E)
- [ ] TypeScript compilation with no errors
- [ ] ESLint passing with no violations
- [ ] Code review approval
- [ ] Performance benchmarks met (10+ agents, <100ms latency)

---

## 12. Future Enhancements (Post-MVP)

1. **Advanced Database Features**
   - Full-text search on agent conversations
   - Query historical agent runs with filters
   - Analytics and reporting dashboards
   - Database backup and restore

2. **Additional Agent Types**
   - GitHub Copilot CLI
   - Aider CLI
   - Custom script agents

3. **Advanced Features**
   - Agent chaining/workflows
   - Conditional agent execution
   - Agent output aggregation
   - Scheduled agent runs

4. **Enhanced UI**
   - Agent output filtering/search
   - Syntax highlighting for code
   - Export agent sessions
   - Agent templates

5. **Security & Auth**
   - User authentication
   - Role-based access control
   - API key management
   - Audit logging

6. **DevOps**
   - Docker containerization
   - Kubernetes deployment
   - CI/CD pipelines
   - Production monitoring

---

## 13. Appendix

### 13.1 CLI Research Summary

**Claude Code CLI**
- Headless flag: `-p` or `--print`
- Streaming JSON: `--output-format stream-json`
- Input format: `--input-format stream-json`
- Format: JSONL (one JSON object per line)
- Session management: `--session-id` for resume
- Tool control: `--allowedTools`, `--disallowedTools`
- Custom prompts: `--append-system-prompt`

**Gemini CLI**
- Headless flag: `-p` or `--prompt`
- Background mode: `-b`
- Auto-execute: `--yolo`
- Streaming: `--output-format stream-json` (research needed for JSONL support)
- Standard JSON: `--output-format json`
- Piping: Supports stdin input

### 13.2 Reference Links

- Claude Code Documentation: https://code.claude.com/docs
- Gemini CLI Documentation: https://google-gemini.github.io/gemini-cli/
- NestJS Documentation: https://docs.nestjs.com
- Clean Architecture: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- SOLID Principles: https://en.wikipedia.org/wiki/SOLID

---

**Document Version**: 1.0
**Last Updated**: 2025-11-09
**Author**: AI Agent Management System Team
**Status**: Draft for Review
