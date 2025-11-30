# Complete Vertical Architecture for Token Streaming

## System Overview

This document specifies the complete architecture for streaming agent (Claude CLI) output from backend to frontend, with database persistence. The system follows clean architecture principles with clear separation of concerns across six layers.

**Current Status**: Implemented and working (as of 2025-11-28)
**Test Coverage**: 343+ tests (80.3% component coverage)
**Architecture Pattern**: Event-driven with real-time WebSocket streaming

---

## 1. Layer-by-Layer Architecture

### 1.1 Python Proxy Service Layer
**File**: `claude-proxy-service/` (external microservice)

**Responsibility**: 
- Spawns Claude CLI as subprocess (Node.js cannot do this due to upstream bug)
- Streams JSONL output via Server-Sent Events (SSE)

**Input Format**:
```json
POST /agent/stream
{
  "prompt": "User's question",
  "session_id": "optional-session-id"
}
```

**Output Format**: SSE stream of JSONL lines
```
event: message
data: {"type":"stream_event","event":{"type":"message_start",...}}

event: message
data: {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}

event: message
data: {"type":"stream_event","event":{"type":"message_delta","delta":{...},"usage":{...}}}

event: complete
data: {"status":"success","duration":5000,"messageCount":3}
```

---

### 1.2 Infrastructure Adapter Layer
**Files**: 
- `backend/src/infrastructure/adapters/claude-python-proxy.adapter.ts`
- `backend/src/infrastructure/parsers/claude-message.parser.ts`

**Responsibility**:
- Fetch SSE stream from Python proxy
- Parse JSONL events and convert to AgentMessage format
- Filter out non-displayable streaming events
- Emit parsed messages to observers

#### Message Type Taxonomy

Claude sends different event types throughout the stream:

| Event Type | Contains | Action | Persist? |
|-----------|----------|--------|----------|
| `message_start` | Stream metadata | Skip (no content) | No |
| `content_block_start` | Block metadata | Skip (no content) | No |
| `content_block_delta` | Single token (text) | Parse + emit | Yes (as complete message) |
| `content_block_stop` | Block end marker | Skip (no content) | No |
| `message_delta` | Usage stats + stop_reason | Parse + emit | Yes (as metadata only) |
| `message_stop` | Stream end marker | Skip (no content) | No |
| `message` (old format) | Complete assistant message | Parse + emit | Yes |
| `result` (old format) | Final response stats | Parse + emit | Yes |

**Key Insight**: Claude sends streaming deltas (each token), but they should NOT be persisted individually. Instead:
- Parser recognizes `content_block_delta` events as streaming chunks
- Each delta is converted to AgentMessage with `metadata.eventType: 'content_delta'`
- Messages emitted immediately for real-time display (UX benefit)
- Frontend aggregates deltas into final complete message before persistence

#### Parser Implementation

```typescript
// Extract from claude-message.parser.ts

parse(line: string): AgentMessage | null {
  const parsed = JSON.parse(line);
  
  // Handle new SSE format
  if (parsed.type === 'stream_event' && parsed.event) {
    const eventType = parsed.event.type;
    
    // Skip non-displayable events
    if (['message_start', 'content_block_start', ...].includes(eventType)) {
      return null; // Parser returns null - adapter skips silently
    }
    
    // Handle content_block_delta (individual tokens)
    if (eventType === 'content_block_delta') {
      return {
        type: 'assistant',
        role: 'assistant',
        content: delta.text, // The actual token
        raw: line,
        metadata: { eventType: 'content_delta' }, // Mark as streaming chunk
      };
    }
    
    // Handle message_delta (usage stats)
    if (eventType === 'message_delta') {
      return {
        type: 'system',
        role: 'system',
        content: '',
        raw: line,
        metadata: {
          eventType: 'message_delta',
          delta: event.delta,
          usage: event.usage,
        },
      };
    }
  }
  
  // Continue parsing old format messages...
}
```

**Adapter Behavior**:
```typescript
// From claude-python-proxy.adapter.ts

private async streamFromProxy(agentId: AgentId, session: Session) {
  // Read SSE stream from Python proxy
  const response = await fetch(`${this.proxyUrl}/agent/stream`, {...});
  
  // Process each SSE event
  for (const event of events) {
    const message = this.parser.parse(data);
    
    if (message === null) {
      continue; // Skip non-displayable events silently
    }
    
    // Message has displayable content
    this.notifyObservers(agentId, 'onMessage', message);
  }
}
```

