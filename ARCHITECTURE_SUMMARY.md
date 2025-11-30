# Token Streaming Architecture - Quick Reference

## The 7-Layer Stack

```
┌─────────────────────────────────────────┐
│ Layer 1: Python Proxy (External)        │
│ Spawns Claude CLI, streams via SSE      │
└────────────────────┬────────────────────┘
                     │ SSE JSONL events
                     ▼
┌─────────────────────────────────────────┐
│ Layer 2: Infrastructure Adapter         │
│ Parses SSE → AgentMessage               │
│ Filters skippable events                │
└────────────────────┬────────────────────┘
                     │ AgentMessage objects
                     ▼
┌─────────────────────────────────────────┐
│ Layer 3: Application Services           │
│ Coordinates persistence + broadcasting  │
│ "Save-first, emit-second" pattern       │
└────────────────────┬────────────────────┘
                     │ Saved messages + WebSocket events
                     ▼
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────────┐   ┌──────────────────┐
│ Layer 4: Database   │   │ Layer 5: WebSocket│
│ Persists messages   │   │ Broadcasts events │
│ UUID + sequence     │   │ Room-based subs   │
└────────────┬────────┘   └────────┬─────────┘
             │                     │
             └──────────┬──────────┘
                        │
                        ▼
┌─────────────────────────────────────────┐
│ Layer 6: Frontend Hook                  │
│ useAgentMessages()                      │
│ • Loads history via REST                │
│ • Listens to WebSocket                  │
│ • Detects gaps, fills them              │
│ • Deduplicates by ID                    │
└────────────────────┬────────────────────┘
                     │ AgentMessage[] state
                     ▼
┌─────────────────────────────────────────┐
│ Layer 7: Frontend UI                    │
│ Renders messages with auto-scroll       │
│ Shows raw JSON on hover                 │
└─────────────────────────────────────────┘
```

---

## Critical Design Patterns

### Pattern 1: Save-First, Emit-Second
```
Message arrives → SAVE to DB (FK constraint) → 
  → Return saved object with IDs → 
  → THEN emit via WebSocket
```
**Why**: Database becomes single source of truth, WebSocket becomes notification.

### Pattern 2: UUID + Sequence Number Deduplication
```
UUID              → Handles network retries (uniqueness)
Sequence Number   → Handles ordering (gap detection)
Together          → Idempotency without consensus
```

### Pattern 3: Parser Returns Null for Skippable Events
```
message_start → Parser: null → Adapter: continue (silent skip)
content_block_delta → Parser: AgentMessage → Adapter: emit
content_block_stop → Parser: null → Adapter: continue
```
**Why**: Cleaner control flow, no log pollution.

### Pattern 4: Gap Detection & Filling
```
Receive message seq=5, lastSeq=3
→ Gap detected (5 ≠ 3+1)
→ API call: GET /agents/:id/messages?since=3
→ Merge results, deduplicate, re-sort
→ Continue streaming
```

---

## Message Lifecycle

```
STREAMING PHASE (each token):
  Python: "Hello" token → SSE
  Backend: Parse → Service.broadcastMessage
  DB: INSERT (id=uuid, seq=1)
  WebSocket: emit agent:message
  Frontend: Receive, add to state

COMPLETION PHASE:
  Python: event:complete
  Backend: StreamingService.broadcastComplete
  WebSocket: emit agent:complete
  Frontend: Show completion message

RECONNECT PHASE:
  Frontend: Load history via REST API
  API: SELECT * FROM messages WHERE agent_id = ? ORDER BY seq ASC
  Hook: Track messageIdsRef, lastSequenceRef
  WebSocket: Listen for new messages
```

---

## Key Files

| File | Responsibility |
|------|-----------------|
| `claude-python-proxy.adapter.ts` | Fetch SSE, emit to observers |
| `claude-message.parser.ts` | Parse JSONL → AgentMessage |
| `streaming.service.ts` | Coordinate persistence + broadcast |
| `agent-message.service.ts` | Save/retrieve messages with IDs |
| `agent.controller.ts` | REST endpoints (messages + lifecycle) |
| `agent.gateway.ts` | WebSocket events + subscriptions |
| `useAgentMessages.ts` | Load history, detect gaps, dedup |
| `AgentOutput.tsx` | Render messages with formatting |
| `schema.sql` | Messages table with constraints |

---

## Database Structure

