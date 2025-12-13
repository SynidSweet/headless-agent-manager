# Real Claude E2E Tests - Quick Start

## 🎯 What This Is

Comprehensive E2E test suite that validates **REAL Claude Code CLI integration** with the full stack using reactive, event-driven testing.

## 📁 Files

- **Tests**: `frontend/e2e/fullstack/real-claude-integration.spec.ts` (678 lines, 8 tests)
- **Docs**: `frontend/e2e/fullstack/REAL_CLAUDE_TESTS_README.md` (complete guide)

## 🚀 Quick Run

```bash
# 1. Start Python proxy
cd claude-proxy-service && source venv/bin/activate && uvicorn app.main:app --reload

# 2. Start backend (in new terminal)
cd backend && npm run dev

# 3. Start frontend (in new terminal)
cd frontend && npm run dev

# 4. Run tests (in new terminal)
cd frontend && npm run test:e2e -- real-claude-integration.spec.ts
```

## ✅ Expected Results

```
✅ 8 passed (2-5 minutes)

• Real Claude agent executes command and sends message
• Real Claude agent can be terminated mid-execution
• Multiple real Claude agents run concurrently without interference
• Real Claude messages persist to database
• UI updates in real-time from real Claude agent
• Real Claude agent handles errors gracefully
• Real Claude agent handles longer task with streaming
• diagnostic: capture all events and logs from real agent
```

## 🎯 What This Proves

✅ **CLI → Proxy → Backend → WebSocket → Frontend → UI** (full stack works)
✅ **Event-Driven Architecture** (WebSocket events flow correctly)
✅ **Message Persistence** (database is single source of truth)
✅ **UI Reactivity** (real-time updates work)
✅ **No Cross-Contamination** (concurrent agents are isolated)
✅ **Error Handling** (system remains stable after failures)

## 📚 Full Documentation

See `frontend/e2e/fullstack/REAL_CLAUDE_TESTS_README.md` for:
- Detailed test descriptions
- Test strategy explanations
- Troubleshooting guide
- CI/CD integration
- Contributing guidelines

## 💰 Cost

**$0** - Uses Claude Max subscription via Python proxy (no API charges)

## ⏱️ Duration

**2-5 minutes** for all 8 tests (acceptable for comprehensive real integration testing)

## 🔑 Key Features

- **Reactive Waiting**: Event-driven (not hardcoded timeouts)
- **Deterministic Prompts**: Simple bash commands with unique markers
- **Agent ID Filtering**: Prevents cross-test contamination
- **Comprehensive Logging**: Detailed console output for debugging
- **Automatic Cleanup**: TestContext tracks agents even if test fails
- **Visual Verification**: Screenshots saved for manual inspection

## 🔍 Run Specific Test

```bash
# Basic execution
npm run test:e2e -- real-claude-integration.spec.ts -g "executes command"

# Termination
npm run test:e2e -- real-claude-integration.spec.ts -g "terminated"

# Multi-agent
npm run test:e2e -- real-claude-integration.spec.ts -g "Multiple"

# UI updates
npm run test:e2e -- real-claude-integration.spec.ts -g "UI updates"

# Diagnostic
npm run test:e2e -- real-claude-integration.spec.ts -g "diagnostic"
```

## 🐛 Troubleshooting

**Tests skip with "Requires Python proxy"**
- Python proxy not running → Start: `cd claude-proxy-service && uvicorn app.main:app --reload`

**Tests timeout waiting for messages**
- Claude not authenticated → Run: `claude auth login`

**WebSocket connection issues**
- Check backend .env: `CLAUDE_ADAPTER=python-proxy`
- Restart backend: `cd backend && npm run dev`

## 📊 Test Architecture

```
Real Claude CLI
      ↓
Python Proxy (port 8000)
      ↓
Backend NestJS (port 3000)
      ↓
WebSocket Events
      ↓
Frontend Redux Store
      ↓
React UI Components
      ↓
Browser DOM (Playwright)
```

## 🎓 Test Strategy

### Reactive Waiting (NOT Hardcoded Timeouts)

```typescript
// ✅ GOOD: Reactive waiting
await waitForWebSocketEvent(page, 'agent:message', {
  agentId,
  predicate: (data) => data.content?.includes('MARKER'),
  timeout: 90000,
});

// ❌ BAD: Hardcoded timeout
await page.waitForTimeout(30000);
```

### Deterministic Prompts

```typescript
// ✅ GOOD: Deterministic
prompt: 'Execute: echo "E2E_TEST_MARKER_12345"'

// ❌ BAD: Unpredictable
prompt: 'Write a Python script to analyze data'
```

### Agent ID Filtering

```typescript
// ✅ Prevents cross-contamination
await waitForWebSocketEvent(page, 'agent:message', {
  agentId: 'specific-id', // Only this agent's events
});
```

## 🔗 Related Tests

| Test File | Type | Count | Speed | What It Tests |
|-----------|------|-------|-------|---------------|
| `frontend/test/**/*.test.tsx` | Unit | 63 | Fast | Component logic |
| `synthetic-agents.spec.ts` | E2E | 5 | Fast | Synthetic agents |
| `real-agent-flow.spec.ts` | E2E | 6 | Slow | UI flows |
| **`real-claude-integration.spec.ts`** | **E2E** | **8** | **Slow** | **Full stack** |

## 📖 Next Steps

1. **Run tests**: Follow quick start above
2. **Read full docs**: `frontend/e2e/fullstack/REAL_CLAUDE_TESTS_README.md`
3. **Add to CI/CD**: See README for CI integration instructions
4. **Contribute**: Follow contributing guidelines in README

---

**Created**: 2025-12-05
**Status**: ✅ Complete and ready for use
**Deliverable**: Working E2E test suite validating real Claude Code integration
