# Headless AI Agent Management System - AI Development Context

## Project Overview

A full-stack application that orchestrates multiple headless AI CLI agents (Claude Code and Gemini CLI) running concurrently, with real-time streaming of agent outputs to a web-based frontend. Built following **Clean Architecture** principles with **strict TDD methodology**.

**Status**: ✅ **MVP COMPLETE + Frontend Refactoring Complete**
**Documentation**: See `/SPECIFICATION.md` for system design, `/E2E_TESTING_GUIDE.md` for test setup

**Current Implementation**:
- ✅ Phase 1: Foundation (Complete - 100% domain coverage)
- ✅ Phase 2: Infrastructure (Complete - 89% coverage)
- ✅ Phase 3: Application Layer (Complete)
- ✅ Phase 4: Presentation Layer (Complete)
- ✅ Phase 5: Frontend (Complete)
- ✅ Phase 6: Integration & Polish (Complete)
- ✅ **Frontend Refactoring**: All 6 phases complete (Nov 2025)

**Agent Support**:
- ✅ **Claude Code** - THREE implementations available:
  - ⭐ **ClaudePythonProxyAdapter** (Default) - Uses Max subscription, $0 per request
  - ✅ **ClaudeSDKAdapter** (Alternative) - Uses API key, ~$0.08 per request
  - ⚠️ **ClaudeCodeAdapter** (Reference) - Blocked by Node.js bug, kept for reference
- ⬜ Gemini CLI - Deferred to post-MVP (architecture ready, ~4-6 hours to add)

**✅ SOLUTION IMPLEMENTED**: Python microservice proxy successfully enables Claude Max subscription usage with real-time streaming. See `PYTHON_PROXY_SOLUTION.md` for complete details.

---

## Claude Adapter Selection Guide

### Quick Selection

**Have Claude Max?** → Use `python-proxy` adapter (default)
**Have API key?** → Use `sdk` adapter
**Just learning?** → Either works, `sdk` is simpler to start

### Adapter Comparison

| Feature | Python Proxy ⭐ | SDK Alternative | CLI Reference |
|---------|----------------|-----------------|---------------|
| Status | ✅ Working | ✅ Working | ❌ Blocked |
| Uses Max Subscription | ✅ Yes | ❌ No | N/A |
| Per-Request Cost | $0 | ~$0.08 | N/A |
| Setup Complexity | Medium | Easy | N/A |
| Streaming | ✅ Real-time | ✅ Real-time | N/A |
| Reliability | ✅ High | ✅ Very High | ❌ Doesn't work |
| Dependencies | Python 3.9+ | None | None |

### Configuration

**Option 1: Python Proxy (Default)**
```bash
# .env
CLAUDE_ADAPTER=python-proxy
CLAUDE_PROXY_URL=http://localhost:8000

# Start Python service first
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload
```

**Option 2: SDK**
```bash
# .env
CLAUDE_ADAPTER=sdk
ANTHROPIC_API_KEY=sk-ant-your-key-here

# No Python service needed
```

**Switching Adapters**: Just change `CLAUDE_ADAPTER` in .env and restart

---

## Frontend Refactoring (Nov 2025) - ✅ COMPLETE

### Overview
Complete frontend refactoring following strict TDD methodology to resolve UI issues and establish comprehensive test coverage.

**Completion Status:** ✅ All 6 phases complete
**Duration:** 14 hours (within 12-18 hour estimate)
**Test Coverage:** 80.3% component coverage (exceeded 80% target)

### What Was Delivered

**1. Testing Infrastructure**
- Vitest 1.6.0 for unit/integration tests
- Playwright for E2E tests with real backend integration
- Backend health check for E2E transparency
- Test cleanup helpers for test isolation

**2. Message State Architecture**
- Database is single source of truth
- Messages have UUIDs (deduplication) + sequence numbers (ordering)
- `useAgentMessages` hook with gap detection
- New API endpoint: `GET /api/agents/:id/messages`
- StreamingService updated to save-before-emit

**3. Design Token System**
- `useDesignTokens` hook with WCAG AA compliance
- All components refactored to use tokens
- 16.1:1 contrast ratio (text on background)
- No light-on-light color issues

**4. UI Improvements**
- Graceful error handling (no blocking error screens)
- Simplified UI (removed redundant elements)
- Improved empty states
- Better loading indicators

**5. Test Coverage**
```
Frontend Unit Tests:     63/63  (100% pass)
Frontend E2E Tests:      19/19  (100% pass)
Component Coverage:      80.3%  (exceeded target)
Backend Tests:           261+   (all passing)
Total Tests:             343+   (100% pass rate)
```

### Key Files

