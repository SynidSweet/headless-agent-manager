# Development Setup Guide

## Prerequisites

Before starting development, ensure you have the following installed:

### Required

- **Node.js**: 20.x or higher
  ```bash
  node --version  # Should be v20.x.x or higher
  ```

- **npm** or **pnpm**: Latest version
  ```bash
  npm --version  # or pnpm --version
  ```

- **Git**: For version control
  ```bash
  git --version
  ```

### AI CLI Tools (for testing)

- **Claude Code CLI**:
  ```bash
  # Installation instructions at:
  # https://code.claude.com/docs/installation

  # Verify installation
  claude --version
  ```

- **Gemini CLI**:
  ```bash
  # Installation instructions at:
  # https://google-gemini.github.io/gemini-cli/

  # Verify installation
  gemini --version
  ```

### Optional but Recommended

- **Docker**: For containerized development/testing
- **VS Code**: Recommended IDE with extensions:
  - ESLint
  - Prettier
  - Jest Runner
  - GitLens

---

## Initial Project Setup

### 1. Clone and Install

```bash
# Navigate to project directory
cd /path/to/headless-agent-manager

# Install dependencies
npm install

# or with pnpm
pnpm install
```

### 2. Project Structure

After installation, you should have:

```
headless-agent-manager/
├── backend/
│   ├── src/
│   │   ├── domain/           # Domain layer
│   │   ├── application/      # Application layer
│   │   ├── infrastructure/   # Infrastructure layer
│   │   ├── presentation/     # Presentation layer
│   │   ├── config/           # Configuration
│   │   └── main.ts           # Entry point
│   ├── test/                 # Test files
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── e2e/
│   │   └── fixtures/
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
├── docs/                     # Documentation
├── SPECIFICATION.md
├── CLAUDE.md
└── README.md
```

### 3. Environment Configuration

Create environment files:

```bash
# Backend environment
cat > backend/.env <<EOF
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# CLI Tool Paths (optional, if not in PATH)
CLAUDE_CLI_PATH=/usr/local/bin/claude
GEMINI_CLI_PATH=/usr/local/bin/gemini

# WebSocket Configuration
WS_PORT=3001
WS_PATH=/ws

# Agent Configuration
MAX_CONCURRENT_AGENTS=10
AGENT_TIMEOUT_MS=300000  # 5 minutes
EOF

# Frontend environment
cat > frontend/.env <<EOF
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
EOF
```

### 4. Verify Installation

```bash
# Backend
cd backend
npm run build     # Should compile TypeScript
npm run lint      # Should pass ESLint
npm test          # Should run (may fail if no tests yet)

# Frontend
cd ../frontend
npm run build     # Should compile React app
npm run lint      # Should pass ESLint
```

---

## Development Workflow

### Starting Development Servers

**Backend (Terminal 1):**
```bash
cd backend
npm run dev

# Output:
# [NestJS] Starting development server...
# [NestJS] Listening on http://localhost:3000
# [WebSocket] Listening on ws://localhost:3001
```

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev

# Output:
# VITE v5.x.x  ready in XXX ms
# ➜  Local:   http://localhost:5173/
```

**Test Watch Mode (Terminal 3 - Optional):**
```bash
cd backend
npm run test:watch

# Jest will watch for file changes and re-run tests
```

### Development Commands

#### Backend

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Compile TypeScript to JavaScript
npm run start            # Start production server

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode (TDD)
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e         # E2E tests only
npm run test:coverage    # Coverage report

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking

# Debugging
npm run debug            # Start with debugger attached
npm run test:debug       # Debug tests
```

#### Frontend

```bash
# Development
npm run dev              # Start Vite dev server
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking
```

---

## TDD Workflow

### Step-by-Step: Adding a New Feature

**Example: Implementing Session Resume Functionality**

#### 1. Start Test Watch Mode

```bash
cd backend
npm run test:watch
```

#### 2. Create Test File

```bash
# Create test file FIRST
touch test/unit/application/services/session-management.service.spec.ts
```

#### 3. Write Failing Test (RED)

```typescript
// test/unit/application/services/session-management.service.spec.ts
import { SessionManagementService } from '@/application/services/session-management.service';

describe('SessionManagementService', () => {
  describe('resumeSession', () => {
    it('should resume existing session by ID', async () => {
      // Arrange
      const service = new SessionManagementService(/* mocks */);
      const sessionId = 'existing-session-123';

      // Act
      const session = await service.resumeSession(sessionId);

      // Assert
      expect(session.id).toBe(sessionId);
      expect(session.isResumed).toBe(true);
    });
  });
});
```

