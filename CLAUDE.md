# Headless AI Agent Management System - AI Development Context

## Project Overview

A backend application that orchestrates multiple headless AI CLI agents (Claude Code and Gemini CLI) running concurrently, with real-time streaming of agent outputs to a web-based frontend. Built following **Clean Architecture** principles with **strict TDD methodology**.

**Status**: Phase 1 & 2 Complete → Ready for Phase 3
**Documentation**: See `/SPECIFICATION.md` for complete system design and `/PHASE_1_2_COMPLETION.md` for completion report

**Current Implementation**:
- ✅ Phase 1: Foundation (Complete - 100% domain coverage, NestJS configured)
- ✅ Phase 2: Infrastructure (Complete - 89% coverage, Claude CLI integrated)
- ⬜ Phase 3: Application Layer (Next)
- ⬜ Phase 4: Presentation Layer
- ⬜ Phase 5: Frontend
- ⬜ Phase 6: Integration & Polish

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

## Core Principles

### 1. Test-Driven Development (TDD) - MANDATORY

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
└── fixtures/                # Test data
    ├── claude-output.jsonl
    └── gemini-output.json
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
{ "type": "claude-code", "prompt": "..." }

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

```bash
# All tests
npm test

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- agent-orchestration.service.spec.ts

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
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

- **Full Specification**: `/SPECIFICATION.md`
- **Architecture Details**: `/docs/architecture.md`
- **API Reference**: `/docs/api-reference.md`
- **Testing Guide**: `/docs/testing-guide.md`
- **Setup Instructions**: `/docs/setup-guide.md`

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

**Last Updated**: 2025-11-09
**Project Phase**: Specification Complete
**Next Milestone**: Phase 1 - Foundation Setup