**Documentation:**
- `/E2E_TESTING_GUIDE.md` - Complete E2E test setup guide
- `/IMPLEMENTATION_BRIEF.md` - 6-phase implementation details
- `/MESSAGE_STATE_ARCHITECTURE.md` - Message architecture design
- `/USER_STORIES.md` - User stories with test specs

**Frontend Tests:**
- `frontend/test/` - 6 unit test files (63 tests)
- `frontend/e2e/` - 5 E2E test files (19 tests)
- `frontend/e2e/helpers/cleanup.ts` - Test cleanup utilities
- `frontend/e2e/global-setup.ts` - Backend health check

**Frontend Hooks:**
- `frontend/src/hooks/useAgentMessages.ts` - Message state management
- `frontend/src/hooks/useDesignTokens.ts` - Design system

**Backend Additions:**
- `backend/src/application/services/agent-message.service.ts` - Message persistence
- `backend/src/application/dto/agent-message.dto.ts` - Message DTOs
- Database schema updated with UUIDs and sequence numbers

### Running Tests

**Unit Tests:**
```bash
cd frontend
npm test              # Watch mode
npm test -- --run     # Run once
npm run test:coverage # With coverage
```

**E2E Tests (Real Integration):**
```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Run E2E tests
cd frontend
npm run test:e2e

# Expected: 19 passed (15.1s)
```

**Backend Tests:**
```bash
cd backend
npm test
```

---

## Module Refactoring (Nov 2025) - ✅ COMPLETE

### Overview
Complete refactoring to create a **reusable, framework-agnostic module** with proper separation of concerns. The `@headless-agent-manager/client` module is now ready for use in any project.

**Completion Status:** ✅ All 6 critical phases complete
**Duration:** ~4 hours
**Test Success:** 100% (199/199 tests passing)
**Code Reduction:** -520 lines of duplicate code
**Module Reusability:** 4/10 → **9/10** ⭐⭐⭐⭐⭐

### Key Achievements

**✅ No Duplicate Code** - Removed 520 lines of duplicates
**✅ Single Source of Truth** - Redux for all state
**✅ Module is Reusable** - Works in any project
**✅ Clean Architecture** - Logic vs presentation separated
**✅ 100% Test Success** - 199/199 tests passing

### Documentation

- **Module README**: `packages/agent-manager-client/README.md` - Complete usage guide
- **Frontend Guide**: `frontend/README.md` - Example implementation
- **Complete Report**: `REFACTORING_COMPLETE.md` - Detailed phase breakdown
- **Progress Report**: `REFACTORING_PROGRESS.md` - Development progress

### Quick Start

```typescript
// Use in ANY React project
import { createAgentClient } from '@headless-agent-manager/client';

const client = createAgentClient({
  apiUrl: 'http://localhost:3000',
  websocketUrl: 'http://localhost:3000',
});

<Provider store={client.store}>
  <App />
</Provider>
```

See module README for complete API documentation.

---

## Process Management System (Nov 2025) - ✅ COMPLETE

### Overview
Implemented comprehensive process management to enforce single-instance execution, preventing database connection isolation issues and resource leaks.

**Status:** ✅ All 5 phases complete
**Duration:** ~5 hours
**Test Coverage:** 153 new tests, ~98% coverage
**Problem Solved:** Multiple backend instances causing WAL database isolation

### What Was Delivered

**Phase 1: Domain Layer** (64 tests, 98.95% coverage)
- `ProcessLock` - Value object for PID file data with validation
- `ProcessState` - Entity managing process lifecycle (starting → running → stopping → stopped)
- `InstanceMetadata` - Value object for runtime statistics
- `InstanceAlreadyRunningError` - Custom exception for duplicate instances

**Phase 2: Infrastructure Layer** (63 tests, ~100% coverage)
- `IFileSystem` + `FileSystemService` - File I/O abstraction for testability
- `ProcessUtils` - Process detection (isRunning, memory usage, uptime)
- `IInstanceLockManager` + `PidFileProcessManager` - PID file-based locking

**Phase 3: Application Layer** (20 tests, 95.83% coverage)
- `ApplicationLifecycleService` - Orchestrates startup/shutdown lifecycle
- Integrates with `AgentOrchestrationService` and `DatabaseService`

**Phase 4: Presentation Layer** (6 tests, 100% coverage)
- `HealthCheckDto` - Health endpoint response structure
- `HealthController` - `GET /api/health` endpoint with instance metadata

**Phase 5: Bootstrap Integration**
- Updated `main.ts` with lifecycle hooks (startup check, signal handlers)
- Updated `InfrastructureModule` with new providers and DI configuration
- SIGTERM/SIGINT handlers for graceful shutdown

### Key Features

