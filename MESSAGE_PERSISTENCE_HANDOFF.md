# Message Persistence Investigation - Agent Handoff

## Executive Summary

We fixed **5 critical bugs** in the agent list/status persistence system using TDD methodology, but discovered a **6th bug** with message persistence that requires deeper investigation. All agent status bugs are now fixed, but message history doesn't display in the frontend because messages don't persist to the database despite successful INSERTs.

## Context: What Was Fixed ✅

### 1. Agent Status Not Persisting (FIXED)
**Symptoms:** Agents stuck in "initializing" status, never showed as "running"
**Root Cause:** Status change `INITIALIZING → RUNNING` not saved to database
**Fix:** Added `await this.agentRepository.save(agent)` after `agent.markAsRunning()`
**File:** `backend/src/application/services/agent-orchestration.service.ts:107`

### 2. Completion Status Not Persisting (FIXED)
**Symptoms:** Agents completed but reverted to "running" after page refresh
**Root Cause:** No subscription to agents for status persistence
**Fix:** Auto-subscribe via StreamingService on launch, persist completion/failure to DB
**Files:**
- `backend/src/application/services/agent-orchestration.service.ts:116`
- `backend/src/application/services/streaming.service.ts:261-292` (broadcastComplete)
- `backend/src/application/services/streaming.service.ts:245-279` (broadcastError)

### 3. Frontend Sorting (FIXED)
**Symptoms:** Completed agents appeared at bottom instead of top
**Root Cause:** Redux state maintained insertion order, not sorted by createdAt
**Fix:** Sort by `createdAt DESC` before filtering
**File:** `frontend/src/components/Sidebar.tsx:18-22`

### 4. Parser Errors (FIXED)
**Symptoms:** All messages threw "Skipping stream event" errors
**Root Cause:** Claude CLI now uses `stream_event` wrapper format
**Fix:** Return `null` for skippable events instead of throwing, handle null in adapter
**Files:**
- `backend/src/infrastructure/parsers/claude-message.parser.ts:28` (return type)
- `backend/src/infrastructure/parsers/claude-message.parser.ts:45` (return null)
- `backend/src/infrastructure/adapters/claude-python-proxy.adapter.ts:294-297` (null check)

### 5. Multiple DatabaseService Instances (FIXED)
**Symptoms:** INSERTs succeeded on one connection, queries on another returned 0
**Root Cause:** `InMemoryAgentRepository` and `SqliteAgentRepository` registered as standalone providers
**Fix:** Removed standalone registrations (only create via factory)
**File:** `backend/src/infrastructure/infrastructure.module.ts:135-138`

## Remaining Issue: Message Persistence Paradox ⚠️

### Symptoms

