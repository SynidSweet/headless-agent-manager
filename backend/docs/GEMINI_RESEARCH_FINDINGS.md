# Gemini CLI Research Findings - Phase 0

**Date**: 2025-12-02
**Phase**: Phase 0 - Research & Validation
**Status**: ⚠️ BLOCKED - Version compatibility issue identified

---

## Executive Summary

Gemini CLI is installed but **currently non-functional** due to a Node.js compatibility issue. The installed version (0.1.9) is severely outdated compared to the latest stable release (0.18.4). An upgrade is required before implementation can proceed.

**Recommendation**: Upgrade to `@google/gemini-cli@0.18.4` before starting Phase 1 (Parser Implementation).

---

## 1. CLI Availability

### Installation Status

✅ **Gemini CLI is installed**
- **Location**: `/usr/bin/gemini`
- **Installed Version**: `0.1.9` (via npm global)
- **Latest Version**: `0.18.4` (published 6 days ago)
- **Package**: `@google/gemini-cli`

### Version Compatibility Issue

❌ **Critical Error Detected**

```bash
$ gemini --version
ReferenceError: File is not defined
    at Object.<anonymous> (/usr/lib/node_modules/@google/gemini-cli/node_modules/undici/lib/web/webidl/index.js:531:48)
```

**Root Cause**:
- Installed version (0.1.9) is incompatible with Node.js v18.20.8
- The `undici` dependency references the `File` API which was added in Node.js 20+
- Version 0.1.9 is from early 2024 (likely alpha/beta) and predates major API changes

**Resolution Required**: Upgrade to latest version:
```bash
npm install -g @google/gemini-cli@latest
```

---

## 2. Output Format Analysis

### Documented Output Formats

Based on official documentation research, Gemini CLI supports **three output formats**:

#### 2.1 Text Output (Default)
- Human-readable responses
- No structured metadata
- **Use Case**: Interactive debugging

#### 2.2 JSON Output
- **Flag**: `--output-format json`
- **Format**: Single JSON object per execution
- **Structure**:
  ```json
  {
    "response": "AI-generated content",
    "stats": {
      "models": { /* per-model API/token usage */ },
      "tools": { /* tool execution statistics */ },
      "files": { /* file modification counts */ }
    },
    "error": null
  }
  ```
- **Use Case**: Programmatic processing, automation scripts

#### 2.3 Stream JSON Output (JSONL)
- **Flag**: `--output-format stream-json`
- **Format**: Newline-delimited JSON (JSONL)
- **Event Types**:
  1. `init` - Session initialization
  2. `message` - User/assistant messages
  3. `tool_use` - Tool call requests
  4. `tool_result` - Tool execution outcomes
  5. `error` - Non-fatal errors
  6. `result` - Final session outcome with aggregated stats

- **Use Case**: Real-time progress monitoring, event-driven automation

### Comparison with Claude CLI

| Feature | Claude CLI | Gemini CLI |
|---------|------------|------------|
| Format | JSONL (stream-json) | JSONL (stream-json) + JSON |
| Event Types | system, user, assistant | init, message, tool_use, tool_result, error, result |
| Streaming | ✅ Native | ✅ Native |
| Session IDs | ✅ `--session-id` | Unknown (needs testing) |
| Tool Execution | ❌ Not exposed | ✅ Exposed (tool_use/tool_result) |
| Final Stats | ✅ In result event | ✅ In result event |

**Key Difference**: Gemini CLI has **more granular event types** (especially for tool usage), which could provide richer monitoring capabilities.

---

## 3. Authentication Requirements

Gemini CLI supports **three authentication methods**:

### Option 1: OAuth (Google Login) ⭐ Recommended for MVP
- **Setup**: `gemini login`
- **Free Tier**:
  - 60 requests/minute
  - 1,000 requests/day
- **Model Access**: Gemini 2.5 Pro (1M token context)
- **Benefits**:
  - No API key management
  - Higher rate limits than API key
  - Suitable for development/testing

### Option 2: API Key
- **Setup**:
  1. Get API key from https://aistudio.google.com/apikey
  2. Set `GEMINI_API_KEY` environment variable
- **Free Tier**:
  - 100 requests/day (lower than OAuth)
- **Use Case**: CI/CD pipelines, headless environments

### Option 3: Vertex AI (Enterprise)
- **Setup**: Google Cloud credentials
- **Benefits**:
  - Enterprise security/compliance
  - Higher rate limits (billing required)
  - Production-grade SLAs
- **Use Case**: Production deployments

**Recommendation for MVP**: Start with **OAuth** for development, migrate to **Vertex AI** for production.

---

## 4. Multi-turn Conversation Support

### Session Continuity

**Status**: ⚠️ Unclear - Needs Testing