**Single Instance Enforcement:**
```bash
# First instance
npm run dev
# ✅ Starts successfully, creates ./data/backend.pid

# Second instance attempt
npm run dev
# ❌ Blocked with error:
╔═══════════════════════════════════════════════════════════╗
║  ❌ Backend instance already running                      ║
╚═══════════════════════════════════════════════════════════╝

  PID:        12345
  Started:    2025-11-27T10:00:00.000Z
  Port:       3000

  To stop: kill 12345
  Health check: curl http://localhost:3000/api/health
```

**Health Monitoring:**
```bash
curl http://localhost:3000/api/health

{
  "status": "ok",
  "pid": 12345,
  "uptime": 3600,
  "memoryUsage": { "heapUsed": 45000000, "heapTotal": 80000000, ... },
  "activeAgents": 2,
  "totalAgents": 5,
  "databaseStatus": "connected",
  "startedAt": "2025-11-27T10:00:00.000Z",
  "port": 3000,
  "nodeVersion": "v18.20.8",
  "instanceId": "instance-12345-..."
}
```

**Graceful Shutdown:**
```bash
# SIGTERM or SIGINT (Ctrl+C)
1. Stops all active agents
2. Closes database connections
3. Removes PID file
4. Exits cleanly
```

### Architecture

**Clean Architecture Compliance:**
- Domain layer: Zero dependencies (ProcessLock, ProcessState, InstanceMetadata)
- Application layer: Ports (IInstanceLockManager, IFileSystem)
- Infrastructure layer: Adapters (PidFileProcessManager, FileSystemService)
- Presentation layer: Controllers (HealthController)

**SOLID Principles:**
- Single Responsibility: Each class has one focused purpose
- Open/Closed: Extensible via interfaces (can add Redis locks later)
- Liskov Substitution: Any IInstanceLockManager implementation works
- Interface Segregation: Small, focused interfaces
- Dependency Inversion: Depends on abstractions, not concrete classes

**TDD Methodology:**
- All 153 tests written BEFORE implementation (RED → GREEN → REFACTOR)
- 98% code coverage on new components
- Zero regressions in existing tests

### Configuration

**Environment Variables:**
```bash
# Optional: Custom PID file location (default: ./data/backend.pid)
PID_FILE_PATH=./data/backend.pid
```

**PID File Format:**
```json
{
  "pid": 12345,
  "startedAt": "2025-11-27T10:00:00.000Z",
  "port": 3000,
  "nodeVersion": "v18.20.8",
  "instanceId": "instance-12345-1764287558283"
}
```

### Files Created

**Domain Layer:**
- `src/domain/value-objects/process-lock.vo.ts`
- `src/domain/entities/process-state.entity.ts`
- `src/domain/value-objects/instance-metadata.vo.ts`
- `src/domain/exceptions/instance-already-running.exception.ts`

**Infrastructure Layer:**
- `src/application/ports/filesystem.port.ts`
- `src/application/ports/instance-lock-manager.port.ts`
- `src/infrastructure/filesystem/filesystem.service.ts`
- `src/infrastructure/process/process.utils.ts`
- `src/infrastructure/process/pid-file-process-manager.adapter.ts`

**Application Layer:**
- `src/application/services/application-lifecycle.service.ts`

**Presentation Layer:**
- `src/application/dto/health-check.dto.ts`
- `src/presentation/controllers/health.controller.ts`

**Plus 25 test files with 153 tests total**

### Troubleshooting

**Instance already running:**
```bash
# Check PID file
cat data/backend.pid

# Check if process is running
ps aux | grep <PID>

# Kill existing instance
kill <PID>

# Or force kill
kill -9 <PID>

# Or use cleanup script
./scripts/clean-restart.sh
```

**Stale PID file (from crash):**
The system automatically detects and cleans up stale PID files on startup.

**Health check not responding:**
```bash
# Check if backend is running
lsof -ti:3000

# Check logs
tail -f /tmp/backend-*.log

# Restart
kill $(lsof -ti:3000) && npm run dev
```

---

## Core Principles

### 1. Test-Driven Development (TDD) - MANDATORY

**📚 COMPREHENSIVE TESTING GUIDE AVAILABLE**: `/docs/testing/`

**For AI Agents**: Read the complete testing infrastructure documentation:
- **Start Here**: [`/docs/testing/README.md`](/docs/testing/README.md) - Quick start guide
- **Architecture**: [`/docs/testing/TESTING_ARCHITECTURE_GUIDE.md`](/docs/testing/TESTING_ARCHITECTURE_GUIDE.md) - Philosophy & rules
- **Plan**: [`/docs/testing/COMPREHENSIVE_TEST_PLAN.md`](/docs/testing/COMPREHENSIVE_TEST_PLAN.md) - All tests to implement
- **Templates**: [`/docs/testing/TEST_TEMPLATES.md`](/docs/testing/TEST_TEMPLATES.md) - Copy-paste ready code
- **Helpers**: [`/docs/testing/TEST_HELPER_LIBRARY.md`](/docs/testing/TEST_HELPER_LIBRARY.md) - Utility functions

