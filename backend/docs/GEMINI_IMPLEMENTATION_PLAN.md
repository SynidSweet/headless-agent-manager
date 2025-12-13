# Gemini CLI Integration - TDD Implementation Plan

**Date**: 2025-12-02  
**Status**: Ready for Implementation  
**Estimated Total Effort**: 12-16 hours  
**Architecture**: Clean Architecture (Hexagonal) with Strict TDD

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Research Phase (Phase 0)](#phase-0-research--validation-2-3-hours)
3. [Message Parser (Phase 1)](#phase-1-gemini-message-parser-3-4-hours)
4. [CLI Adapter (Phase 2)](#phase-2-gemini-cli-adapter-4-5-hours)
5. [Factory Integration (Phase 3)](#phase-3-factory-integration-1-2-hours)
6. [Smoke Tests (Phase 4)](#phase-4-smoke-tests-2-3-hours)
7. [Risk Mitigation Strategies](#risk-mitigation-strategies)
8. [Success Criteria](#success-criteria)

---

## Executive Summary

This plan details the **Test-Driven Development (TDD)** implementation for adding **Gemini CLI support** to the agent management system. The implementation follows strict Clean Architecture principles and uses the **ClaudePythonProxyAdapter** as the reference pattern.

### Key Constraints

- **Architecture Pattern**: Clean Architecture (Domain → Application → Infrastructure → Presentation)
- **Development Methodology**: Strict TDD (RED → GREEN → REFACTOR)
- **Test Coverage Target**: 80% minimum (match existing patterns)
- **Reference Implementation**: ClaudePythonProxyAdapter (best example)
- **Fallback Strategy**: Python proxy approach if Node.js spawning fails

### Gemini CLI Overview

```bash
# Command format
gemini -p "prompt text" --output-format json --yolo -b

# Output format (confirmed during research)
# Expected: JSON (not JSONL like Claude)
# Structure: TBD during research phase
```

---

## Phase 0: Research & Validation (2-3 hours)

**Objective**: Validate Gemini CLI behavior, output format, and Node.js compatibility BEFORE writing any code.

### 0.1 Prerequisites Validation

**Tasks**:
1. Verify Gemini CLI is installed: `which gemini`
2. Check Gemini CLI version: `gemini --version`
3. Verify authentication status: `gemini auth status` (or equivalent)
4. Document authentication method (OAuth, API key, service account)

**Deliverables**:
- [ ] `backend/docs/GEMINI_CLI_RESEARCH.md` - Research findings document
- [ ] Authentication status confirmed
- [ ] CLI version documented

**Success Criteria**:
- ✅ Gemini CLI accessible from command line
- ✅ Authentication working (or workaround documented)
- ✅ Version compatibility confirmed

---

### 0.2 Output Format Discovery

**Tasks**:
1. Run simple prompt and capture output:
   ```bash
   gemini -p "Say hello" --output-format json > /tmp/gemini-test.json
   cat /tmp/gemini-test.json | jq . # Pretty print JSON
   ```

2. Run streaming prompt and capture output:
   ```bash
   gemini -p "Count to 5" --output-format json --yolo > /tmp/gemini-stream.json
   ```

3. Test if Gemini supports JSONL:
   ```bash
   gemini -p "Count to 3" --output-format jsonl > /tmp/gemini-jsonl.txt 2>&1
   # Check if jsonl format is supported
   ```

4. Analyze output structure:
   - Is output single JSON object or JSONL (one JSON per line)?
   - What fields are present? (response, content, role, type, stats, error)
   - How are streaming updates formatted?
   - What does completion message look like?
   - What does error message look like?

**Deliverables**:
- [ ] Sample output files saved to `backend/test/fixtures/gemini-*.json`
- [ ] Output structure documented in research doc
- [ ] Field mapping identified (Gemini fields → AgentMessage fields)

**Success Criteria**:
- ✅ Output format fully understood
- ✅ Sample outputs captured (success, error, streaming)
- ✅ Field mapping documented

---

### 0.3 Node.js Spawning Test

**Objective**: Confirm Node.js can spawn Gemini CLI (unlike Claude CLI bug).

**Create**: `backend/test-gemini-spawn.js`

```javascript
const { spawn } = require('child_process');

async function testGeminiSpawn() {
  console.log('Testing Gemini CLI spawning from Node.js...\n');

  const process = spawn('gemini', [
    '-p', 'Say hello world',
    '--output-format', 'json',
    '--yolo'
  ]);

  let stdout = '';
  let stderr = '';

  process.stdout.on('data', (data) => {
    const chunk = data.toString();
    stdout += chunk;
    console.log('STDOUT:', chunk);
  });

  process.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderr += chunk;
    console.error('STDERR:', chunk);
  });

  process.on('close', (code) => {
    console.log('\nProcess exited with code:', code);
    console.log('Total stdout length:', stdout.length);
    console.log('Total stderr length:', stderr.length);

    if (stdout.length === 0) {
      console.error('❌ CRITICAL: No stdout received (Node.js spawning bug?)');
      console.log('Recommendation: Use Python proxy approach');
    } else {
      console.log('✅ SUCCESS: Gemini CLI outputs to stdout from Node.js');
      console.log('Recommendation: Direct Node.js spawning is viable');
    }
  });
}

testGeminiSpawn().catch(console.error);
```

**Run Test**:
```bash
node backend/test-gemini-spawn.js
```

**Deliverables**:
- [ ] Test script executed
- [ ] Results documented in research doc
- [ ] Spawning strategy determined (Direct Node.js vs Python proxy)

**Success Criteria**:
- ✅ Gemini CLI spawns successfully from Node.js
- ✅ stdout/stderr captured OR fallback strategy identified

---

### 0.4 Authentication Deep Dive

**Tasks**:
1. Test authentication in headless environment:
   ```bash
   # Clear auth
   gemini auth logout
   
   # Test re-auth (may require interactive OAuth)
   gemini auth login
   ```

2. Document authentication requirements:
   - Does it require browser-based OAuth?
   - Can service accounts be used?
   - Are API keys supported?
   - How to pre-authenticate for headless use?

3. Test spawned process authentication:
   ```bash
   # Spawn Gemini from Node.js test script above
   # Verify it uses existing authentication
   ```

**Deliverables**:
- [ ] Authentication method documented
- [ ] Headless authentication workaround identified (if needed)
- [ ] Setup instructions written

**Success Criteria**:
- ✅ Authentication strategy documented
- ✅ Workaround for headless environments identified (if needed)

---

### 0.5 Research Completion Checklist

Before proceeding to Phase 1, confirm:

- [ ] ✅ Gemini CLI installed and authenticated
- [ ] ✅ Output format fully understood (JSON structure documented)
- [ ] ✅ Sample output fixtures created (success, error, streaming)
- [ ] ✅ Node.js spawning tested (works OR fallback identified)
- [ ] ✅ Authentication strategy documented
- [ ] ✅ `GEMINI_CLI_RESEARCH.md` document complete
- [ ] ✅ Field mapping created (Gemini → AgentMessage)

**Estimated Time**: 2-3 hours

**Fallback Decision Point**:
- If Node.js spawning fails → Use Python proxy approach (add 2-3 hours)
- If authentication blocks → Document manual pre-auth requirement

---

## Phase 1: Gemini Message Parser (3-4 hours)

**Objective**: Create a message parser that converts Gemini CLI output to `AgentMessage` format, following TDD methodology.

**Reference**: `ClaudeMessageParser` (`backend/src/infrastructure/parsers/claude-message.parser.ts`)

---

### 1.1 Create Test File FIRST

**File**: `backend/test/unit/infrastructure/parsers/gemini-message.parser.spec.ts`

**Test Structure** (write ALL tests before implementation):

```typescript
import { GeminiMessageParser } from '@infrastructure/parsers/gemini-message.parser';
import { AgentMessage } from '@application/ports/agent-runner.port';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('GeminiMessageParser', () => {
  let parser: GeminiMessageParser;

  beforeEach(() => {
    parser = new GeminiMessageParser();
  });

  describe('parse', () => {
    // Test 1: Basic response message (based on research findings)
    it('should parse basic response message', () => {
      const line = '{"response":"Hello world","status":"success"}';
      
      const message = parser.parse(line);
      
      expect(message).not.toBeNull();
      expect(message!.type).toBe('assistant');
      expect(message!.content).toBe('Hello world');
    });

    // Test 2: Error message
    it('should parse error message', () => {
      const line = '{"error":"API error occurred","code":"API_ERROR"}';
      
      const message = parser.parse(line);
      
      expect(message!.type).toBe('error');
      expect(message!.content).toBe('API error occurred');
      expect(message!.metadata?.code).toBe('API_ERROR');
    });

    // Test 3: Completion message with stats
    it('should parse completion message with stats', () => {
      const line = '{"status":"complete","stats":{"duration":1500,"tokens":42}}';
      
      const message = parser.parse(line);
      
      expect(message!.type).toBe('response');
      expect(message!.metadata?.stats).toBeDefined();
    });

    // Test 4: Invalid JSON
    it('should throw error for invalid JSON', () => {
      const line = 'not-valid-json';
      
      expect(() => parser.parse(line)).toThrow('Invalid JSON');
    });

    // Test 5: Missing required fields
    it('should throw error when missing required fields', () => {
      const line = '{}';
      
      expect(() => parser.parse(line)).toThrow();
    });

    // Test 6: Complex content object
    it('should handle complex content object', () => {
      const line = '{"response":{"text":"Answer","code":"console.log()"},"type":"assistant"}';
      
      const message = parser.parse(line);
      
      expect(message!.content).toEqual({
        text: 'Answer',
        code: 'console.log()'
      });
    });

    // Test 7: Preserve metadata
    it('should preserve all metadata fields', () => {
      const line = '{"response":"test","model":"gemini-pro","extra":"data"}';
      
      const message = parser.parse(line);
      
      expect(message!.metadata?.model).toBe('gemini-pro');
      expect(message!.metadata?.extra).toBe('data');
    });

    // Test 8: Raw JSON preservation
    it('should store raw JSON in message', () => {
      const line = '{"response":"test"}';
      
      const message = parser.parse(line);
      
      expect(message!.raw).toBe(line);
    });
  });

  describe('parseStream', () => {
    // Test 9: Parse fixture file
    it('should parse multiple lines from fixture file', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-output.json');
      const content = readFileSync(fixturePath, 'utf-8');
      
      // Parse based on discovered format (JSON vs JSONL)
      const lines = content.trim().split('\n');
      const messages = lines.map(line => parser.parse(line));
      
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]!.type).toBeDefined();
    });

    // Test 10: Parse error fixture
    it('should parse error fixture', () => {
      const fixturePath = join(__dirname, '../../../fixtures/gemini-error.json');
      const content = readFileSync(fixturePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const messages = lines.map(line => parser.parse(line));
      
      expect(messages.some(m => m!.type === 'error')).toBe(true);
    });
  });

  describe('isComplete', () => {
    // Test 11: Detect completion
    it('should return true when completion message is received', () => {
      const line = '{"status":"complete","duration":1000}';
      const message = parser.parse(line);
      
      expect(parser.isComplete(message!)).toBe(true);
    });

    // Test 12: Not complete
    it('should return false for non-completion messages', () => {
      const line = '{"response":"Still working..."}';
      const message = parser.parse(line);
      
      expect(parser.isComplete(message!)).toBe(false);
    });
  });

  // Add more tests based on research findings
  // - Streaming format (if different from single JSON)
  // - Tool use messages (if Gemini supports them)
  // - Multi-turn conversation format
  // - Rate limit errors
  // - Authentication errors
});
```

**Test Count Estimate**: 15-20 tests (adjust based on research findings)

**Deliverables**:
- [ ] `gemini-message.parser.spec.ts` created with all tests
- [ ] All tests RED (failing)
- [ ] Test fixtures created in `backend/test/fixtures/`

---

### 1.2 Create Fixture Files

Based on research phase, create:

**File**: `backend/test/fixtures/gemini-output.json` (or `.jsonl`)
```json
{"response":"Hello! I'll help you with that.","model":"gemini-pro"}
{"response":"Let me create that function for you.","model":"gemini-pro"}
{"response":"function fibonacci(n) { ... }","model":"gemini-pro"}
{"status":"complete","stats":{"duration":1234,"tokens":56}}
```

**File**: `backend/test/fixtures/gemini-error.json`
```json
{"response":"Starting task..."}
{"error":"Rate limit exceeded","code":"RATE_LIMIT"}
{"status":"failed","duration":500}
```

**Deliverables**:
- [ ] Fixture files created based on real Gemini output
- [ ] At least 2 fixture files (success, error)

---

### 1.3 Implement Parser (RED → GREEN)

**File**: `backend/src/infrastructure/parsers/gemini-message.parser.ts`

**Implementation Steps**:

1. **RED Phase**: Run tests, verify all fail
   ```bash
   npm test -- gemini-message.parser.spec.ts
   # Expected: All tests fail (parser doesn't exist)
   ```

2. **GREEN Phase**: Implement minimal parser
   ```typescript
   import { AgentMessage } from '@application/ports/agent-runner.port';

   /**
    * Gemini Message Parser
    * Parses JSON output from Gemini CLI
    */
   export class GeminiMessageParser {
     /**
      * Parse a single line from Gemini CLI output
      * @param line - JSON string line
      * @returns Parsed agent message or null if should be skipped
      * @throws Error if line is invalid JSON
      */
     parse(line: string): AgentMessage | null {
       // Parse JSON
       let parsed: Record<string, unknown>;
       try {
         parsed = JSON.parse(line) as Record<string, unknown>;
       } catch (error) {
         throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown'}`);
       }

       // Determine message type based on research findings
       // (Implementation depends on Phase 0 research)
       
       // Extract content
       // Map Gemini fields → AgentMessage fields
       
       // Return structured message
       return {
         type: 'assistant', // or appropriate type
         content: '', // extracted content
         raw: line,
         metadata: {}
       };
     }

     /**
      * Check if message indicates completion
      */
     isComplete(message: AgentMessage): boolean {
       // Based on research findings
       return false;
     }
   }
   ```

3. **Run tests iteratively**: Implement one test at a time
   ```bash
   # Implement just enough to pass test 1
   npm test -- gemini-message.parser.spec.ts -t "should parse basic response"
   
   # Then test 2, etc.
   ```

4. **GREEN Phase Complete**: All tests pass
   ```bash
   npm test -- gemini-message.parser.spec.ts
   # Expected: All tests pass
   ```

**Deliverables**:
- [ ] `gemini-message.parser.ts` implemented
- [ ] All parser tests GREEN (passing)
- [ ] Code coverage ≥80%

---

### 1.4 Refactor Parser

**Refactoring Tasks**:
1. Extract magic strings to constants
2. Add JSDoc comments
3. Improve error messages
4. Extract complex logic to private methods
5. Ensure consistent with ClaudeMessageParser patterns

**Run Tests After Each Refactor**:
```bash
npm test -- gemini-message.parser.spec.ts
# Tests must stay GREEN
```

**Deliverables**:
- [ ] Parser refactored for clarity
- [ ] All tests still passing
- [ ] Code review ready

---

### 1.5 Phase 1 Completion Checklist

- [ ] ✅ Test file created with 15-20 tests
- [ ] ✅ Fixture files created
- [ ] ✅ Parser implementation complete
- [ ] ✅ All tests passing (GREEN)
- [ ] ✅ Code refactored
- [ ] ✅ Code coverage ≥80%
- [ ] ✅ Matches ClaudeMessageParser patterns

**Estimated Time**: 3-4 hours

---

## Phase 2: Gemini CLI Adapter (4-5 hours)

**Objective**: Implement `GeminiCLIAdapter` that spawns Gemini CLI and streams output, following TDD and Clean Architecture.

**Reference**: `ClaudePythonProxyAdapter` (best pattern)

---

### 2.1 Create Adapter Test File FIRST

**File**: `backend/test/unit/infrastructure/adapters/gemini-cli.adapter.spec.ts`

**Test Structure** (write ALL tests before implementation):

```typescript
import { GeminiCLIAdapter } from '@infrastructure/adapters/gemini-cli.adapter';
import { ILogger } from '@application/ports/logger.port';
import { Session } from '@domain/value-objects/session.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IAgentObserver } from '@application/ports/agent-runner.port';
import { ChildProcess } from 'child_process';

// Mock child_process
jest.mock('child_process');

describe('GeminiCLIAdapter', () => {
  let adapter: GeminiCLIAdapter;
  let mockLogger: jest.Mocked<ILogger>;
  let mockProcess: jest.Mocked<ChildProcess>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
      pid: 12345,
    } as any;

    adapter = new GeminiCLIAdapter(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize adapter', () => {
      expect(adapter).toBeDefined();
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'GeminiCLIAdapter initialized',
        expect.any(Object)
      );
    });
  });

  describe('start', () => {
    it('should spawn gemini CLI process', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test prompt', {});

      const agent = await adapter.start(session);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['-p', 'test prompt', '--output-format', 'json']),
        expect.any(Object)
      );
      expect(agent).toBeDefined();
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('should include --yolo flag for auto-execution', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});

      await adapter.start(session);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--yolo']),
        expect.any(Object)
      );
    });

    it('should include session ID if provided', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', { sessionId: 'session-123' });

      await adapter.start(session);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--session-id', 'session-123']),
        expect.any(Object)
      );
    });

    it('should include working directory if provided', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {
        workingDirectory: '/home/user/project'
      });

      await adapter.start(session);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          cwd: '/home/user/project'
        })
      );
    });

    it('should subscribe to stdout stream', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});

      await adapter.start(session);

      expect(mockProcess.stdout!.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should subscribe to stderr stream', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});

      await adapter.start(session);

      expect(mockProcess.stderr!.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should subscribe to process close event', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});

      await adapter.start(session);

      expect(mockProcess.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('stop', () => {
    it('should kill running process', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      await adapter.stop(agent.id);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should throw error if agent not found', async () => {
      const { AgentId } = require('@domain/value-objects/agent-id.vo');
      const agentId = AgentId.generate();

      await expect(adapter.stop(agentId)).rejects.toThrow('No running agent found');
    });

    it('should remove agent from running agents', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      await adapter.stop(agent.id);

      await expect(adapter.getStatus(agent.id)).rejects.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return agent status', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const status = await adapter.getStatus(agent.id);

      expect(status).toBe(AgentStatus.RUNNING);
    });

    it('should throw error if agent not found', async () => {
      const { AgentId } = require('@domain/value-objects/agent-id.vo');
      const agentId = AgentId.generate();

      await expect(adapter.getStatus(agentId)).rejects.toThrow();
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should add observer to agent', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Trigger a message
      const dataCallback = mockProcess.stdout!.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      
      if (dataCallback) {
        dataCallback(Buffer.from('{"response":"test"}'));
      }

      expect(observer.onMessage).toHaveBeenCalled();
    });

    it('should remove observer from agent', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);
      adapter.unsubscribe(agent.id, observer);

      // Trigger a message
      const dataCallback = mockProcess.stdout!.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      
      if (dataCallback) {
        dataCallback(Buffer.from('{"response":"test"}'));
      }

      expect(observer.onMessage).not.toHaveBeenCalled();
    });
  });

  describe('message streaming', () => {
    it('should parse and emit messages from stdout', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Simulate stdout data
      const dataCallback = mockProcess.stdout!.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      
      dataCallback(Buffer.from('{"response":"Hello"}'));

      expect(observer.onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: expect.any(String)
        })
      );
    });

    it('should handle multi-line output', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      const dataCallback = mockProcess.stdout!.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      
      // Simulate partial line, then completion
      dataCallback(Buffer.from('{"response":'));
      dataCallback(Buffer.from('"test"}'));

      expect(observer.onMessage).toHaveBeenCalled();
    });

    it('should emit onComplete when process closes', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Simulate process close
      const closeCallback = mockProcess.on.mock.calls.find(
        call => call[0] === 'close'
      )?.[1];
      
      closeCallback(0);

      expect(observer.onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          duration: expect.any(Number)
        })
      );
    });

    it('should emit onError on stderr output', async () => {
      const { spawn } = require('child_process');
      spawn.mockReturnValue(mockProcess);

      const session = Session.create('test', {});
      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      const stderrCallback = mockProcess.stderr!.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];
      
      stderrCallback(Buffer.from('Authentication failed'));

      expect(observer.onError).toHaveBeenCalled();
    });
  });
});
```

**Test Count Estimate**: 20-25 tests

**Deliverables**:
- [ ] `gemini-cli.adapter.spec.ts` created with all tests
- [ ] All tests RED (failing)

---

### 2.2 Implement Adapter (RED → GREEN)

**File**: `backend/src/infrastructure/adapters/gemini-cli.adapter.ts`

**Implementation Steps**:

1. **RED Phase**: Run tests, verify all fail
   ```bash
   npm test -- gemini-cli.adapter.spec.ts
   ```

2. **GREEN Phase**: Implement adapter iteratively

```typescript
import { IAgentRunner, IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { ILogger } from '@application/ports/logger.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { GeminiMessageParser } from '@infrastructure/parsers/gemini-message.parser';
import { spawn, ChildProcess } from 'child_process';

/**
 * Running Agent Info
 */
interface RunningAgentInfo {
  agent: Agent;
  process: ChildProcess;
  observers: Set<IAgentObserver>;
  startTime: number;
  messageCount: number;
  buffer: string; // For handling multi-line JSON
}

/**
 * Gemini CLI Adapter
 * 
 * Spawns Gemini CLI processes and streams output.
 * 
 * @status IMPLEMENTATION - TDD Phase
 * @authentication Requires Gemini CLI authentication (gemini auth login)
 * @usecase Users with Gemini API access
 * 
 * Architecture:
 * - Node.js → child_process.spawn → Gemini CLI
 * - Real-time streaming via stdout/stderr
 * 
 * Command format:
 * gemini -p "prompt" --output-format json --yolo [-b]
 */
export class GeminiCLIAdapter implements IAgentRunner {
  private runningAgents = new Map<string, RunningAgentInfo>();
  private readonly parser = new GeminiMessageParser();

  constructor(private readonly logger: ILogger) {
    this.logger.info('GeminiCLIAdapter initialized');
  }

  async start(session: Session): Promise<Agent> {
    // Create agent entity
    const agent = Agent.create({
      type: AgentType.GEMINI_CLI,
      prompt: session.prompt,
      configuration: session.configuration,
    });

    const agentId = agent.id.toString();

    this.logger.info('Starting Gemini CLI agent', {
      agentId,
      prompt: session.prompt.substring(0, 50) + '...',
    });

    // Build command arguments
    const args = this.buildCommandArgs(session);

    // Build spawn options
    const options = this.buildSpawnOptions(session);

    // Spawn Gemini CLI process
    const childProcess = spawn('gemini', args, options);

    if (!childProcess.pid) {
      throw new Error('Failed to spawn Gemini CLI process');
    }

    // Track running agent
    this.runningAgents.set(agentId, {
      agent,
      process: childProcess,
      observers: new Set(),
      startTime: Date.now(),
      messageCount: 0,
      buffer: '',
    });

    // Mark agent as running
    agent.markAsRunning();

    // Subscribe to process streams
    this.subscribeToProcess(agentId, childProcess);

    return agent;
  }

  async stop(agentId: AgentId): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      throw new Error(`No running agent found: ${id}`);
    }

    // Kill process
    agentInfo.process.kill('SIGTERM');

    // Clean up
    this.runningAgents.delete(id);

    this.logger.info('Gemini agent stopped', { agentId: id });
  }

  async getStatus(agentId: AgentId): Promise<AgentStatus> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      throw new Error(`No running agent found: ${id}`);
    }

    return agentInfo.agent.status;
  }

  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (agentInfo) {
      agentInfo.observers.add(observer);
      this.logger.debug('Observer subscribed to agent', { agentId: id });
    }
  }

  unsubscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (agentInfo) {
      agentInfo.observers.delete(observer);
      this.logger.debug('Observer unsubscribed from agent', { agentId: id });
    }
  }

  /**
   * Build command arguments based on session configuration
   */
  private buildCommandArgs(session: Session): string[] {
    const args: string[] = [
      '-p', session.prompt,
      '--output-format', 'json',
      '--yolo', // Auto-execute mode
    ];

    // Add session ID if provided (multi-turn)
    if (session.configuration.sessionId) {
      args.push('--session-id', session.configuration.sessionId);
    }

    // Add background mode if configured
    if (session.configuration.backgroundMode) {
      args.push('-b');
    }

    return args;
  }

  /**
   * Build spawn options
   */
  private buildSpawnOptions(session: Session): Record<string, any> {
    const options: Record<string, any> = {
      env: { ...process.env },
    };

    // Set working directory if provided
    if (session.configuration.workingDirectory) {
      options.cwd = session.configuration.workingDirectory;
    }

    return options;
  }

  /**
   * Subscribe to process stdout/stderr streams
   */
  private subscribeToProcess(agentId: string, childProcess: ChildProcess): void {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) return;

    // Handle stdout (main output)
    childProcess.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(agentId, data);
    });

    // Handle stderr (errors)
    childProcess.stderr?.on('data', (data: Buffer) => {
      this.handleStderr(agentId, data);
    });

    // Handle process close
    childProcess.on('close', (code: number) => {
      this.handleProcessClose(agentId, code);
    });

    // Handle process error
    childProcess.on('error', (error: Error) => {
      this.handleProcessError(agentId, error);
    });
  }

  /**
   * Handle stdout data
   */
  private handleStdout(agentId: string, data: Buffer): void {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) return;

    // Append to buffer
    agentInfo.buffer += data.toString();

    // Process complete lines
    const lines = agentInfo.buffer.split('\n');
    agentInfo.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = this.parser.parse(line);
        
        if (message === null) {
          // Skip this event
          continue;
        }

        agentInfo.messageCount++;

        this.logger.debug('Gemini message received', {
          agentId,
          type: message.type,
        });

        this.notifyObservers(agentId, 'onMessage', message);
      } catch (error) {
        this.logger.error('Failed to parse Gemini output', {
          agentId,
          line,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }
  }

  /**
   * Handle stderr data
   */
  private handleStderr(agentId: string, data: Buffer): void {
    const stderr = data.toString();
    
    this.logger.warn('Gemini CLI stderr', { agentId, stderr });

    // Emit error to observers
    const error = new Error(`Gemini CLI error: ${stderr}`);
    this.notifyObservers(agentId, 'onError', error);
  }

  /**
   * Handle process close
   */
  private handleProcessClose(agentId: string, code: number): void {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) return;

    const duration = Date.now() - agentInfo.startTime;

    this.logger.info('Gemini CLI process closed', {
      agentId,
      code,
      duration,
      messageCount: agentInfo.messageCount,
    });

    // Notify completion
    this.notifyObservers(agentId, 'onComplete', {
      status: code === 0 ? 'success' : 'failed',
      duration,
      messageCount: agentInfo.messageCount,
    });

    // Clean up
    this.runningAgents.delete(agentId);
  }

  /**
   * Handle process error
   */
  private handleProcessError(agentId: string, error: Error): void {
    this.logger.error('Gemini CLI process error', {
      agentId,
      error: error.message,
    });

    this.notifyObservers(agentId, 'onError', error);

    // Clean up
    this.runningAgents.delete(agentId);
  }

  /**
   * Notify all observers
   */
  private notifyObservers(agentId: string, method: keyof IAgentObserver, data: any): void {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) return;

    agentInfo.observers.forEach((observer) => {
      try {
        const fn = observer[method] as Function;
        fn.call(observer, data);
      } catch (error) {
        this.logger.error('Observer notification error', {
          agentId,
          method,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    });
  }
}
```

3. **Run tests iteratively**:
   ```bash
   npm test -- gemini-cli.adapter.spec.ts
   ```

**Deliverables**:
- [ ] `gemini-cli.adapter.ts` implemented
- [ ] All adapter tests GREEN
- [ ] Code coverage ≥80%

---

### 2.3 Integration Test

**File**: `backend/test/integration/adapters/gemini-cli.adapter.integration.spec.ts`

**Test Structure**:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiCLIAdapter } from '@infrastructure/adapters/gemini-cli.adapter';
import { Session } from '@domain/value-objects/session.vo';
import { IAgentObserver } from '@application/ports/agent-runner.port';
import { ILogger } from '@application/ports/logger.port';

// This test uses MOCK process (not real Gemini CLI)
// Real CLI testing happens in Phase 4 (Smoke Tests)

describe('GeminiCLIAdapter Integration', () => {
  let adapter: GeminiCLIAdapter;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    adapter = new GeminiCLIAdapter(mockLogger);
  });

  it('should integrate with parser for streaming', async () => {
    // Test with fixture data
    // Verify full data flow: spawn → stdout → parse → notify
  });

  it('should handle multi-turn conversation', async () => {
    // Test session ID continuity
  });

  it('should respect working directory configuration', async () => {
    // Test cwd is passed correctly
  });
});
```

**Deliverables**:
- [ ] Integration test file created
- [ ] Integration tests passing

---

### 2.4 Phase 2 Completion Checklist

- [ ] ✅ Adapter test file created with 20-25 tests
- [ ] ✅ Adapter implementation complete
- [ ] ✅ All unit tests passing (GREEN)
- [ ] ✅ Integration tests passing
- [ ] ✅ Code refactored
- [ ] ✅ Code coverage ≥80%
- [ ] ✅ Follows IAgentRunner interface
- [ ] ✅ Matches ClaudePythonProxyAdapter patterns

**Estimated Time**: 4-5 hours

---

## Phase 3: Factory Integration (1-2 hours)

**Objective**: Update `AgentFactoryAdapter` to create `GeminiCLIAdapter` instances, following TDD.

**Reference**: `backend/src/infrastructure/adapters/agent-factory.adapter.ts`

---

### 3.1 Update Factory Tests FIRST

**File**: `backend/test/unit/infrastructure/adapters/agent-factory.adapter.spec.ts`

**Add New Tests**:

```typescript
describe('AgentFactoryAdapter', () => {
  // ... existing tests ...

  describe('create - Gemini CLI', () => {
    it('should create GeminiCLIAdapter for GEMINI_CLI type', () => {
      const factory = new AgentFactoryAdapter(mockClaudeAdapter, mockGeminiAdapter);
      
      const runner = factory.create(AgentType.GEMINI_CLI);
      
      expect(runner).toBe(mockGeminiAdapter);
    });

    it('should not create GeminiCLIAdapter for other types', () => {
      const factory = new AgentFactoryAdapter(mockClaudeAdapter, mockGeminiAdapter);
      
      const runner = factory.create(AgentType.CLAUDE_CODE);
      
      expect(runner).not.toBe(mockGeminiAdapter);
      expect(runner).toBe(mockClaudeAdapter);
    });
  });
});
```

**Run Tests** (should fail - factory doesn't support Gemini yet):
```bash
npm test -- agent-factory.adapter.spec.ts
# Expected: RED (new tests fail)
```

**Deliverables**:
- [ ] Factory tests updated
- [ ] New tests RED (failing)

---

### 3.2 Update Factory Implementation

**File**: `backend/src/infrastructure/adapters/agent-factory.adapter.ts`

**Changes**:

```typescript
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * Agent Factory Adapter
 * Creates agent runners based on agent type.
 */
export class AgentFactoryAdapter implements IAgentFactory {
  constructor(
    private readonly claudeAdapter: IAgentRunner,
    private readonly geminiCliAdapter: IAgentRunner // ADD THIS
  ) {}

  /**
   * Create an agent runner for the specified type
   */
  create(type: AgentType): IAgentRunner {
    switch (type) {
      case AgentType.CLAUDE_CODE:
        return this.claudeAdapter;

      case AgentType.GEMINI_CLI:
        return this.geminiCliAdapter; // ADD THIS

      default:
        throw new Error(`Agent type not supported: ${type}`);
    }
  }
}
```

**Run Tests**:
```bash
npm test -- agent-factory.adapter.spec.ts
# Expected: GREEN (all tests pass)
```

**Deliverables**:
- [ ] Factory implementation updated
- [ ] All factory tests GREEN

---

### 3.3 Update NestJS Module (Dependency Injection)

**File**: `backend/src/infrastructure/infrastructure.module.ts` (or similar)

**Add Gemini Adapter Provider**:

```typescript
import { GeminiCLIAdapter } from '@infrastructure/adapters/gemini-cli.adapter';

@Module({
  providers: [
    // ... existing providers ...
    
    // Gemini CLI Adapter
    {
      provide: 'GEMINI_CLI_ADAPTER',
      useFactory: (logger: ILogger) => {
        return new GeminiCLIAdapter(logger);
      },
      inject: ['ILogger'],
    },
    
    // Update Agent Factory to inject Gemini adapter
    {
      provide: 'IAgentFactory',
      useFactory: (
        claudeAdapter: IAgentRunner,
        geminiAdapter: IAgentRunner
      ) => {
        return new AgentFactoryAdapter(claudeAdapter, geminiAdapter);
      },
      inject: ['CLAUDE_ADAPTER', 'GEMINI_CLI_ADAPTER'],
    },
  ],
  // ... exports ...
})
export class InfrastructureModule {}
```

**Deliverables**:
- [ ] NestJS module updated
- [ ] Dependency injection configured
- [ ] Application starts without errors

---

### 3.4 Phase 3 Completion Checklist

- [ ] ✅ Factory tests updated
- [ ] ✅ Factory implementation updated
- [ ] ✅ All factory tests GREEN
- [ ] ✅ NestJS module updated
- [ ] ✅ Dependency injection working
- [ ] ✅ Application compiles and starts

**Estimated Time**: 1-2 hours

---

## Phase 4: Smoke Tests (2-3 hours)

**Objective**: Create end-to-end smoke tests that use REAL Gemini CLI to validate the full integration.

**Reference**: `backend/test/e2e/smoke/python-proxy.smoke.spec.ts`

---

### 4.1 Create Smoke Test Helpers

**File**: `backend/test/e2e/smoke/gemini-helpers.ts`

```typescript
/**
 * Gemini CLI Smoke Test Helpers
 */

/**
 * Check if Gemini CLI is installed and authenticated
 */
export async function checkGeminiAvailability(): Promise<boolean> {
  try {
    const { execSync } = require('child_process');
    
    // Check if gemini command exists
    const result = execSync('which gemini', { encoding: 'utf-8' });
    
    if (!result) {
      return false;
    }
    
    // Try to run a simple command (may fail if not authenticated)
    try {
      execSync('gemini -p "test" --output-format json', {
        timeout: 10000,
        encoding: 'utf-8',
      });
      return true;
    } catch (authError) {
      console.warn('Gemini CLI found but authentication may be required');
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Verify Gemini authentication
 */
export async function verifyGeminiAuthentication(): Promise<boolean> {
  try {
    const { execSync } = require('child_process');
    
    // Check auth status (command may vary)
    const result = execSync('gemini auth status', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    
    return result.includes('authenticated') || result.includes('logged in');
  } catch (error) {
    return false;
  }
}
```

**Deliverables**:
- [ ] Smoke test helpers created

---

### 4.2 Create Smoke Test Suite

**File**: `backend/test/e2e/smoke/gemini-cli.smoke.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';
import {
  checkGeminiAvailability,
  verifyGeminiAuthentication,
} from './gemini-helpers';
import { cleanupAllAgents } from './helpers';

/**
 * SMOKE TESTS - Real Gemini CLI Integration
 *
 * These tests use REAL Gemini CLI to validate end-to-end integration.
 *
 * Prerequisites:
 * 1. Gemini CLI must be installed: npm install -g @google/gemini-cli (or similar)
 * 2. Gemini CLI must be authenticated: gemini auth login
 * 3. Valid Gemini API access
 *
 * Cost: Varies (uses Gemini API quota)
 * Duration: ~2-3 minutes (real CLI is slow)
 *
 * These tests are OPTIONAL in CI/CD - they validate real-world behavior
 * but are not required for every commit. Run before releases.
 */
describe('Gemini CLI Smoke Tests (REAL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Check if Gemini CLI is available
    const isAvailable = await checkGeminiAvailability();

    if (!isAvailable) {
      console.warn('⚠️  Gemini CLI not available. Skipping smoke tests.');
      console.warn('   Install: npm install -g @google/gemini-cli');
      console.warn('   Authenticate: gemini auth login');
      return;
    }

    // Initialize NestJS app
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    if (app) {
      await cleanupAllAgents(app);
    }
  });

  afterEach(async () => {
    if (app) {
      await cleanupAllAgents(app);
    }
  });

  /**
   * TEST #1: Gemini CLI Availability
   */
  it('should verify Gemini CLI is available and authenticated', async () => {
    const isAvailable = await checkGeminiAvailability();

    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    expect(isAvailable).toBe(true);

    const isAuthenticated = await verifyGeminiAuthentication();
    expect(isAuthenticated).toBe(true);
  }, 10000);

  /**
   * TEST #2: Launch Gemini Agent
   */
  it('should launch a real Gemini CLI agent', async () => {
    const isAvailable = await checkGeminiAvailability();
    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    const response = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'Say "Hello from Gemini!" and nothing else.',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.type).toBe('gemini-cli');
    expect(response.body.status).toBe('running');

    console.log('✅ Gemini agent launched:', response.body.id);
  }, 30000);

  /**
   * TEST #3: Receive Messages from Gemini
   */
  it('should receive messages from real Gemini CLI', async () => {
    const isAvailable = await checkGeminiAvailability();
    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    // Launch agent
    const launchResponse = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'Count from 1 to 3 and say "done".',
      })
      .expect(201);

    const agentId = launchResponse.body.id;

    // Wait for messages (using helper from Phase 0 smoke test)
    const { waitForAgentMessages } = require('./helpers');
    
    const messages = await waitForAgentMessages(app, agentId, {
      timeout: 60000,
      minMessages: 1,
      expectedContent: 'done',
    });

    expect(messages.length).toBeGreaterThan(0);
    
    // Verify message structure
    const firstMessage = messages[0];
    expect(firstMessage).toHaveProperty('type');
    expect(firstMessage).toHaveProperty('content');

    console.log('✅ Received', messages.length, 'messages from Gemini');
    console.log('   First message type:', firstMessage.type);
  }, 90000);

  /**
   * TEST #4: Stop Gemini Agent
   */
  it('should stop a running Gemini agent', async () => {
    const isAvailable = await checkGeminiAvailability();
    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    // Launch agent
    const launchResponse = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'Count to 100 slowly.',
      })
      .expect(201);

    const agentId = launchResponse.body.id;

    // Wait a bit for agent to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Stop agent
    await request(app.getHttpServer())
      .delete(`/api/agents/${agentId}`)
      .expect(204);

    console.log('✅ Gemini agent stopped:', agentId);
  }, 30000);

  /**
   * TEST #5: Gemini with Working Directory
   */
  it('should launch Gemini agent in custom working directory', async () => {
    const isAvailable = await checkGeminiAvailability();
    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    const response = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'Run "pwd" and tell me the current directory',
        configuration: {
          workingDirectory: '/tmp',
        },
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');

    console.log('✅ Gemini agent with working directory:', response.body.id);
  }, 60000);

  /**
   * TEST #6: Gemini Multi-turn Conversation
   */
  it('should support multi-turn conversation with session ID', async () => {
    const isAvailable = await checkGeminiAvailability();
    if (!isAvailable) {
      console.warn('Skipping test - Gemini CLI not available');
      return;
    }

    // Turn 1
    const turn1Response = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'My favorite color is blue. Remember this.',
      })
      .expect(201);

    const sessionId = turn1Response.body.session?.id;
    expect(sessionId).toBeDefined();

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Turn 2 (with session ID)
    const turn2Response = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'gemini-cli',
        prompt: 'What is my favorite color?',
        configuration: {
          sessionId,
        },
      })
      .expect(201);

    expect(turn2Response.body).toHaveProperty('id');

    console.log('✅ Multi-turn conversation working');
  }, 120000);
});
```

**Test Count**: 6 tests

**Deliverables**:
- [ ] Smoke test suite created
- [ ] Smoke test helpers implemented
- [ ] All smoke tests passing (if Gemini CLI available)

---

### 4.3 Update Test Scripts

**File**: `backend/package.json`

**Add Smoke Test Script**:

```json
{
  "scripts": {
    "test": "jest --testPathIgnorePatterns='.smoke.spec.ts'",
    "test:smoke": "jest --testMatch='**/*.smoke.spec.ts' --runInBand",
    "test:smoke:gemini": "jest --testMatch='**/gemini-cli.smoke.spec.ts' --runInBand"
  }
}
```

**Deliverables**:
- [ ] Test scripts updated
- [ ] Smoke tests can be run independently

---

### 4.4 Phase 4 Completion Checklist

- [ ] ✅ Smoke test helpers created
- [ ] ✅ Smoke test suite created (6 tests)
- [ ] ✅ All smoke tests passing (if Gemini CLI available)
- [ ] ✅ Test scripts updated
- [ ] ✅ Documentation updated

**Estimated Time**: 2-3 hours

---

## Risk Mitigation Strategies

### Risk 1: Node.js Cannot Spawn Gemini CLI

**Likelihood**: Medium  
**Impact**: High

**Detection**:
- Phase 0.3 test shows no stdout output
- Similar to Claude CLI bug (#6775, #771)

**Mitigation**:
1. **Python Proxy Approach** (recommended):
   - Create `gemini-proxy-service/` (similar to `claude-proxy-service/`)
   - Python FastAPI service spawns Gemini CLI
   - Node.js communicates via HTTP/SSE
   - Additional effort: +4-6 hours

2. **Docker Container Approach**:
   - Run Gemini CLI in Docker container
   - Communicate via HTTP API
   - Additional effort: +3-5 hours

**Decision Point**: End of Phase 0.3

---

### Risk 2: Authentication Blocks Headless Execution

**Likelihood**: High (Gemini uses OAuth)  
**Impact**: High

**Detection**:
- Phase 0.4 shows OAuth browser requirement
- Cannot authenticate in CI/CD

**Mitigation**:
1. **Pre-authentication Requirement**:
   - Document manual auth requirement
   - Users must run `gemini auth login` before launching agents
   - Add authentication check in adapter

2. **Service Account Approach**:
   - Research Gemini service account support
   - Use API key instead of OAuth
   - Additional effort: +2-3 hours

3. **Skip Smoke Tests in CI/CD**:
   - Mark smoke tests as optional
   - Run manually before releases
   - Document authentication requirements

**Decision Point**: End of Phase 0.4

---

### Risk 3: Gemini Output Format Incompatible

**Likelihood**: Low  
**Impact**: Medium

**Detection**:
- Phase 0.2 reveals unexpected output format
- Cannot map to AgentMessage structure

**Mitigation**:
1. **Parser Adapter Pattern**:
   - Create intermediate data structure
   - Transform Gemini format → AgentMessage
   - Additional effort: +1-2 hours

2. **Custom Message Types**:
   - Extend AgentMessage to support Gemini-specific fields
   - Add Gemini-specific metadata
   - Additional effort: +1 hour

**Decision Point**: End of Phase 0.2

---

### Risk 4: Gemini CLI Missing Features

**Likelihood**: Medium  
**Impact**: Medium

**Detection**:
- Phase 0 research reveals missing features
- Examples: No session ID support, no working directory, etc.

**Mitigation**:
1. **Feature Parity Documentation**:
   - Document differences from Claude adapter
   - Mark unsupported features clearly
   - Additional effort: +1 hour

2. **Workarounds**:
   - Implement workarounds where possible
   - Example: Multi-turn via prompt injection
   - Additional effort: +2-4 hours per feature

3. **Graceful Degradation**:
   - Disable unsupported configuration options
   - Log warnings when features not available
   - Additional effort: +1 hour

**Decision Point**: Throughout Phase 0

---

## Success Criteria

### Phase 0: Research Complete

- [ ] ✅ Gemini CLI installed and authenticated
- [ ] ✅ Output format documented with samples
- [ ] ✅ Node.js spawning validated (or fallback identified)
- [ ] ✅ Authentication strategy documented
- [ ] ✅ All prerequisite blockers resolved

### Phase 1: Parser Complete

- [ ] ✅ 15-20 parser tests written and passing
- [ ] ✅ Parser converts Gemini JSON → AgentMessage
- [ ] ✅ Fixture files created for success/error cases
- [ ] ✅ Code coverage ≥80%
- [ ] ✅ Parser follows ClaudeMessageParser patterns

### Phase 2: Adapter Complete

- [ ] ✅ 20-25 adapter tests written and passing
- [ ] ✅ Adapter implements IAgentRunner interface
- [ ] ✅ Spawns Gemini CLI and streams output
- [ ] ✅ Observer pattern working
- [ ] ✅ Error handling comprehensive
- [ ] ✅ Code coverage ≥80%
- [ ] ✅ Follows ClaudePythonProxyAdapter patterns

### Phase 3: Factory Integration Complete

- [ ] ✅ Factory creates GeminiCLIAdapter for GEMINI_CLI type
- [ ] ✅ Dependency injection configured
- [ ] ✅ Application compiles and starts
- [ ] ✅ All factory tests passing

### Phase 4: Smoke Tests Complete

- [ ] ✅ 6 smoke tests created
- [ ] ✅ Smoke tests pass with real Gemini CLI
- [ ] ✅ End-to-end integration validated
- [ ] ✅ Documentation updated

### Final Acceptance Criteria

- [ ] ✅ ALL unit tests passing (100%)
- [ ] ✅ ALL integration tests passing (100%)
- [ ] ✅ Smoke tests passing (if Gemini CLI available)
- [ ] ✅ Code coverage ≥80% for new code
- [ ] ✅ No regressions in existing tests (261+ tests still passing)
- [ ] ✅ Application starts without errors
- [ ] ✅ Can launch Gemini CLI agent via REST API
- [ ] ✅ Can receive streaming messages from Gemini
- [ ] ✅ Can stop Gemini agent
- [ ] ✅ Documentation complete
- [ ] ✅ Architecture diagrams updated

---

## Critical Files for Implementation

Based on this plan, these are the **5 most critical files** for implementing Gemini support:

### 1. `/backend/src/infrastructure/parsers/gemini-message.parser.ts`
**Reason**: Core logic for converting Gemini CLI output → AgentMessage format  
**Phase**: Phase 1 (Parser)  
**Dependencies**: None (pure transformation logic)  
**Pattern**: Follow `claude-message.parser.ts`

### 2. `/backend/src/infrastructure/adapters/gemini-cli.adapter.ts`
**Reason**: Main adapter that spawns Gemini CLI and orchestrates streaming  
**Phase**: Phase 2 (Adapter)  
**Dependencies**: Requires parser from Phase 1  
**Pattern**: Follow `claude-python-proxy.adapter.ts` (best reference)

### 3. `/backend/test/unit/infrastructure/parsers/gemini-message.parser.spec.ts`
**Reason**: TDD test file - write FIRST before parser implementation  
**Phase**: Phase 1 (Parser Tests)  
**Dependencies**: None  
**Pattern**: Follow `claude-message.parser.spec.ts` (528 lines, comprehensive)

### 4. `/backend/test/unit/infrastructure/adapters/gemini-cli.adapter.spec.ts`
**Reason**: TDD test file - write FIRST before adapter implementation  
**Phase**: Phase 2 (Adapter Tests)  
**Dependencies**: Requires parser from Phase 1  
**Pattern**: Follow `claude-python-proxy.adapter.spec.ts` (150+ lines)

### 5. `/backend/src/infrastructure/adapters/agent-factory.adapter.ts`
**Reason**: Integration point - factory must create Gemini adapter instances  
**Phase**: Phase 3 (Factory Integration)  
**Dependencies**: Requires adapter from Phase 2  
**Pattern**: Extend existing factory (currently supports Claude only)

---

## Total Effort Estimate

| Phase | Description | Estimated Time | Risk Buffer |
|-------|-------------|----------------|-------------|
| Phase 0 | Research & Validation | 2-3 hours | +1 hour |
| Phase 1 | Message Parser (TDD) | 3-4 hours | +1 hour |
| Phase 2 | CLI Adapter (TDD) | 4-5 hours | +1 hour |
| Phase 3 | Factory Integration | 1-2 hours | +0.5 hour |
| Phase 4 | Smoke Tests | 2-3 hours | +1 hour |
| **TOTAL** | **Base Implementation** | **12-17 hours** | **+4.5 hours** |

**Fallback Scenarios**:
- If Node.js spawning fails → Add Python proxy: +4-6 hours
- If authentication blocks → Service account research: +2-3 hours
- If output format incompatible → Custom parser adapter: +1-2 hours

**Maximum Effort** (with all fallbacks): **25-30 hours**

---

## Next Steps

1. **Review this plan** with the team
2. **Begin Phase 0**: Research & validation (MUST complete before coding)
3. **Update plan** based on research findings
4. **Execute Phase 1-4** following strict TDD methodology
5. **Validate** with smoke tests before release

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-02  
**Status**: Ready for Implementation  
**Approved By**: [Pending Review]