The documentation mentions:
- `--prompt-interactive` flag for starting interactive sessions
- Stdin support for piping content
- No explicit `--session-id` flag mentioned (unlike Claude CLI)

**Research Needed**: Test if Gemini CLI supports:
1. Session IDs or conversation persistence
2. Multi-turn headless conversations
3. State management between invocations

**Potential Workaround**: If session IDs are not supported:
- Use conversational context in each prompt
- Implement application-level session tracking
- Pass conversation history explicitly

---

## 5. Command-Line Flags Reference

### Core Flags

| Flag | Short | Description | Example |
|------|-------|-------------|---------|
| `--prompt` | `-p` | Non-interactive prompt | `gemini -p "query"` |
| `--output-format` | - | Output type (text/json/stream-json) | `--output-format json` |
| `--model` | `-m` | Specify Gemini model | `-m gemini-2.5-flash` |
| `--yolo` | `-y` | Auto-approve actions (no confirmation) | `--yolo` |
| `--include-directories` | - | Add directories for context | `--include-directories src,docs` |
| `--all-files` | - | Recursively include all files | `--all-files` |
| `--debug` | `-d` | Enable debug/verbose output | `--debug` |
| `--help` | - | Display help | `--help` |

### Model Options

Available models (as of Dec 2025):
- `gemini-2.5-pro` (default) - 1M token context
- `gemini-2.5-flash` - Faster, lower cost
- Others TBD (check with `--help` after upgrade)

---

## 6. Test Fixtures Analysis

### Existing Fixtures

✅ **Claude CLI Fixtures Found**:
- `backend/test/fixtures/claude-code-output.jsonl` (6 events)
- `backend/test/fixtures/claude-code-error.jsonl` (error scenarios)
- `backend/test/fixtures/claude-code-real-output.jsonl` (real CLI output)

❌ **No Gemini CLI Fixtures**: Need to create after CLI upgrade

### Required Test Fixtures

To implement Gemini CLI integration, we need:

1. **gemini-cli-output.jsonl** - Happy path streaming
   - `init` event
   - `message` events (user + assistant)
   - `tool_use` + `tool_result` (optional)
   - `result` event with stats

2. **gemini-cli-error.jsonl** - Error scenarios
   - Authentication errors
   - Rate limit errors
   - API errors

3. **gemini-cli-real-output.jsonl** - Captured from actual CLI
   - Validate parser against real data

---

## 7. Known Issues & Limitations

### From GitHub Issues