**The 8 Constitutional Rules for Testing**:
1. Test First, Always (RED → GREEN → REFACTOR)
2. Test Behavior, Not Implementation
3. Test Boundaries with Real Collaborators
4. Every Layer Boundary Needs Contract Test
5. Negative Tests Are Mandatory
6. Integration Tests Use Real Infrastructure
7. Performance is a Feature
8. Tests Must Be Self-Contained

**ALL CODE must follow the Red-Green-Refactor cycle:**

```
┌─────────────────────────────────────────┐
│  RED: Write failing test first          │
│   ↓                                      │
│  GREEN: Write minimal code to pass      │
│   ↓                                      │
│  REFACTOR: Improve while keeping green  │
│   ↓                                      │
│  REPEAT for next feature                │
└─────────────────────────────────────────┘
```

**Before writing ANY implementation code:**
1. ✅ Write the test that describes the expected behavior
2. ✅ Verify the test fails (RED)
3. ✅ Implement minimum code to pass (GREEN)
4. ✅ Refactor for quality (REFACTOR)
5. ✅ Commit with test + implementation together

**No exceptions.** If you're writing production code without a failing test first, STOP.

### 2. Clean Architecture (Hexagonal)

**Layer Dependency Rule**: Dependencies ONLY flow inward
```
Presentation → Application → Domain ← Infrastructure
     ↓              ↓           ↑           ↑
  (depends on)  (depends on)  (independent)
```

**Key Guidelines:**
- **Domain Layer**: No dependencies on frameworks or external libraries
- **Application Layer**: Depends only on domain, defines ports (interfaces)
- **Infrastructure Layer**: Implements ports, depends on external tools
- **Presentation Layer**: HTTP/WebSocket, orchestrates application services

### 3. Dependency Injection

**All services use constructor injection:**
```typescript
// ✅ CORRECT
class AgentOrchestrationService {
  constructor(
    private readonly agentFactory: IAgentFactory,
    private readonly repository: IAgentRepository,
    private readonly eventBus: IEventBus
  ) {}
}

// ❌ WRONG
class AgentOrchestrationService {
  private agentFactory = new AgentFactory(); // Hard dependency!
}
```

**Benefits:**
- Testability: Easy to inject mocks/stubs
- Flexibility: Swap implementations without changing code
- Explicit dependencies: Clear what each class needs

---

## Development Workflow

### Starting a New Feature

1. **Read the specification** (`/SPECIFICATION.md`) for the feature
2. **Check the implementation plan** to understand current phase
3. **Review relevant docs** in `/docs/` for context
4. **Create test file first** in appropriate `/test/` directory
5. **Follow TDD cycle** for each behavior
6. **Update documentation** if architecture changes

### Testing Strategy

**Test Pyramid (80/15/5 split):**
```
     E2E (5%)     ← Full system, critical paths only
   Integration (15%) ← Adapters, API, real dependencies
  Unit Tests (80%)  ← Domain, services, pure logic
```

**Coverage Requirements:**
- **Minimum**: 80% overall
- **Critical paths**: 100% (agent lifecycle, streaming)
- **Domain layer**: 100% (business logic)

**Test Organization:**
```
backend/test/
├── unit/                    # Fast, isolated tests
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── integration/             # With real dependencies
│   ├── adapters/
│   ├── api/
│   └── websocket/
├── e2e/                     # Full system tests
│   ├── smoke/               # 🔥 REAL CLI integration tests
│   │   ├── python-proxy.smoke.spec.ts  # Real Claude CLI via Python proxy
│   │   ├── helpers.ts       # Smoke test utilities
│   │   └── README.md        # Complete smoke test guide
│   └── agent-flow.e2e.spec.ts
└── fixtures/                # Test data
    ├── claude-output.jsonl
    └── gemini-output.json

frontend/test/
├── infrastructure.test.tsx  # Testing setup verification
├── hooks/                   # Hook tests (20 tests)
│   ├── useDesignTokens.test.ts
│   └── useAgentMessages.test.tsx
├── components/              # Component tests (39 tests)
│   ├── AgentLaunchForm.test.tsx
│   ├── AgentList.test.tsx
│   └── AgentOutput.test.tsx
└── setup.ts                 # Test setup with WebSocket mocking

frontend/e2e/
├── global-setup.ts          # Backend health check
├── helpers/
│   └── cleanup.ts           # Test isolation utilities
├── agent-lifecycle.spec.ts  # 5 tests
├── message-display.spec.ts  # 3 tests
├── agent-switching.spec.ts  # 3 tests
├── agent-termination.spec.ts # 4 tests
└── websocket-connection.spec.ts # 4 tests
```

### Code Quality Standards