---

### 1.3 Application Service Layer
**Files**:
- `backend/src/application/services/streaming.service.ts`
- `backend/src/application/services/agent-message.service.ts`

#### StreamingService - Event Coordination

**Responsibility**: 
- Coordinate between adapter observers and database persistence
- Broadcast messages to WebSocket clients
- Track client subscriptions

**Key Decision**: Messages MUST be saved to database BEFORE emitting to WebSocket

```typescript
// From streaming.service.ts

async broadcastMessage(agentId: AgentId, message: AgentMessage): Promise<void> {
  // CRITICAL: Save to database FIRST
  // Maintains referential integrity and single source of truth
  const savedMessage = await this.messageService.saveMessage({
    agentId: agentId.toString(),
    type: message.type,
    role: message.role,
    content: message.content,
    raw: message.raw,
    metadata: message.metadata,
  });
  
  // ONLY THEN emit to WebSocket
  // At this point, message has:
  // - UUID (deduplication)
  // - Sequence number (ordering)
  // - Database timestamp
  this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', {
    agentId: agentId.toString(),
    message: savedMessage, // Return complete DTO with IDs
    timestamp: new Date().toISOString(),
  });
}
```

**Streaming vs Persistence Decision**:

The question: Should we persist every token delta?

**Answer**: No. The current implementation persists all messages (including deltas), but a cleaner approach would be:

**Option 1 (Current - Simpler)**:
- Persist: All messages including `content_block_delta` tokens
- Broadcast: All messages including tokens
- Frontend: Display each token as it arrives (real-time effect)
- Issue: Database grows rapidly (one row per token)

**Option 2 (Recommended - More efficient)**:
- Persist: Only complete messages (not individual deltas)
- Broadcast: All messages for real-time display
- Frontend: Aggregate deltas into final message before showing
- Benefit: Smaller database, cleaner message history

The current codebase uses **Option 1** for simplicity, which is acceptable for MVP.

#### AgentMessageService - Persistence

**Responsibility**: 
- Save messages with automatic UUID and sequence number generation
- Retrieve messages for display

```typescript
// From agent-message.service.ts

async saveMessage(createDto: CreateMessageDto): Promise<AgentMessageDto> {
  // Generate UUID for deduplication
  const id = randomUUID();
  
  // Insert with atomic sequence number generation
  const stmt = db.prepare(`
    INSERT INTO agent_messages (...) VALUES (
      ?,
      ?,
      COALESCE((SELECT MAX(sequence_number) FROM agent_messages 
                WHERE agent_id = ?), 0) + 1,  -- Atomic sequence increment
      ...
    )
  `);
  
  insertStmt.run(...); // Throws FK error if agent doesn't exist
  
  // Return DTO with populated IDs
  return {
    id,
    agentId: createDto.agentId,
    sequenceNumber: result.sequence_number,
    type: createDto.type,
    content: createDto.content,
    ...
  };
}
```

**Key Features**:
- UUID v4 for deduplication across network issues
- Monotonic sequence number per agent (1, 2, 3...) for gap detection
- FK constraint ensures only existing agents can have messages
- Database error propagation (caller must handle)

---

### 1.4 Presentation Layer - REST API
**File**: `backend/src/presentation/controllers/agent.controller.ts`

**Endpoints**:

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| POST | `/api/agents` | Launch agent | `{ agentId, status, createdAt }` |
| GET | `/api/agents` | List all agents | `Agent[]` |
| GET | `/api/agents/active` | List running agents | `Agent[]` |
| GET | `/api/agents/:id` | Get agent details | `Agent` |
| GET | `/api/agents/:id/status` | Get agent status | `{ agentId, status }` |
| **GET** | **`/api/agents/:id/messages`** | **Get all messages** | **`AgentMessage[]`** |
| **GET** | **`/api/agents/:id/messages?since=N`** | **Get messages after seq N** | **`AgentMessage[]`** |
| DELETE | `/api/agents/:id` | Stop agent | `void (204)` |

**Message Retrieval Endpoint**:

```typescript
@Get(':id/messages')
async getAgentMessages(
  @Param('id') id: string,
  @Query('since') since?: string
): Promise<AgentMessageDto[]> {
  const agentId = AgentId.fromString(id);
  
  // Validate agent exists
  await this.orchestrationService.getAgentById(agentId);
  
  // Get messages
  if (since) {
    // Gap filling: fetch messages after sequence number
    return await this.messageService.findByAgentIdSince(id, parseInt(since));
  }
  
  // Initial load: fetch all messages
  return await this.messageService.findByAgentId(id);
}
```