1. **JSON Output Formatting** (Issue #11184, Oct 2025)
   - `--output-format json` may wrap response in markdown code blocks
   - Expected: Pure JSON
   - Actual: JSON wrapped in ` ```json ... ``` `
   - **Status**: Unknown if fixed in 0.18.4

2. **Unknown Arguments Error** (Issue #9009, Sep 2025)
   - Some versions reject `--output-format json` as unknown
   - **Status**: Likely fixed in later versions

3. **Structured Output API** (Issue #5021)
   - Feature request for JSON Schema support
   - **Status**: Being discussed, not yet implemented in CLI

### Compatibility Matrix

| Environment | Status | Notes |
|-------------|--------|-------|
| Node.js 18.x | ⚠️ Depends on version | 0.1.9 fails, 0.18.4 unknown |
| Node.js 20.x | ✅ Expected to work | File API supported |
| Node.js 22.x | ✅ Expected to work | Latest LTS |
| Headless (no TTY) | ✅ Supported | Via `--prompt` flag |
| Docker/CI | ✅ Supported | Via API key auth |

---

## 8. Implementation Recommendations

### Phase 1: Parser Implementation (Next Step)

**Prerequisites**:
1. ✅ Upgrade Gemini CLI: `npm install -g @google/gemini-cli@latest`
2. ✅ Authenticate: `gemini login` (or set `GEMINI_API_KEY`)
3. ✅ Validate upgrade: `gemini --version` (should show 0.18.4+)
4. ✅ Test streaming: `gemini -p "test" --output-format stream-json`

**Create Test Fixtures**:
```bash
# Happy path
gemini -p "What is 2+2?" --output-format stream-json > gemini-cli-output.jsonl

# With tool usage (if applicable)
gemini -p "List files in current directory" --output-format stream-json --yolo > gemini-cli-tools.jsonl
```

**Parser Design** (mirrors ClaudeMessageParser):
```typescript
export class GeminiMessageParser implements IMessageParser {
  parse(line: string): AgentMessage | null {
    const event = JSON.parse(line);

    switch (event.type) {
      case 'init':
        return { type: 'system', role: 'init', content: event.content };
      case 'message':
        return { type: event.role, content: event.content };
      case 'tool_use':
        return { type: 'system', role: 'tool', content: JSON.stringify(event) };
      case 'tool_result':
        return null; // Skip or combine with tool_use
      case 'error':
        return { type: 'system', role: 'error', content: event.message };
      case 'result':
        return { type: 'system', role: 'result', stats: event.stats };
      default:
        return null; // Skip unknown events
    }
  }
}
```

### Phase 2: Adapter Implementation

**GeminiCLIAdapter Design** (mirrors ClaudePythonProxyAdapter):

```typescript
export class GeminiCLIAdapter implements IAgentRunner {
  constructor(
    private readonly processManager: IProcessManager,
    private readonly messageParser: GeminiMessageParser
  ) {}

  async start(session: Session): Promise<Agent> {
    const args = [
      '-p', session.prompt,
      '--output-format', 'stream-json',
      '--model', session.configuration.model || 'gemini-2.5-pro',
      '--yolo', // Auto-approve actions
    ];

    if (session.configuration.workingDirectory) {
      // Note: Gemini CLI may not support cwd directly
      // Workaround: Use --include-directories or cd in shell
    }

    const process = this.processManager.spawn('gemini', args);

    // Subscribe to stdout and parse JSONL
    process.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          const message = this.messageParser.parse(line);
          if (message) {
            this.emit('message', { agentId, message });
          }
        }
      });
    });

    return agent;
  }
}
```

### Architecture Integration

**Existing Domain Compatibility**: ✅ Excellent

The existing architecture is **100% compatible** with Gemini CLI:
- `AgentType.GEMINI_CLI` already defined
- `IAgentRunner` interface is adapter-agnostic
- `AgentFactoryAdapter` has placeholder for Gemini
- `Session` value object supports configuration passthrough

**Required Changes**:
1. Create `GeminiMessageParser` (new file)
2. Create `GeminiCLIAdapter` (new file)
3. Update `AgentFactoryAdapter` to inject Gemini adapter
4. Update `InfrastructureModule` DI configuration
5. Create test fixtures (3 files)
6. Write tests (TDD approach)

**Estimated Effort**: 4-6 hours (as documented in project specs)

---

## 9. Blockers & Risk Assessment

### Critical Blocker (Immediate)

❌ **Gemini CLI version 0.1.9 is non-functional**
- **Impact**: Cannot test CLI behavior, cannot create fixtures
- **Resolution**: Upgrade to 0.18.4
- **Effort**: 5 minutes
- **Risk**: Low (well-documented upgrade path)

### Medium Risks

⚠️ **Session continuity unclear**
- **Impact**: May not support multi-turn conversations like Claude
- **Mitigation**: Test after upgrade, implement workaround if needed
- **Risk**: Medium (may require architectural changes)

⚠️ **Working directory support unknown**
- **Impact**: `workingDirectory` configuration may not work
- **Mitigation**: Use `--include-directories` or shell `cd` workaround
- **Risk**: Low (workarounds available)

### Low Risks

✅ **Authentication** - Multiple methods supported, OAuth recommended for MVP
✅ **Streaming format** - JSONL is well-documented and similar to Claude
✅ **Architecture compatibility** - Domain already supports Gemini

---

## 10. Next Steps

### Immediate (Before Phase 1)

1. **Upgrade Gemini CLI**:
   ```bash
   npm uninstall -g @google/gemini-cli
   npm install -g @google/gemini-cli@latest
   gemini --version  # Verify 0.18.4+
   ```

2. **Authenticate**:
   ```bash
   gemini login  # OAuth (recommended)
   # OR
   export GEMINI_API_KEY="your-key"
   ```

3. **Test Basic Functionality**:
   ```bash
   gemini -p "What is 2+2?" --output-format stream-json
   ```

4. **Capture Real Output**:
   ```bash
   gemini -p "Explain TypeScript generics in 2 sentences" --output-format stream-json > /tmp/gemini-test.jsonl
   cat /tmp/gemini-test.jsonl
   ```

5. **Document Event Schema**:
   - Analyze captured output
   - Document exact field names and types
   - Compare with Claude CLI format

### Phase 1: Parser Implementation (4-6 hours)

**Red-Green-Refactor Cycle**:

1. **Test Fixtures** (30 minutes)
   - Create `gemini-cli-output.jsonl` (happy path)
   - Create `gemini-cli-error.jsonl` (error scenarios)
   - Validate fixtures match real CLI output

2. **Parser Tests** (1 hour)
   - `gemini-message-parser.spec.ts`
   - Test each event type (init, message, tool_use, tool_result, error, result)
   - Test edge cases (malformed JSON, unknown events)
   - Test null returns for skippable events

3. **Parser Implementation** (1 hour)
   - Implement `GeminiMessageParser`
   - Pass all tests
   - Refactor for clarity

4. **Adapter Tests** (1.5 hours)
   - `gemini-cli-adapter.spec.ts`
   - Test process spawning with correct args
   - Test stdout parsing
   - Test error handling
   - Test process cleanup

5. **Adapter Implementation** (1.5 hours)
   - Implement `GeminiCLIAdapter`
   - Pass all tests
   - Refactor for clarity

6. **Factory Integration** (30 minutes)
   - Update `AgentFactoryAdapter` to return Gemini adapter
   - Update `InfrastructureModule` DI config
   - Write integration tests

---

## 11. Comparison with Claude Integration

### Architecture Similarities

| Aspect | Claude Integration | Gemini Integration (Planned) |
|--------|-------------------|----------------------------|
| Adapter Pattern | `ClaudePythonProxyAdapter` | `GeminiCLIAdapter` |
| Parser | `ClaudeMessageParser` | `GeminiMessageParser` |
| Output Format | JSONL (stream-json) | JSONL (stream-json) |
| Process Management | Subprocess (Python proxy) | Subprocess (direct CLI) |
| Authentication | OAuth + Max subscription | OAuth or API key |
| Working Directory | ✅ Supported (via proxy) | ⚠️ To be tested |

### Key Advantages of Gemini CLI

✅ **Simpler Architecture**: Direct CLI execution (no Python proxy needed)
✅ **Richer Events**: Explicit tool_use/tool_result events
✅ **Multiple Output Formats**: JSON + JSONL (more flexibility)
✅ **Built-in YOLO Mode**: Auto-approve actions without custom implementation

### Key Challenges of Gemini CLI

❌ **Session Continuity**: May not support session IDs like Claude
❌ **Version Stability**: Recent breaking changes (current blocker)
⚠️ **Less Mature**: Claude integration is battle-tested in this codebase

---

## 12. References

### Official Documentation
- [Gemini CLI Headless Mode](https://geminicli.com/docs/cli/headless/)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Gemini CLI Commands Reference](https://google-gemini.github.io/gemini-cli/docs/cli/commands.html)

### Tutorials & Guides
- [Gemini CLI Tutorial Series (Medium)](https://medium.com/google-cloud/gemini-cli-tutorial-series-77da7d494718)
- [Gemini CLI Cheatsheet](https://www.philschmid.de/gemini-cli-cheatsheet)
- [Hands-on with Gemini CLI (Google Codelabs)](https://codelabs.developers.google.com/gemini-cli-hands-on)

### GitHub Issues (Known Problems)
- [Issue #11184: JSON output format issues](https://github.com/google-gemini/gemini-cli/issues/11184)
- [Issue #9009: Despite documentation, JSON output not supported](https://github.com/google-gemini/gemini-cli/issues/9009)
- [Issue #5021: Introduce structured JSON output](https://github.com/google-gemini/gemini-cli/issues/5021)

### API Documentation
- [Gemini API Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Firebase AI Logic - Structured Output](https://firebase.google.com/docs/ai-logic/generate-structured-output)

---

## 13. Decision: Proceed to Phase 1?

### ✅ GO / ❌ NO-GO Criteria

| Criteria | Status | Notes |
|----------|--------|-------|
| CLI Available | ✅ Installed | Requires upgrade to 0.18.4 |
| Output Format Documented | ✅ Clear | JSONL (stream-json) well-defined |
| Authentication Clear | ✅ Clear | OAuth or API key |
| Architecture Compatible | ✅ Compatible | Minimal changes needed |
| Test Strategy Defined | ✅ Defined | TDD approach, fixtures ready |
| Blockers Identified | ⚠️ One blocker | Version upgrade required |

### Recommendation

**⏸️ CONDITIONAL GO**

**Action Required**: Upgrade Gemini CLI to 0.18.4 before Phase 1.

Once upgraded:
1. ✅ Test basic streaming output
2. ✅ Capture real fixtures
3. ✅ Validate event schema
4. ✅ Proceed to Phase 1 (Parser Implementation)

**Estimated Timeline**:
- Upgrade + validation: 30 minutes
- Phase 1 (Parser): 4-6 hours
- **Total to working Gemini integration**: ~5-6 hours

**Risk Level**: **Low** (after upgrade)

---

## Appendix A: Example Commands (After Upgrade)

```bash
# Test basic output
gemini -p "What is 2+2?" --output-format stream-json

# Test with model selection
gemini -p "Explain async/await" --output-format stream-json -m gemini-2.5-flash

# Test with auto-approve
gemini -p "Create hello.txt with 'Hello World'" --output-format stream-json --yolo

# Test with context
gemini -p "Summarize this file" --output-format stream-json --include-directories src

# Capture output for fixtures
gemini -p "Count to 5" --output-format stream-json > backend/test/fixtures/gemini-cli-output.jsonl

# Test JSON (non-streaming)
gemini -p "What is TypeScript?" --output-format json
```

---

**Report Status**: COMPLETE
**Next Phase**: Upgrade CLI → Validate → Phase 1 (Parser Implementation)
**Approval Required**: Yes (for Gemini CLI upgrade)