**TypeScript:**
- Strict mode enabled
- No `any` types (use `unknown` if needed)
- Explicit return types on public methods
- Interfaces for all contracts

**Naming Conventions:**
- Entities: `Agent`, `Session`, `Task`
- Value Objects: `AgentId`, `AgentStatus` (suffix `.vo.ts`)
- Services: `AgentOrchestrationService` (suffix `.service.ts`)
- Interfaces/Ports: `IAgentRunner`, `IAgentFactory` (prefix `I`)
- DTOs: `LaunchAgentDto` (suffix `.dto.ts`)
- Adapters: `ClaudeCodeAdapter` (suffix `.adapter.ts`)

**File Structure:**
```typescript
// domain/entities/agent.entity.ts
export class Agent {
  private constructor() {} // Use factory methods

  static create(data: CreateAgentData): Agent {
    // Validation + creation logic
  }

  // Methods that preserve invariants
}

// application/ports/agent-runner.port.ts
export interface IAgentRunner {
  start(session: Session): Promise<Agent>;
  stop(agentId: AgentId): Promise<void>;
  // ... other methods
}

// infrastructure/adapters/claude-code.adapter.ts
@Injectable()
export class ClaudeCodeAdapter implements IAgentRunner {
  constructor(private readonly processManager: IProcessManager) {}

  async start(session: Session): Promise<Agent> {
    // Implementation
  }
}
```

---

## Architecture Quick Reference

### Key Components

**Domain Layer** (`src/domain/`)
- **Entities**: `Agent`, `Session`, `Task`
- **Value Objects**: `AgentId`, `AgentStatus`, `AgentType`
- **Domain Services**: Pure business logic

**Application Layer** (`src/application/`)
- **Ports (Interfaces)**: `IAgentRunner`, `IAgentFactory`, `IAgentRepository`
- **Services**: `AgentOrchestrationService`, `StreamingService`
- **DTOs**: Request/response objects

**Infrastructure Layer** (`src/infrastructure/`)
- **Adapters**: `ClaudeCodeAdapter`, `GeminiCLIAdapter`
- **Repositories**: `InMemoryAgentRepository`
- **Utilities**: `ProcessManager`, message parsers

**Presentation Layer** (`src/presentation/`)
- **REST API**: `AgentController`
- **WebSocket**: `AgentGateway`
- **Validators**: Request validation

### Data Flow Example

```typescript
// 1. Client sends REST request
POST /api/agents
{
  "type": "claude-code",
  "prompt": "...",
  "configuration": {
    "workingDirectory": "/path/to/project"  // Optional
  }
}

// 2. Controller receives request
@Post()
async launchAgent(@Body() dto: LaunchAgentDto) {
  return this.orchestrationService.launchAgent(dto);
}

// 3. Orchestration service coordinates
async launchAgent(request: LaunchAgentRequest): Promise<Agent> {
  const agent = Agent.create({ type: request.type });
  const runner = this.agentFactory.create(request.type);
  await runner.start(agent.session);
  this.streamingService.subscribeToAgent(agent.id);
  return this.repository.save(agent);
}

// 4. Adapter spawns CLI process
async start(session: Session): Promise<Agent> {
  const process = this.processManager.spawn(
    'claude',
    ['-p', session.prompt, '--output-format', 'stream-json']
  );
  // Subscribe to stdout and emit events
}

// 5. Streaming service broadcasts to WebSocket clients
broadcastMessage(agentId: AgentId, message: AgentMessage): void {
  this.websocketGateway.emit(`agent:${agentId}`, message);
}
```

---

## CLI Integration Details

### Claude Code CLI

**Launch Command:**
```bash
claude -p "prompt text" \
  --output-format stream-json \
  --input-format stream-json \
  --session-id "optional-session-id"
```

**Output Format**: JSONL (JSON Lines)
```jsonl
{"type":"system","role":"init","content":"..."}
{"type":"user","content":"..."}
{"type":"assistant","content":"..."}
{"type":"system","role":"result","stats":{...}}
```

**Key Features:**
- Multi-turn conversations via `--session-id`
- Tool control: `--allowedTools`, `--disallowedTools`
- Custom system prompts: `--append-system-prompt`

### Gemini CLI

**Launch Command:**
```bash
gemini -p "prompt text" \
  --output-format json \
  --yolo \
  -b
```

**Output Format**: JSON (research JSONL support)
```json
{
  "response": "...",
  "stats": {...},
  "error": null
}
```

**Key Features:**
- Auto-execute mode: `--yolo`
- Background mode: `-b`
- Piping support for stdin

**Known Issues:**
- OAuth authentication in headless environments
- Solution: Pre-authenticate or use service accounts

---

## Agent Configuration Options

### Working Directory

**Feature**: Specify a custom working directory for agent execution

**Available Since**: 2025-11-30