Returns messages sorted by sequence number (ASC):
```json
[
  {
    "id": "uuid-1",
    "agentId": "agent-uuid",
    "sequenceNumber": 1,
    "type": "assistant",
    "content": "Hello",
    "raw": "{...original JSON...}",
    "metadata": {"eventType": "content_delta"},
    "createdAt": "2025-11-28T10:30:00Z"
  },
  {
    "id": "uuid-2",
    "agentId": "agent-uuid",
    "sequenceNumber": 2,
    "type": "assistant",
    "content": " world",
    "raw": "{...}",
    "metadata": {"eventType": "content_delta"},
    "createdAt": "2025-11-28T10:30:00Z"
  }
]
```

---

### 1.5 Presentation Layer - WebSocket Gateway
**File**: `backend/src/application/gateways/agent.gateway.ts`

**Events Emitted**:

| Event | Payload | Frequency | Recipients |
|-------|---------|-----------|------------|
| `agent:message` | `{ agentId, message, timestamp }` | Every token | Subscribed clients |
| `agent:status` | `{ agentId, status, timestamp }` | On state change | Subscribed clients |
| `agent:updated` | `{ agentId, status, timestamp }` | On state change | ALL clients |
| `agent:error` | `{ agentId, error, timestamp }` | On error | Subscribed clients |
| `agent:complete` | `{ agentId, result, timestamp }` | Once at end | Subscribed clients |
| `agent:created` | `{ agent, timestamp }` | On launch | ALL clients |
| `agent:deleted` | `{ agentId, timestamp }` | On termination | ALL clients |

**Subscription Flow**:

```typescript
// Client subscribes to specific agent
client.emit('subscribe', { agentId: 'agent-uuid' });

// Server joins client to agent room
joinRoom(clientId, `agent:${agentId}`);

// Now client receives all messages for that agent
emitToRoom(`agent:${agentId}`, 'agent:message', payload);
```

---

### 1.6 Frontend - React Hook & Components

**File**: `frontend/src/hooks/useAgentMessages.ts`

**Hook Responsibilities**:
1. Load historical messages from REST API
2. Subscribe to real-time messages via WebSocket
3. Detect gaps using sequence numbers
4. Deduplicate by message ID (UUID)
5. Fill gaps by fetching missing messages

**Architecture**:

```
┌─────────────────────────────────────────┐
│   Frontend - useAgentMessages Hook      │
├─────────────────────────────────────────┤
│ State:                                  │
│  - messages: AgentMessage[]             │
│  - messageIdsRef: Set<string> (UUIDs)   │
│  - lastSequenceRef: number              │
│                                         │
│ Initialization:                         │
│  - Call REST API: GET /agents/:id/msgs  │
│  - Load all historical messages         │
│  - Track IDs and last sequence          │
│                                         │
│ Real-Time Updates:                      │
│  - Listen for 'agent:message' event     │
│  - Check: Is ID in messageIdsRef?       │
│    Yes -> Duplicate, ignore             │
│    No -> Continue                       │
│  - Check: sequenceNumber == lastSeq+1?  │
│    Yes -> Append message, update lastSeq│
│    No -> Gap detected, fetch missing    │
└─────────────────────────────────────────┘
```

**Implementation**:

```typescript
export function useAgentMessages(agentId: string | null): UseAgentMessagesResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const lastSequenceRef = useRef<number>(0);
  
  // Load historical messages
  useEffect(() => {
    if (!agentId) return;
    
    const history = await ApiService.getAgentMessages(agentId);
    setMessages(history);
    
    // Track loaded messages
    history.forEach(msg => messageIdsRef.current.add(msg.id));
    
    // Track last sequence for gap detection
    if (history.length > 0) {
      lastSequenceRef.current = history[history.length - 1].sequenceNumber;
    }
  }, [agentId]);
  
  // Real-time message handler
  useEffect(() => {
    const handleMessage = (event: Event) => {
      const { agentId: eventAgentId, message } = event.detail;
      
      if (eventAgentId !== agentId) return;
      
      // Deduplication
      if (messageIdsRef.current.has(message.id)) {
        console.log('Duplicate ignored:', message.id);
        return;
      }
      
      // Gap detection
      if (message.sequenceNumber > lastSequenceRef.current + 1) {
        console.warn('Gap detected, fetching missing messages...');
        fillGap(agentId, lastSequenceRef.current);
        return;
      }
      
      // Append new message
      setMessages(prev => [...prev, message]);
      messageIdsRef.current.add(message.id);
      lastSequenceRef.current = message.sequenceNumber;
    };
    
    window.addEventListener('agent:message', handleMessage);
    return () => window.removeEventListener('agent:message', handleMessage);
  }, [agentId]);
  
  return { messages, loading, error, refetch };
}
```