1. **API returns messages:** `GET /api/agents/{id}/messages` returns 3-5 messages
2. **Database has zero:** All queries (backend's own connection, external, with WAL checkpoint) return 0
3. **INSERTs succeed:** Logs show `INSERT result: { changes: 1, lastInsertRowid: N }`
4. **Immediate SELECT works:** SELECT right after INSERT returns data
5. **Later queries fail:** Subsequent queries (even from same connection) return 0
6. **Integration tests PASS:** All 8 message-persistence tests pass with real database

### Evidence

```bash
# Logs show successful INSERTs
[DEBUG] INSERT result: { changes: 1, lastInsertRowid: 1, inTransactionAfter: false }
[DEBUG] INSERT result: { changes: 1, lastInsertRowid: 2, inTransactionAfter: false }
[DEBUG] INSERT result: { changes: 1, lastInsertRowid: 3, inTransactionAfter: false }

# But database queries return 0
$ curl http://localhost:3000/api/test/debug-messages
{"totalCount":0,"inTransaction":false,"messages":[],"walCheckpoint":"FULL"}

$ node -e "const db = require('better-sqlite3')('data/agents.db'); db.pragma('wal_checkpoint(FULL)'); console.log(db.prepare('SELECT COUNT(*) FROM agent_messages').get());"
{ c: 0 }

# Yet API endpoint returns messages!
$ curl http://localhost:3000/api/agents/d3c9725b-4280-4e80-ad1d-a61c2c91ca63/messages
[3 messages returned]
```

### Current State

- **Single DatabaseService instance:** ✓ Confirmed (logs show only one `#instanceId`)
- **No transactions:** ✓ `inTransactionAfter: false`
- **WAL checkpoint:** ✓ Called via `pragma('wal_checkpoint(FULL)')`
- **Integration tests:** ✓ All pass (messages persist in test environment)

### Theories

**Theory 1: Data in WAL Never Flushed**
- INSERTs write to WAL file (302KB size confirms data)
- Something prevents WAL from checkpointing to main file
- Queries always read from main file (which has 0 rows)
- **Evidence:** WAL file is 302KB but main file only 56KB

**Theory 2: API Caching Messages in Memory**
- Messages might be cached in Redux/state and served from there
- Database writes fail silently but API serves from memory
- **Contra-evidence:** API endpoint uses `messageService.findByAgentId()` which queries DB

**Theory 3: better-sqlite3 + NestJS Incompatibility**
- Some interaction between NestJS lifecycle and better-sqlite3
- Works in tests (synchronous, clean lifecycle) but not in production
- **Evidence:** Tests pass 100%, production has paradox

## Files Changed (10 total)

**Backend** (9 files):
1. `src/application/services/agent-orchestration.service.ts` - Status persistence + auto-subscribe
2. `src/application/services/streaming.service.ts` - Persist completion/failure + repository injection
3. `src/application/services/agent-message.service.ts` - Enhanced debug logging
4. `src/infrastructure/parsers/claude-message.parser.ts` - Handle stream_event format
5. `src/infrastructure/adapters/claude-python-proxy.adapter.ts` - Handle null from parser
6. `src/infrastructure/infrastructure.module.ts` - Fix DatabaseService singleton
7. `src/infrastructure/database/database.service.ts` - Debug logging
8. `src/presentation/controllers/test.controller.ts` - Debug endpoint
9. `test/integration/agent-status-persistence.spec.ts` - NEW comprehensive tests
10. `test/integration/message-persistence.spec.ts` - NEW message persistence tests

**Frontend** (1 file):
11. `src/components/Sidebar.tsx` - Sort by createdAt

## Test Status

✅ **Backend Unit Tests:** 18/18 passing
✅ **Agent Status Integration:** 5/5 passing
✅ **Message Persistence Integration:** 8/8 passing
✅ **Overall Backend Tests:** ~380+ tests passing

## How to Reproduce

```bash
# 1. Clean restart (kills all zombie processes)
cd backend
../scripts/clean-restart.sh

# 2. Launch agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"type":"claude-code","prompt":"What is 2+2? Just the number."}'
# Save the agentId from response

# 3. Wait 60s for completion
sleep 60

# 4. Check messages via API (will return 3-5 messages)
curl "http://localhost:3000/api/agents/{AGENT_ID}/messages"

# 5. Check database (will return 0)
curl -X GET http://localhost:3000/api/test/debug-messages

# 6. Check logs (will show successful INSERTs)
tail -100 /tmp/backend.log | grep "INSERT result"
```

## Cleanup Script

Created: `scripts/clean-restart.sh`

**Usage:**
```bash
./scripts/clean-restart.sh              # Full restart
./scripts/clean-restart.sh --backend-only   # Backend only
./scripts/clean-restart.sh --proxy-only     # Proxy only
./scripts/clean-restart.sh --kill-only      # Just kill processes
```

**Benefits:**
- Kills all zombie ts-node-dev processes
- Clears database
- Starts services with health checks
- Provides clear status output

## Next Steps for Investigation

### Option 1: Disable WAL Mode (Quick Test)
```typescript
// In database.service.ts:67
this.db.pragma('journal_mode = DELETE'); // Instead of WAL
```

### Option 2: Force Synchronous Writes
```typescript
// In database.service.ts after connection
this.db.pragma('synchronous = FULL');
```

### Option 3: Add Explicit Commit
```typescript
// In agent-message.service.ts after INSERT
db.prepare('COMMIT').run();  // Force commit if in implicit transaction
```

### Option 4: Test Frontend Anyway
The API IS returning messages (from somewhere). Test if the frontend actually works - the real user experience might be fine even if database persistence is broken.

## Key Questions for Next Agent

1. **Where do API messages come from?** If DB has 0 but API returns 3, they're cached somewhere
2. **Why do integration tests pass?** Same code, real DB, messages persist - what's different?
3. **Is this a WAL bug?** 302KB WAL file but queries return 0 suggests data stuck in WAL
4. **Should we add process management?** Multiple backend instances suggest need for PID file / health check

## Files to Investigate

- `backend/src/application/dto/agent-message.dto.ts` - Check if caching here
- `backend/src/application/services/agent-message.service.ts:109-132` - findByAgentId implementation
- Check if there's a messages cache in Redux or application layer
- Review better-sqlite3 documentation for WAL edge cases

## Decision Needed: Built-in Process Management?

**Should we add to the application:**
- PID file management (`data/backend.pid`)
- Health check endpoint that verifies single instance
- Startup check that kills stale processes
- Warning if multiple instances detected

This would prevent the "zombie process" issue that complicated debugging.

---

**TL;DR for new agent:**
- Agent list bugs: FIXED ✅
- Message persistence: Messages save but vanish from DB, yet API returns them (paradox) ⚠️
- Use `scripts/clean-restart.sh` to ensure clean environment
- All integration tests pass (8/8) but production has mysterious behavior
- Need to find where API is getting messages from if not the database