**Description:**
The `workingDirectory` configuration option allows you to specify the directory in which the agent's CLI process will execute. This is useful when working with project-specific code or when you need the agent to have access to specific files.

**API Usage:**
```typescript
POST /api/agents
{
  "type": "claude-code",
  "prompt": "Read package.json and tell me the project name",
  "configuration": {
    "workingDirectory": "/home/user/my-project"
  }
}
```

**Supported Values:**
- **Absolute paths**: `/home/user/projects/my-app`
- **Relative paths**: `./my-project` (relative to backend process CWD)
- **Default**: If not specified, inherits the backend's current working directory

**Use Cases:**
1. **Project-specific operations**: Agent needs access to project files
   ```json
   { "workingDirectory": "/home/user/projects/my-app" }
   ```

2. **Testing in isolated directories**: Run tests in specific test directories
   ```json
   { "workingDirectory": "/tmp/test-env" }
   ```

3. **Multi-project workflows**: Switch between different codebases
   ```json
   { "workingDirectory": "./project-a" }
   ```

**Data Flow:**
```
Client Request (configuration.workingDirectory)
    ↓
LaunchAgentDto → Session.configuration.workingDirectory
    ↓
ClaudePythonProxyAdapter → HTTP request (working_directory)
    ↓
Python Proxy Service → ClaudeRunner
    ↓
subprocess.Popen(cwd=working_directory)
    ↓
Claude CLI executes in specified directory ✓
```

**Implementation Details:**
- **Backend**: `session.vo.ts`, `launch-agent.dto.ts`, `claude-python-proxy.adapter.ts`
- **Python Service**: `main.py`, `claude_runner.py`
- **Test Coverage**: Unit tests (12) + Smoke test (1)

**Example Smoke Test:**
```typescript
// See: backend/test/e2e/smoke/python-proxy.smoke.spec.ts
it('should launch agent in custom working directory', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/agents')
    .send({
      type: 'claude-code',
      prompt: 'Run pwd and tell me the current directory',
      configuration: {
        workingDirectory: '/tmp/my-test-dir',
      },
    });
  // Agent executes in /tmp/my-test-dir
});
```

### MCP (Model Context Protocol) Configuration

**Feature**: Configure MCP servers for enhanced agent capabilities

**Available Since**: 2025-12-02

**Description:**
The `mcp` configuration option allows you to dynamically configure MCP (Model Context Protocol) servers when launching agents. This enables agents to access external tools and services like filesystems, web search, databases, and custom APIs through standardized MCP servers.

**API Usage:**
```typescript
POST /api/agents
{
  "type": "claude-code",
  "prompt": "List files and search the web",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
        },
        {
          "name": "brave-search",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"],
          "env": {
            "BRAVE_API_KEY": "your-api-key"
          }
        }
      ],
      "strict": true
    }
  }
}
```

**MCP Configuration Structure:**
```typescript
{
  servers: [
    {
      name: string;              // Unique server identifier (alphanumeric + hyphens/underscores)
      command: string;           // Command to start the MCP server
      args?: string[];           // Optional command arguments
      env?: Record<string, string>; // Optional environment variables
      transport?: 'stdio' | 'http' | 'sse'; // Transport type (default: 'stdio')
    }
  ],
  strict?: boolean;  // If true, only uses specified servers (ignores global MCP config)
}
```

**Use Cases:**

1. **File System Access**: Give agents filesystem access
   ```json
   {
     "mcp": {
       "servers": [{
         "name": "filesystem",
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
       }]
     }
   }
   ```

2. **Web Search Integration**: Enable web search capabilities
   ```json
   {
     "mcp": {
       "servers": [{
         "name": "brave-search",
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-brave-search"],
         "env": { "BRAVE_API_KEY": "your-key" }
       }]
     }
   }
   ```

3. **Multiple MCP Servers**: Combine multiple tools
   ```json
   {
     "mcp": {
       "servers": [
         {
           "name": "filesystem",
           "command": "npx",
           "args": ["-y", "@modelcontextprotocol/server-filesystem"]
         },
         {
           "name": "github",
           "command": "npx",
           "args": ["-y", "@modelcontextprotocol/server-github"],
           "env": { "GITHUB_TOKEN": "gh_token" }
         }
       ]
     }
   }
   ```

4. **Strict Mode (Isolated)**: Only use specified MCP servers
   ```json
   {
     "mcp": {
       "servers": [{ "name": "safe-tool", "command": "npx" }],
       "strict": true
     }
   }
   ```