**Gap Filling**:

```typescript
const fillGap = async (agentId: string, since: number) => {
  const missing = await ApiService.getAgentMessagesSince(agentId, since);
  
  setMessages(prev => {
    const merged = [...prev];
    
    // Add missing messages (deduplicate by ID)
    missing.forEach(msg => {
      if (!messageIdsRef.current.has(msg.id)) {
        merged.push(msg);
        messageIdsRef.current.add(msg.id);
      }
    });
    
    // Re-sort by sequence number
    merged.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    return merged;
  });
};
```

---

### 1.7 Frontend - UI Component
**File**: `frontend/src/components/AgentOutput.tsx`

**Responsibility**:
- Render messages with proper formatting
- Auto-scroll to bottom when new messages arrive
- Display raw JSON on hover (for debugging)
- Show timestamps and message types

**Rendering**:

```typescript
export function AgentOutput({ agentId }: AgentOutputProps) {
  const messages = useSelector(state => 
    selectors.selectMessagesForAgent(state, agentId)
  );
  
  return (
    <div ref={outputRef} className="overflow-y-auto">
      {messages.map(message => (
        <div key={message.id}>
          <pre>
            {formatTimestamp(message.createdAt)}
            [{message.type}]
            {renderContent(message.content)}
          </pre>
          {/* Show raw JSON on hover */}
          {showRawOnHover && hoveredMessageId === message.id && (
            <RawJsonTooltip message={message} />
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 2. Complete Message Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ INITIAL STATE: Agent launches                                     │
└──────────────────────────────────────────────────────────────────┘

Frontend                      Backend                    Python Service
   │                             │                              │
   └─POST /agents────────────────┤                              │
                                 ├─Start Python Proxy──────────>│
                                 │                              │
                                 │<──── SSE Stream Start ────────┤
                                 │                              │

┌──────────────────────────────────────────────────────────────────┐
│ STREAMING PHASE: Tokens arrive from CLI                           │
└──────────────────────────────────────────────────────────────────┘

Frontend                      Backend                    Python Service
   │                             │                              │
   │                             │<──── event: message ────────┤
   │                             │  {"type":"stream_event",     │
   │                             │   "event": {                 │
   │                             │    "type":"content_block_   │
   │                             │           delta",            │
   │                             │    "delta": {                │
   │                             │     "type":"text_delta",     │
   │                             │     "text":"Hello"           │
   │                             │    }                         │
   │                             │   }                          │
   │                             │ }                            │
   │                             │                              │
   │                    Parser.parse() ──┐                      │
   │                             │       │ Converts to:         │
   │                             │<──────┘ AgentMessage         │
   │                             │ {                            │
   │                             │  type: 'assistant',          │
   │                             │  content: 'Hello',           │
   │                             │  metadata: {                 │
   │                             │   eventType: 'content_delta' │
   │                             │  }                           │
   │                             │ }                            │
   │                             │                              │
   │              StreamingService.broadcastMessage()           │
   │                             │                              │
   │                    MessageService.saveMessage()             │
   │                             │                              │
   │                    INSERT INTO agent_messages               │
   │                             │ {id, sequence_number:1, ...} │
   │                             │                              │
   │<──── WebSocket: agent:message ───────┤                    │
   │  {agentId, message{id, sequenceNumber:1, ...}}             │
   │                                                             │

┌──────────────────────────────────────────────────────────────────┐
│ GAP DETECTION: Network interruption or out-of-order events        │
└──────────────────────────────────────────────────────────────────┘

Frontend (in useAgentMessages)
  │
  ├─ Receive message with sequenceNumber: 5
  ├─ Check: lastSequenceRef.current = 3
  ├─ Gap detected! (5 !== 3+1)
  │
  ├─ Call API: GET /agents/:id/messages?since=3
  │    ↓
  ├─ Backend returns messages 4, 5, 6
  │
  ├─ Merge into state (deduplicate by ID)
  ├─ Re-sort by sequence number
  ├─ Update lastSequenceRef = 6
  │
  └─ Continue with next incoming message

┌──────────────────────────────────────────────────────────────────┐
│ COMPLETION: Stream ends                                           │
└──────────────────────────────────────────────────────────────────┘

Backend                      Python Service
   │                              │
   │<──── event: complete ────────┤
   │ {status: "success", ...}     │
   │                              │
   │ StreamingService.broadcastComplete()
   │                              │
   └── WebSocket: agent:complete
      {agentId, result{status, duration, messageCount}}

Frontend
   │
   └─ Display completion message to user
```