**Watch mode output:**
```
FAIL  test/unit/application/services/session-management.service.spec.ts
  ● SessionManagementService › resumeSession › should resume existing session by ID
    Cannot find module '@/application/services/session-management.service'
```

#### 4. Create Minimal Implementation (GREEN)

```bash
# Create implementation file
mkdir -p src/application/services
touch src/application/services/session-management.service.ts
```

```typescript
// src/application/services/session-management.service.ts
export class SessionManagementService {
  async resumeSession(sessionId: string): Promise<Session> {
    // Minimal implementation to pass test
    return {
      id: sessionId,
      isResumed: true
    } as Session;
  }
}
```

**Watch mode output:**
```
PASS  test/unit/application/services/session-management.service.spec.ts
  ✓ SessionManagementService › resumeSession › should resume existing session by ID (5ms)
```

#### 5. Refactor (REFACTOR)

```typescript
// Improve implementation
@Injectable()
export class SessionManagementService {
  constructor(
    @Inject('ISessionRepository')
    private readonly sessionRepository: ISessionRepository,
    private readonly logger: ILogger
  ) {}

  async resumeSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    session.markAsResumed();
    await this.sessionRepository.save(session);

    this.logger.info('Session resumed', { sessionId });

    return session;
  }
}
```

**Watch mode output:**
```
PASS  test/unit/application/services/session-management.service.spec.ts
  ✓ SessionManagementService › resumeSession › should resume existing session by ID (8ms)
```

#### 6. Add More Tests

```typescript
it('should throw NotFoundException when session does not exist', async () => {
  // Test error case
  const service = new SessionManagementService(mockRepository, mockLogger);
  mockRepository.findById.mockResolvedValue(null);

  await expect(service.resumeSession('non-existent')).rejects.toThrow(
    NotFoundException
  );
});
```

#### 7. Commit

```bash
git add .
git commit -m "feat: implement session resume functionality

- Add SessionManagementService.resumeSession method
- Handle non-existent session errors
- Add comprehensive test coverage"
```

### TDD Best Practices During Development

1. **Keep watch mode running** - Instant feedback on changes
2. **Write one test at a time** - Focus on single behavior
3. **See it fail first** - Verify test catches the issue
4. **Minimal implementation** - Don't over-engineer
5. **Refactor fearlessly** - Tests catch regressions
6. **Commit frequently** - Small, atomic commits

---

## Testing Strategies

### Unit Testing

**Run specific test:**
```bash
npm test -- session-management.service.spec.ts
```

**Run tests matching pattern:**
```bash
npm test -- --testNamePattern="resume session"
```

**Debug failing test:**
```bash
npm run test:debug -- session-management.service.spec.ts

# Then open chrome://inspect in Chrome
# Click "Open dedicated DevTools for Node"
# Set breakpoints and debug
```

### Integration Testing

**Setup test database/resources before running:**
```bash
# Start test containers if needed
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down
```

### E2E Testing

**Start full application stack:**
```bash
# Terminal 1: Start backend
cd backend && npm run start:test

# Terminal 2: Start frontend
cd frontend && npm run build && npm run preview

# Terminal 3: Run E2E tests
cd backend && npm run test:e2e
```

---

## Debugging

### Backend Debugging (VS Code)

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "debug"],
      "cwd": "${workspaceFolder}/backend",
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:debug"],
      "cwd": "${workspaceFolder}/backend",
      "sourceMaps": true,
      "console": "integratedTerminal"
    }
  ]
}
```

**Usage:**
1. Set breakpoints in your code
2. Press `F5` or select "Debug Backend" from debug panel
3. Debugger will pause at breakpoints

### CLI Output Debugging

**Enable verbose logging for adapters:**

```typescript
// In adapter
this.logger.debug('CLI stdout:', { line, agentId });
this.logger.debug('Parsed message:', { message, agentId });
```

**Set log level in .env:**
```
LOG_LEVEL=debug
```

**Test with fixture data:**

```typescript
// Use real CLI output as fixture
const fixtureData = readFileSync('./test/fixtures/claude-output.jsonl', 'utf-8');

// Test parser
const lines = fixtureData.split('\n');
lines.forEach(line => {
  const parsed = parser.parse(line);
  console.log('Parsed:', parsed);
});
```

---

## Common Issues and Solutions

### Issue: Tests Failing Due to Timeouts

**Symptom:**
```
Timeout - Async callback was not invoked within the 5000 ms timeout
```

**Solution:**
```typescript
// Increase timeout for slow tests (e.g., real CLI integration)
it('should start Claude Code', async () => {
  // test code
}, 10000); // 10 second timeout
```

### Issue: Port Already in Use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3001
```