**Data Flow:**
```
Client Request (configuration.mcp)
    ↓
LaunchAgentDto → McpConfigurationDto (validation)
    ↓
Domain Layer → McpConfiguration value object
    ↓
Session.configuration.mcp
    ↓
ClaudePythonProxyAdapter → toClaudeConfigJSON()
    ↓
Python Proxy Service → mcp_config (JSON string) + mcp_strict (boolean)
    ↓
ClaudeRunner → _build_command()
    ↓
Claude CLI: --mcp-config '{"mcpServers":{...}}' --strict-mcp-config
    ↓
Agent has access to MCP servers ✓
```

**Architecture (Clean Architecture + SOLID):**
- **Domain Layer**: `McpServerConfig.vo.ts`, `McpConfiguration.vo.ts` (immutable value objects)
- **Application Layer**: `McpServerDto`, `McpConfigurationDto` (DTO validation)
- **Infrastructure Layer**: `claude-python-proxy.adapter.ts` (extracts and passes MCP)
- **Python Service**: `main.py`, `claude_runner.py` (builds CLI flags)

**Test Coverage:**
- **Unit Tests**: 55 tests (Domain, DTO, Adapter layers)
- **Integration Tests**: Full flow validation
- **Test Files**:
  - `mcp-server-config.vo.spec.ts` (22 tests)
  - `mcp-configuration.vo.spec.ts` (25 tests)
  - `session.vo.spec.ts` (3 MCP tests)
  - `claude-python-proxy.adapter.spec.ts` (5 MCP tests)

**Validation Rules:**
- ✅ Server names must be alphanumeric with hyphens/underscores only
- ✅ Server names must be unique (no duplicates)
- ✅ Command cannot be empty
- ✅ Transport must be 'stdio', 'http', or 'sse'
- ✅ Environment variables must be valid key-value pairs

**Error Handling:**
```typescript
// Invalid server name
❌ { "name": "invalid@name!", "command": "npx" }
// Error: Server name must contain only alphanumeric characters, hyphens, and underscores

// Duplicate server names
❌ { "servers": [
  { "name": "filesystem", "command": "cmd1" },
  { "name": "filesystem", "command": "cmd2" }
]}
// Error: Duplicate MCP server name: filesystem

// Empty command
❌ { "name": "test", "command": "" }
// Error: Command cannot be empty
```

**Backward Compatibility:**
- ✅ MCP is **optional** - agents work without MCP configuration
- ✅ All existing code continues to work unchanged
- ✅ No breaking changes to API or data models

**Security Considerations:**
- **Strict Mode**: Use `strict: true` in production to isolate agents from global MCP servers
- **Environment Variables**: API keys passed through `env` field (consider encryption for storage)
- **Validation**: All MCP config validated in domain layer before execution
- **Shell Safety**: JSON properly escaped in Python subprocess

**Performance:**
- **Startup Overhead**: MCP servers add ~100-500ms to agent startup time
- **Memory**: Each MCP server is a separate process
- **Recommendation**: Only configure MCP servers that are actually needed

**Example with Combined Configuration:**
```typescript
POST /api/agents
{
  "type": "claude-code",
  "prompt": "Analyze project files and search for best practices",
  "configuration": {
    "workingDirectory": "/home/user/project",
    "model": "claude-sonnet-4-5-20250929",
    "conversationName": "Project Analysis",
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/project"]
        },
        {
          "name": "brave-search",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"],
          "env": { "BRAVE_API_KEY": "your-key" }
        }
      ],
      "strict": true
    }
  }
}
```

**Implementation Guide:**
See `/MCP_FEATURE_DESIGN.md` for complete TDD implementation guide including:
- Detailed architecture design
- SOLID principles application
- Test-driven development approach
- All 7 implementation phases

---

## Common Tasks

### Adding a New Agent Type

1. **Create adapter** (`infrastructure/adapters/new-agent.adapter.ts`)
   ```typescript
   export class NewAgentAdapter implements IAgentRunner {
     async start(session: Session): Promise<Agent> {
       // Implement CLI spawning logic
     }
   }
   ```

2. **Create message parser** (`infrastructure/parsers/new-agent-parser.ts`)
   ```typescript
   export class NewAgentMessageParser implements IMessageParser {
     parse(line: string): AgentMessage {
       // Parse CLI output format
     }
   }
   ```

3. **Update factory** (`infrastructure/adapters/agent-factory.adapter.ts`)
   ```typescript
   create(type: AgentType): IAgentRunner {
     switch(type) {
       case 'new-agent': return this.newAgentAdapter;
       // ...
     }
   }
   ```

4. **Write tests** for all new code
5. **Update documentation** in `/docs/`

### Running Tests

**Backend Tests:**
```bash
cd backend

# All tests (excludes smoke tests)
npm test

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- agent-orchestration.service.spec.ts

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# 🔥 Smoke tests (REAL Claude CLI via Python proxy)
# Requires: Python proxy running + Claude authenticated
npm run test:smoke
```