---

## 3. Database Schema

```sql
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,                      -- UUID v4, deduplication
  agent_id TEXT NOT NULL,                   -- FK to agents
  sequence_number INTEGER NOT NULL,         -- Monotonic per agent (1,2,3...)
  type TEXT NOT NULL,                       -- 'assistant','user','system','error','tool','response'
  role TEXT,                                -- Optional role field
  content TEXT NOT NULL,                    -- Message content (string or JSON)
  raw TEXT,                                 -- Original JSON from CLI
  metadata TEXT,                            -- JSON: {eventType, usage, tool_use, ...}
  created_at TEXT NOT NULL,                 -- ISO 8601 timestamp
  
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, sequence_number)         -- No duplicate sequences per agent
);

CREATE INDEX idx_messages_agent_id ON agent_messages(agent_id);
CREATE INDEX idx_messages_sequence ON agent_messages(agent_id, sequence_number);
CREATE INDEX idx_messages_created_at ON agent_messages(created_at);
```

**Key Constraints**:
- `sequence_number` is unique per agent (prevents duplicate sequences)
- FK constraint ensures agent exists before message insert
- Sequence numbers never reused (even after agent deletion)

---

## 4. Message Type Taxonomy

```typescript
// All message types that can appear in the system

type AgentMessage = 
  | AssistantMessage      // AI response (may span multiple tokens)
  | UserMessage           // User input or tool result
  | SystemMessage         // System events (init, metadata)
  | ErrorMessage          // Error occurred
  | ToolMessage           // Tool invocation details
  | ResponseMessage       // Final response/completion

// Streaming metadata
metadata?: {
  eventType?: 'content_delta' | 'message_delta';  // If from streaming event
  delta?: {...};                                   // For message_delta
  usage?: {                                        // Token usage
    input_tokens: number;
    output_tokens: number;
  };
  tool_use?: ContentBlock[];                       // Tool invocation blocks
  [key: string]: unknown;
}
```

---

## 5. Key Architectural Decisions

### 5.1 Database as Single Source of Truth

**Decision**: Messages are persisted to database BEFORE being emitted to WebSocket.

**Rationale**:
- Ensures no message loss on client disconnect
- Enables gap detection and filling
- Supports reconnection with full history
- Database = authoritative message state
- WebSocket = real-time notification mechanism

**Implementation**:
```typescript
async broadcastMessage(agentId, message) {
  // 1. Save to DB
  const saved = await messageService.saveMessage(message);
  
  // 2. Then emit
  websocketGateway.emitToRoom(`agent:${agentId}`, 'agent:message', {
    message: saved  // Return DB version with IDs
  });
}
```

### 5.2 UUID + Sequence Number Deduplication

**Decision**: Use both UUID (for uniqueness) and sequence number (for ordering).

**Rationale**:
- UUID handles duplicate messages from network retries
- Sequence number enables efficient gap detection
- Together they provide idempotency without distributed consensus

**Example**:
```
Message 1: id="uuid-1", sequence=1, content="Hello"
Duplicate: id="uuid-1", sequence=1          // Ignored by hook
Gap case:  Missing message with sequence=2
Solution:  Fetch messages since sequence=1
```

### 5.3 Parser Returns Null for Skippable Events

**Decision**: Parser returns `null` for events with no displayable content.

**Rationale**:
- Cleaner control flow (skip silently vs. throw error)
- Prevents log pollution from streaming metadata
- Adapter doesn't need to filter events

**Event Handling**:
```
message_start        ──> Parser: null  ──> Adapter: skip
content_block_delta  ──> Parser: AgentMessage ──> Adapter: emit
content_block_stop   ──> Parser: null  ──> Adapter: skip
message_stop         ──> Parser: null  ──> Adapter: skip
```