```sql
agent_messages {
  id: UUID v4                           -- Deduplication
  agent_id: FK                          -- Referential integrity
  sequence_number: UNIQUE per agent     -- Ordering + gap detection
  type: 'assistant' | 'user' | ...      -- Message classification
  content: string | JSON                -- Message body
  raw: JSON (nullable)                  -- Original format
  metadata: JSON                        -- {eventType, usage, ...}
  created_at: ISO 8601                  -- Timestamp
}

Indexes:
  (agent_id) - fast agent-specific queries
  (agent_id, sequence_number) - gap filling queries
```

---

## Event Types Throughout Pipeline

| Source | Event | Action | Persist |
|--------|-------|--------|---------|
| Claude | `message_start` | Skip | No |
| Claude | `content_block_delta` | Parse + emit | Yes |
| Claude | `message_delta` | Parse + emit | Yes (metadata) |
| Claude | `message_stop` | Skip | No |
| Backend | `agent:message` | WebSocket emit | N/A |
| Backend | `agent:complete` | WebSocket emit | N/A |
| Frontend | `agent:message` (event) | Hook handler | N/A |

---

## Error Handling

```
FK Constraint Failure
  → Agent doesn't exist in DB
  → Message save fails
  → Error propagated to caller
  → agent:error event emitted
  → Frontend shows error

WebSocket Unavailable
  → Broadcast fails
  → Error logged
  → Agent continues (doesn't crash)
  → Error emitted as agent:error
  → User can still reconnect and fetch history

Network Interruption
  → WebSocket disconnects
  → Frontend reconnects
  → Loads messages via REST
  → Gap detection kicks in
  → Missing messages fetched and merged
```

---

## Performance

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Save message | O(1) amortized | Atomic subquery for sequence |
| Get all messages | O(n) | n = messages per agent |
| Get messages since | O(m) | m = messages after sequence N |
| Gap detection | O(1) | Simple sequence comparison |
| Gap filling | O(m) + merge | Single HTTP roundtrip |

---

## Testing Strategy

```
Unit Tests (80% of tests)
  ✓ Parser: Skippable events → null, deltas → AgentMessage
  ✓ Service: Save-before-emit ordering
  ✓ Hook: Deduplication by ID, gap detection

Integration Tests (15% of tests)
  ✓ Adapter → Service → DB → Gateway chain
  ✓ FK constraint enforcement
  ✓ Sequence number atomicity

E2E Tests (5% of tests)
  ✓ Full streaming flow: Python → Backend → Frontend
  ✓ Network interruption + reconnect
  ✓ Real-time message display
```

---

## Extending to Other Agents

### For Gemini CLI or other services:

1. **Create GeminiAdapter** (mirrors ClaudePythonProxyAdapter)
   - Connect to Gemini service
   - Fetch stream (method depends on service)
   - Parse to AgentMessage format

2. **Create GeminiMessageParser** (mirrors ClaudeMessageParser)
   - Implement event type mapping
   - Return null for skippable events
   - Preserve original format in `raw` field

3. **Update AgentFactory**
   ```typescript
   create(type: AgentType): IAgentRunner {
     if (type === 'claude-code') return new ClaudePythonProxyAdapter(...);
     if (type === 'gemini-cli') return new GeminiAdapter(...);
     throw new Error(`Unknown agent type: ${type}`);
   }
   ```

4. **Rest of system works unchanged**
   - StreamingService handles all agents uniformly
   - Database stores all message types
   - Frontend doesn't care about agent type
   - Hook works with any agent

---

## Key Insights

1. **Database as single source of truth** ensures no data loss and enables reconnection
2. **UUID + sequence number** together provide both uniqueness and ordering
3. **Parser returns null** for cleaner adapter code (skip silently)
4. **REST + WebSocket** hybrid: REST for bulk/history, WebSocket for real-time
5. **Gap detection** makes the system resilient to network issues
6. **Service layer** isolates persistence from broadcasting concerns
7. **Architecture is reusable** for any streaming AI service

---

## When This Pattern Shines

✓ Multiple concurrent agents (each with their own stream)
✓ Unreliable networks (gap detection + filling)
✓ User reconnections (full history available)
✓ Cross-browser sync (WebSocket room broadcasts to all)
✓ Offline-first requirements (REST API fallback)
✓ Real-time + persistent requirements (hybrid approach)

---

## Production Checklist

- [x] FK constraints enabled in SQLite
- [x] Sequence number uniqueness constraint
- [x] Indexes on agent_id and (agent_id, sequence_number)
- [x] Error handling doesn't crash system
- [x] WebSocket rooms for message isolation
- [x] UUID v4 for cross-system uniqueness
- [x] DELETE journal mode for data safety
- [x] All tests passing (343+ tests, 80.3% coverage)