**Smoke Tests (Real CLI Integration):**
```bash
# Prerequisites: Start Python proxy first
cd claude-proxy-service
source venv/bin/activate
uvicorn app.main:app --reload

# In another terminal: Run smoke tests
cd backend
npm run test:smoke

# Expected: 6 tests, ~60 seconds, uses real Claude CLI
# See: backend/test/e2e/smoke/README.md for details
```

**Frontend Tests:**
```bash
cd frontend

# Unit tests (watch mode)
npm test

# Unit tests (run once)
npm test -- --run

# Coverage report
npm run test:coverage

# E2E tests (requires backend running)
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui
```

**Full Test Suite:**
```bash
# Backend tests
cd backend && npm test

# Frontend unit tests
cd frontend && npm test -- --run

# Frontend E2E tests (start backend first!)
cd backend && npm run dev  # Terminal 1
cd frontend && npm run test:e2e  # Terminal 2
```

### Debugging Agent Output

**Enable verbose logging:**
```typescript
// In adapter implementation
this.logger.debug('CLI stdout:', { line, agentId });
this.logger.debug('Parsed message:', { message, agentId });
```

**Test with fixtures:**
```typescript
// test/fixtures/claude-output.jsonl
const fixture = readFileSync('./test/fixtures/claude-output.jsonl');
const parser = new ClaudeMessageParser();
const messages = fixture.split('\n').map(line => parser.parse(line));
```

---

## Important Constraints & Gotchas

### Process Management

⚠️ **Always clean up child processes:**
```typescript
// ✅ CORRECT
async stop(agentId: AgentId): Promise<void> {
  const process = this.processes.get(agentId);
  if (process) {
    process.kill('SIGTERM');
    this.processes.delete(agentId);
    this.logger.info('Agent terminated', { agentId });
  }
}

// ❌ WRONG (memory leak!)
async stop(agentId: AgentId): Promise<void> {
  const process = this.processes.get(agentId);
  process.kill(); // No cleanup!
}
```

### WebSocket Subscriptions

⚠️ **Clean up on disconnect:**
```typescript
handleDisconnect(client: Socket): void {
  const subscriptions = this.clientSubscriptions.get(client.id);
  subscriptions?.forEach(agentId => {
    this.streamingService.unsubscribe(agentId, client.id);
  });
  this.clientSubscriptions.delete(client.id);
}
```

### Error Handling

⚠️ **Isolate agent failures:**
```typescript
// One agent failure should NOT crash the system
try {
  await runner.start(session);
} catch (error) {
  this.logger.error('Agent failed to start', { error, agentId });
  agent.markAsFailed(error);
  this.eventBus.emit('agent:failed', { agentId, error });
  // System continues running
}
```

---

## Documentation Maintenance

### When to Update Docs

**Update `/docs/architecture.md` when:**
- Adding new layers or components
- Changing data flow patterns
- Introducing new design patterns

**Update `/docs/api-reference.md` when:**
- Adding/changing API endpoints
- Modifying WebSocket events
- Updating DTOs or request/response formats

**Update `/docs/testing-guide.md` when:**
- Adding new testing utilities
- Changing testing patterns
- Updating coverage requirements

**Update `SPECIFICATION.md` when:**
- Major architectural changes
- New functional requirements
- Technology stack changes

**Update `CLAUDE.md` (this file) when:**
- Development workflow changes
- New coding conventions
- Common gotchas discovered

---

## Quick Links

**Core Documentation:**
- **Full Specification**: `/SPECIFICATION.md`
- **Architecture Details**: `/docs/architecture.md`
- **API Reference**: `/docs/api-reference.md`
- **Setup Instructions**: `/docs/setup-guide.md`

**Frontend Refactoring (New):**
- **E2E Testing Guide**: `/E2E_TESTING_GUIDE.md` - Complete E2E setup and best practices
- **Implementation Brief**: `/IMPLEMENTATION_BRIEF.md` - 6-phase refactoring details
- **Message Architecture**: `/MESSAGE_STATE_ARCHITECTURE.md` - Single source of truth design
- **User Stories**: `/USER_STORIES.md` - User stories with test specs

---

## Questions for AI Agents

**Before implementing a feature, ask:**
1. Have I read the specification for this feature?
2. Have I written the test first?
3. Does this follow the layer dependency rules?
4. Am I using dependency injection properly?
5. Is this the simplest implementation that passes the test?

**Before committing code, verify:**
1. All tests pass (including new ones)
2. Coverage hasn't decreased
3. TypeScript compiles without errors
4. ESLint passes
5. Documentation updated if needed

---

**Last Updated**: 2025-11-30
**Project Phase**: ✅ MVP Complete + Frontend Refactoring Complete + Working Directory Feature
**Status**: Production Ready
**Test Coverage**: 356+ tests (13 new for workingDirectory), 100% pass rate, 80.3% component coverage