### 5.4 REST API for Historical, WebSocket for Real-Time

**Decision**: 
- Historical/bulk messages via REST (`GET /api/agents/:id/messages`)
- Real-time updates via WebSocket (`agent:message` event)
- Gap filling via REST (with `since` parameter)

**Rationale**:
- REST is simpler for large message retrieval
- WebSocket is lower-latency for single messages
- Hybrid approach combines benefits of both

---

## 6. Error Handling

### 6.1 Foreign Key Constraint Violation

**Scenario**: Message save fails because agent doesn't exist.

**Current Behavior**:
```typescript
// In StreamingService.broadcastMessage()

try {
  const saved = await messageService.saveMessage(...);
  // Success - emit to WebSocket
} catch (error) {
  if (error.message.includes('FOREIGN KEY constraint failed')) {
    // Agent doesn't exist - propagate error
    // Emit agent:error event to frontend
    websocketGateway.emitToRoom(..., 'agent:error', {
      error: 'Agent does not exist'
    });
    throw error; // Also propagate to caller
  }
}
```

**Root Cause Investigation**:
- Agent created in memory but not yet saved to DB
- Message arrives before agent is persisted
- FK constraint prevents orphaned messages

**Prevention**:
- Ensure agent is saved BEFORE starting streaming
- Verify FK constraint is enabled in database

### 6.2 Message Broadcast Failure

**Scenario**: WebSocket gateway unavailable when trying to emit.

**Current Behavior**:
- `broadcastMessage()` catches errors
- Logs error but doesn't crash agent
- Emits `agent:error` event to frontend
- Allows agent to continue running

**Why**: Losing the WebSocket should not crash the entire system.

---

## 7. Performance Characteristics

### 7.1 Message Insertion

**Time Complexity**: O(1) amortized (atomic subquery for sequence)
**Space Complexity**: O(1) per message

**Query**:
```sql
INSERT INTO agent_messages (...) VALUES (
  ?,
  ?,
  COALESCE((SELECT MAX(sequence_number) FROM agent_messages WHERE agent_id = ?), 0) + 1,
  ...
)
```

**Why Atomic Subquery**:
- Single INSERT statement = single transaction
- Race condition free (no separate SELECT + INSERT)
- Database handles sequencing atomically

### 7.2 Message Retrieval

**Get all messages**: O(n) where n = message count for agent
**Get messages since**: O(m) where m = messages after sequence N

**Indexes Enable Fast Queries**:
```sql
-- Indexed queries used by app
SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number ASC;
SELECT * FROM agent_messages WHERE agent_id = ? AND sequence_number > ? ORDER BY sequence_number ASC;
```

### 7.3 Gap Filling

**Scenario**: Client misses messages 4-6 out of 10 total.

**Network Traffic**:
```
1. Client receives message 7
2. Detects gap (lastSeq=3, received=7)
3. Call: GET /agents/:id/messages?since=3
4. Server returns: messages 4,5,6,7,8,9,10 (only 7 messages, not 10)
5. Client merges, deduplicates, re-sorts
```

**Latency**: Single HTTP roundtrip (50-200ms typical)

---

## 8. Reusability Pattern for Other Projects

### 8.1 Generic Token Streaming Architecture

This pattern can be applied to any streaming AI service:

```
1. ADAPTER LAYER
   - Fetch stream from service (SSE, gRPC, etc.)
   - Parse events into normalized message format
   - Filter/skip non-displayable events
   - Emit to observers with original format preserved

2. SERVICE LAYER
   - Coordinate persistence and broadcasting
   - Implement "save first, emit second" pattern
   - Handle errors without crashing system

3. DATABASE LAYER
   - Store messages with UUID + sequence number
   - Enable gap detection via sequence
   - Support efficient message retrieval

4. API LAYER
   - Provide REST endpoints for bulk retrieval
   - Include "since" parameter for gap filling

5. WEBSOCKET LAYER
   - Broadcast real-time updates
   - Implement room-based subscriptions
   - Handle lifecycle events

6. FRONTEND LAYER
   - useAgentMessages hook pattern:
     * Load history via REST
     * Listen for real-time updates
     * Detect and fill gaps
     * Deduplicate by ID
   - Display component pattern:
     * Render messages with auto-scroll
     * Show metadata on demand
     * Handle error states gracefully
```

### 8.2 Service Adapter Template