### Issue: TypeScript Compilation Errors

**Symptom:**
```
error TS2307: Cannot find module '@/domain/entities/agent'
```

**Solution:**
```bash
# Check tsconfig.json paths configuration
# Ensure baseUrl and paths are correct

# Clear build cache
rm -rf dist/
npm run build
```

### Issue: Mock Not Working in Tests

**Symptom:**
```
Expected mock function to have been called, but it was not called
```

**Solution:**
```typescript
// Ensure mock is properly typed
const mockRunner = {
  start: jest.fn().mockResolvedValue(undefined), // Add return value
  stop: jest.fn()
} as jest.Mocked<IAgentRunner>;

// Verify mock was injected correctly
expect(mockRunner.start).toBeDefined();
```

### Issue: WebSocket Connection Refused

**Symptom:**
```
WebSocket connection failed: Connection refused
```

**Solution:**
```bash
# 1. Verify WebSocket server is running
curl http://localhost:3001/health

# 2. Check CORS configuration
# In backend main.ts:
app.enableCors({
  origin: 'http://localhost:5173',
  credentials: true
});

# 3. Verify frontend WS URL
# In frontend .env:
VITE_WS_URL=ws://localhost:3001
```

---

## Code Quality Checks

### Pre-Commit Checklist

Before committing code:

```bash
# 1. Run all tests
npm test

# 2. Check TypeScript compilation
npm run build

# 3. Run linter
npm run lint

# 4. Format code
npm run format

# 5. Check test coverage
npm run test:coverage

# All should pass!
```

### Automated Pre-Commit Hook

Install Husky for automatic checks:

```bash
# Install Husky
npm install --save-dev husky lint-staged

# Initialize Husky
npx husky install

# Create pre-commit hook
cat > .husky/pre-commit <<EOF
#!/bin/sh
npm run lint
npm run test:unit
EOF

chmod +x .husky/pre-commit
```

Now every commit will automatically run linter and unit tests.

---

## Performance Profiling

### Backend Performance

**Enable profiling:**
```bash
node --prof dist/main.js

# After running, process the log
node --prof-process isolate-*.log > processed.txt
```

**Memory profiling:**
```bash
node --inspect dist/main.js

# Open chrome://inspect
# Take heap snapshots to find memory leaks
```

### Test Performance

**Identify slow tests:**
```bash
npm test -- --verbose

# Output shows duration for each test:
# ✓ should create agent (5ms)
# ✓ should start agent (523ms) ← Slow test!
```

**Profile test execution:**
```bash
npm test -- --logHeapUsage

# Shows memory usage per test
```

---

## Documentation Updates

When modifying architecture or adding features:

### 1. Update Relevant Docs

```bash
# Architecture changes → docs/architecture.md
# New API endpoints → docs/api-reference.md
# Testing patterns → docs/testing-guide.md
# Setup changes → docs/setup-guide.md
```

### 2. Update CLAUDE.md

Add any new conventions, gotchas, or important context:

```markdown
## New Section: Session Management

Sessions can be resumed using the `SessionManagementService`...
```

### 3. Update SPECIFICATION.md

For major feature additions or requirement changes:

```markdown
## 2.1 Functional Requirements

**FR-6: Session Persistence** (NEW)
- Sessions persist across agent restarts
- Resume functionality maintains conversation history
```

---

## Getting Help

### Documentation

1. **Start here**: `/CLAUDE.md` - AI agent development context
2. **Architecture**: `/docs/architecture.md` - System design
3. **Testing**: `/docs/testing-guide.md` - TDD practices
4. **API Reference**: `/docs/api-reference.md` - Endpoint details
5. **Specification**: `/SPECIFICATION.md` - Complete system spec

### External Resources

- **NestJS Docs**: https://docs.nestjs.com
- **Jest Docs**: https://jestjs.io/docs/getting-started
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Clean Architecture**: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html

### Troubleshooting

1. **Check existing tests** for similar implementations
2. **Review docs** for architectural patterns
3. **Run tests in debug mode** to understand failures
4. **Check logs** for detailed error messages

---

## Next Steps

Once setup is complete:

1. **Read `/SPECIFICATION.md`** - Understand the full system
2. **Review `/CLAUDE.md`** - Learn development practices
3. **Study `/docs/architecture.md`** - Understand design
4. **Practice TDD** - Follow `/docs/testing-guide.md`
5. **Start implementing** - Refer to implementation plan in SPECIFICATION.md

---

**Last Updated**: 2025-11-09
**Status**: Living Document