```typescript
export class GenericStreamAdapter implements IAgentRunner {
  constructor(
    private readonly serviceUrl: string,
    private readonly parser: IMessageParser,
    private readonly logger: ILogger
  ) {}
  
  async start(session: Session): Promise<Agent> {
    const agent = Agent.create({...});
    
    // Start streaming in background
    this.streamFromService(agent.id, session).catch(error => {
      this.notifyObservers(agent.id, 'onError', error);
    });
    
    return agent;
  }
  
  private async streamFromService(agentId: AgentId, session: Session) {
    try {
      // 1. Connect to service
      const stream = await this.connectToService(session);
      
      // 2. Process events
      for await (const event of stream) {
        // 3. Parse to normalized format
        const message = this.parser.parse(event);
        
        if (message === null) {
          continue; // Skip non-displayable
        }
        
        // 4. Notify observers
        this.notifyObservers(agentId, 'onMessage', message);
      }
      
      // 5. Handle completion
      this.notifyObservers(agentId, 'onComplete', {
        status: 'success',
        duration: Date.now() - startTime,
        messageCount: count,
      });
    } catch (error) {
      this.notifyObservers(agentId, 'onError', error);
    }
  }
}
```

### 8.3 Message Parser Template

```typescript
export class GenericMessageParser implements IMessageParser {
  parse(line: string): AgentMessage | null {
    const event = this.parseFormat(line);
    
    // Skip non-displayable events
    if (this.isSkippable(event)) {
      return null;
    }
    
    // Extract content
    const content = this.extractContent(event);
    
    if (!content) {
      return null; // No displayable content
    }
    
    // Normalize to standard format
    return {
      type: this.mapType(event.type),
      role: event.role,
      content: content,
      raw: line,
      metadata: this.extractMetadata(event),
    };
  }
  
  private isSkippable(event: any): boolean {
    return [
      'stream_start',
      'stream_metadata',
      'stream_stop',
      'content_block_start',
      'content_block_stop',
    ].includes(event.type);
  }
}
```

### 8.4 Database Schema Template

```sql
-- Generic message table supporting any streaming source
CREATE TABLE messages (
  id TEXT PRIMARY KEY,                    -- UUID for deduplication
  session_id TEXT NOT NULL,               -- FK to sessions
  sequence_number INTEGER NOT NULL,       -- Ordering + gap detection
  type TEXT NOT NULL,                     -- Message classification
  role TEXT,                              -- Optional role
  content TEXT NOT NULL,                  -- Message body
  raw TEXT,                               -- Original format (for debugging)
  metadata TEXT,                          -- JSON: source-specific fields
  created_at TEXT NOT NULL,
  
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, sequence_number)
);
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

Test each layer independently:

```typescript
// Parser tests
it('should skip non-displayable events', () => {
  const message = parser.parse('{"type":"stream_event","event":{"type":"message_start"}}');
  expect(message).toBeNull();
});

it('should parse content_block_delta tokens', () => {
  const message = parser.parse('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}');
  expect(message.content).toBe('Hello');
  expect(message.metadata.eventType).toBe('content_delta');
});

// Service tests
it('should persist message before emitting', async () => {
  const saveSpy = jest.spyOn(messageService, 'saveMessage');
  const emitSpy = jest.spyOn(gateway, 'emitToRoom');
  
  await service.broadcastMessage(agentId, message);
  
  expect(saveSpy).toHaveBeenCalledBefore(emitSpy);
});

// Hook tests
it('should deduplicate messages by ID', () => {
  // Send same message twice
  // Second should be ignored
});

it('should detect gaps in sequence numbers', () => {
  // Receive messages 1, 3 (skip 2)
  // Should fetch messages since 1
  // Should merge in order
});
```

### 9.2 Integration Tests

Test across layer boundaries:

```typescript
it('should stream complete message flow', async () => {
  // 1. Create agent
  const agent = await service.launchAgent(request);
  
  // 2. Stream arrives from proxy
  adapter.emitMessage(message1);
  adapter.emitMessage(message2);
  
  // 3. Verify messages saved
  const saved = await db.findByAgentId(agent.id);
  expect(saved).toHaveLength(2);
  
  // 4. Verify WebSocket emitted
  expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(2);
  
  // 5. Verify message structure
  expect(saved[0]).toHaveProperty('id');
  expect(saved[0]).toHaveProperty('sequenceNumber', 1);
});
```

### 9.3 E2E Tests

Test complete system:

```typescript
it('should handle real streaming with frontend', async () => {
  // 1. Frontend connects
  const socket = io('http://localhost:3000');
  
  // 2. Backend starts agent
  const agent = await api.post('/agents', {type: 'claude-code', prompt: 'test'});
  
  // 3. Frontend subscribes
  socket.emit('subscribe', {agentId: agent.id});
  
  // 4. Messages stream in real-time
  let messageCount = 0;
  socket.on('agent:message', (payload) => {
    messageCount++;
    
    // Verify message structure
    expect(payload.message).toHaveProperty('id');
    expect(payload.message).toHaveProperty('sequenceNumber', messageCount);
  });
  
  // 5. Verify database has messages
  const messages = await api.get(`/agents/${agent.id}/messages`);
  expect(messages).toHaveLength(messageCount);
});
```

---

## 10. Migration Path from Single Token Display to Aggregated Messages

**Current State**: Each token displayed individually (one message per token)

**Improved State**: Tokens aggregated into single assistant message

### 10.1 Implementation Plan

**Step 1: Mark streaming tokens in parser**
```typescript
// Parser already does this:
metadata: { eventType: 'content_delta' }
```

**Step 2: Frontend aggregation logic**
```typescript
const aggregateTokens = (messages: AgentMessage[]): AggregatedMessage[] => {
  const result: AggregatedMessage[] = [];
  let currentAssistantMessage: string[] = [];
  
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.metadata?.eventType === 'content_delta') {
      // Accumulate token
      currentAssistantMessage.push(msg.content as string);
    } else {
      // Different message type - flush accumulated tokens
      if (currentAssistantMessage.length > 0) {
        result.push({
          type: 'assistant',
          content: currentAssistantMessage.join(''),
          sequenceNumber: messages.find(m => m.content === currentAssistantMessage[0])?.sequenceNumber
        });
        currentAssistantMessage = [];
      }
      result.push(msg);
    }
  }
  
  // Flush remaining
  if (currentAssistantMessage.length > 0) {
    result.push({
      type: 'assistant',
      content: currentAssistantMessage.join(''),
      sequenceNumber: messages[messages.length - 1]?.sequenceNumber
    });
  }
  
  return result;
};
```

**Step 3: Update hook to use aggregation**
```typescript
const displayMessages = aggregateTokens(messages);
```

**Step 4: Keep database as-is**
- Continue storing all tokens (or migrate to store complete messages only)
- Aggregation is frontend-only concern

**Benefits**:
- Cleaner message history
- Reduced database size
- Better user experience (reads like conversation)

---

## 11. Troubleshooting Guide

### Issue: Messages appear as duplicates

**Cause**: WebSocket message arrives after REST fetch, causing same message to appear twice.

**Solution**: Hook uses UUID deduplication (messageIdsRef) to prevent this.

**Verify**:
```typescript
// Check for duplicate IDs in state
const ids = new Set();
messages.forEach(msg => {
  if (ids.has(msg.id)) {
    console.error('Duplicate message ID:', msg.id);
  }
  ids.add(msg.id);
});
```

### Issue: Messages appear out of order

**Cause**: WebSocket messages arrive out-of-order (rare but possible).

**Solution**: Gap detection and re-fetching ensures correct order.

**Verify**:
```typescript
// Check sequence numbers are monotonic
for (let i = 1; i < messages.length; i++) {
  if (messages[i].sequenceNumber <= messages[i-1].sequenceNumber) {
    console.error('Out of order:', messages[i].sequenceNumber, messages[i-1].sequenceNumber);
  }
}
```

### Issue: Old messages missing after reconnect

**Cause**: Frontend cleared messages on page reload, backend still has them.

**Solution**: Hook fetches all messages from REST API on mount.

**Verify**:
```bash
# Backend
curl http://localhost:3000/api/agents/{agentId}/messages | jq length

# Should return total message count
# If 0, agent was never created properly
```

---

## 12. Conclusion

This architecture provides:

1. **Reliability**: Database persistence ensures no message loss
2. **Real-time UX**: WebSocket streaming provides instant feedback
3. **Resilience**: Gap detection handles network issues
4. **Scalability**: Efficient message retrieval with sequence numbers
5. **Maintainability**: Clean separation of concerns across layers
6. **Reusability**: Generic pattern applicable to any streaming service

The key insight is combining **persistence** (database) with **notifications** (WebSocket), using **UUIDs + sequence numbers** for deduplication and ordering, and implementing **gap detection** to handle transient failures gracefully.

