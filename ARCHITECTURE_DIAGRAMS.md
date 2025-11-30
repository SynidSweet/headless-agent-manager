# Token Streaming Architecture - Visual Diagrams

## 1. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            HEADLESS AI AGENT SYSTEM                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      CLIENT LAYER (Frontend)                     │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                  │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  React Components                                       │   │  │
│  │  │  ┌──────────────────────────────────────────────────┐  │   │  │
│  │  │  │ AgentOutput (render messages)                   │  │   │  │
│  │  │  │ - Auto-scroll to bottom                         │  │   │  │
│  │  │  │ - Show raw JSON on hover                        │  │   │  │
│  │  │  │ - Display timestamps and types                 │  │   │  │
│  │  │  └──────────────────────────────────────────────────┘  │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │           ▲                            │                       │  │
│  │           │                            │                       │  │
│  │   State: AgentMessage[]    renders     │                       │  │
│  │                                        │                       │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  useAgentMessages Hook                                │   │  │
│  │  │  ┌──────────────────────────────────────────────────┐ │   │  │
│  │  │  │ 1. Load history: REST GET /agents/:id/messages  │ │   │  │
│  │  │  │ 2. Track: messageIdsRef Set<UUID>               │ │   │  │
│  │  │  │ 3. Track: lastSequenceRef number                │ │   │  │
│  │  │  │ 4. Listen: window.addEventListener('agent:message') │   │  │
│  │  │  │ 5. Dedup: Check messageIdsRef.has(id)           │ │   │  │
│  │  │  │ 6. Gap detect: seq > lastSeq + 1                │ │   │  │
│  │  │  │ 7. Fill gap: REST GET /agents/:id/messages?since=N   │   │  │
│  │  │  │ 8. Merge: Deduplicate and re-sort               │ │   │  │
│  │  │  └──────────────────────────────────────────────────┘ │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │           ▲              │                                      │  │
│  │           │              │                                      │  │
│  │   REST API (bulk)    WebSocket (real-time)                    │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│            ▲                              │                            │
│            │                              │                            │
│    HTTP (port 3000)            WebSocket (port 3000)                │
│            │                              │                            │
├────────────┼──────────────────────────────┼────────────────────────────┤
│            │                              │                            │
│  ┌─────────▼──────────────────────────────▼────────────────────────┐  │
│  │                      SERVER LAYER (Backend - NestJS)            │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │                                                                 │  │
│  │  ┌────────────────────────────────────────────────────────┐   │  │
│  │  │ Presentation Layer                                     │   │  │
│  │  │ ┌──────────────────────────────────────────────────┐  │   │  │
│  │  │ │ AgentController (REST API)                      │  │   │  │
│  │  │ │ POST   /agents              - Launch agent      │  │   │  │
│  │  │ │ GET    /agents              - List agents       │  │   │  │
│  │  │ │ GET    /agents/:id          - Get agent         │  │   │  │
│  │  │ │ GET    /agents/:id/messages - Get all messages  │  │   │  │
│  │  │ │ GET    /agents/:id/messages?since=N - Gap fill  │  │   │  │
│  │  │ │ DELETE /agents/:id          - Terminate agent   │  │   │  │
│  │  │ └──────────────────────────────────────────────────┘  │   │  │
│  │  │ ┌──────────────────────────────────────────────────┐  │   │  │
│  │  │ │ AgentGateway (WebSocket)                        │  │   │  │
│  │  │ │ Events:                                         │  │   │  │
│  │  │ │   agent:message   (real-time tokens)            │  │   │  │
│  │  │ │   agent:complete  (stream ended)                │  │   │  │
│  │  │ │   agent:error     (error occurred)              │  │   │  │
│  │  │ │   agent:status    (status changed)              │  │   │  │
│  │  │ │   agent:created   (agent launched)              │  │   │  │
│  │  │ │   agent:deleted   (agent terminated)            │  │   │  │
│  │  │ └──────────────────────────────────────────────────┘  │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  │           ▲                              │                     │  │
│  │           │                              │                     │  │
│  │  Request/Response                   WebSocket Event            │  │
│  │           │                              │                     │  │
│  │  ┌────────▼──────────────────────────────▼───────────────┐    │  │
│  │  │ Application Layer                                     │    │  │
│  │  │ ┌─────────────────────────────────────────────────┐  │    │  │
│  │  │ │ StreamingService                               │  │    │  │
│  │  │ │ async broadcastMessage(agentId, message)       │  │    │  │
│  │  │ │   1. Save to database (FK constraint check)    │  │    │  │
│  │  │ │   2. Get saved message with IDs                │  │    │  │
│  │  │ │   3. Emit to WebSocket room                    │  │    │  │
│  │  │ │   4. Handle errors (FK, DB locked, etc)        │  │    │  │
│  │  │ │                                                │  │    │  │
│  │  │ │ broadcastComplete/broadcastError/broadcastStatus  │    │  │
│  │  │ │ - Persist status change to database            │  │    │  │
│  │  │ │ - Broadcast to clients                         │  │    │  │
│  │  │ └─────────────────────────────────────────────────┘  │    │  │
│  │  │ ┌─────────────────────────────────────────────────┐  │    │  │
│  │  │ │ AgentOrchestrationService                       │  │    │  │
│  │  │ │ - Create agents (save to DB)                    │  │    │  │
│  │  │ │ - Start runners                                │  │    │  │
│  │  │ │ - Manage lifecycle                             │  │    │  │
│  │  │ └─────────────────────────────────────────────────┘  │    │  │
│  │  │ ┌─────────────────────────────────────────────────┐  │    │  │
│  │  │ │ AgentMessageService                             │  │    │  │
│  │  │ │ async saveMessage(createDto)                    │  │    │  │
│  │  │ │   1. Generate UUID v4                           │  │    │  │
│  │  │ │   2. Atomic INSERT with sequence subquery       │  │    │  │
│  │  │ │   3. Return DTO with IDs (id, sequence)         │  │    │  │
│  │  │ │                                                 │  │    │  │
│  │  │ │ async findByAgentId(agentId)                    │  │    │  │
│  │  │ │   - SELECT * WHERE agent_id = ? ORDER BY seq    │  │    │  │
│  │  │ │                                                 │  │    │  │
│  │  │ │ async findByAgentIdSince(agentId, since)        │  │    │  │
│  │  │ │   - SELECT * WHERE agent_id = ? AND seq > since │  │    │  │
│  │  │ └─────────────────────────────────────────────────┘  │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  │           ▲                                              │   │  │
│  │           │                                              │   │  │
│  │    Queries (save/load)              Agents, Runners      │   │  │
│  │           │                                              │   │  │
│  │  ┌────────▼──────────────────────────────────────────┐  │   │  │
│  │  │ Infrastructure Layer                              │  │   │  │
│  │  │ ┌───────────────────────────────────────────────┐ │  │   │  │
│  │  │ │ Adapters                                      │ │  │   │  │
│  │  │ │ ┌──────────────────────────────────────────┐  │ │  │   │  │
│  │  │ │ │ ClaudePythonProxyAdapter                 │  │ │  │   │  │
│  │  │ │ │ async start(session) -> Agent            │  │ │  │   │  │
│  │  │ │ │   1. Create agent instance               │  │ │  │   │  │
│  │  │ │ │   2. Start streamFromProxy() async       │  │ │  │   │  │
│  │  │ │ │ async streamFromProxy(agentId, session)  │  │ │  │   │  │
│  │  │ │ │   1. POST to http://localhost:8000/...   │  │ │  │   │  │
│  │  │ │ │   2. Read SSE stream byte-by-byte        │  │ │  │   │  │
│  │  │ │ │   3. Parse JSONL events                  │  │ │  │   │  │
│  │  │ │ │   4. notifyObservers('onMessage', msg)   │  │ │  │   │  │
│  │  │ │ │   5. Handle completion/error             │  │ │  │   │  │
│  │  │ └──────────────────────────────────────────┘  │ │  │   │  │
│  │  │ ┌───────────────────────────────────────────┐ │  │   │  │
│  │  │ │ ClaudeMessageParser                       │ │  │   │  │
│  │  │ │ parse(jsonLine: string): AgentMessage | null │  │   │  │
│  │  │ │   IF stream_event:                        │ │  │   │  │
│  │  │ │     IF message_start/stop/block_stop      │ │  │   │  │
│  │  │ │       → return null (skip)                 │ │  │   │  │
│  │  │ │     IF content_block_delta (token)         │ │  │   │  │
│  │  │ │       → AgentMessage {                     │ │  │   │  │
│  │  │ │           type: 'assistant'                │ │  │   │  │
│  │  │ │           content: token_text              │ │  │   │  │
│  │  │ │           metadata: {eventType: 'content...│ │  │   │  │
│  │  │ │         }                                  │ │  │   │  │
│  │  │ │     IF message_delta (usage)               │ │  │   │  │
│  │  │ │       → AgentMessage with usage metadata   │ │  │   │  │
│  │  │ │   ELSE (old format)                        │ │  │   │  │
│  │  │ │     Continue parsing...                    │ │  │   │  │
│  │  │ └───────────────────────────────────────────┘ │  │   │  │
│  │  │ ┌───────────────────────────────────────────┐ │  │   │  │
│  │  │ │ AgentFactory                              │ │  │   │  │
│  │  │ │ create(type: AgentType): IAgentRunner      │ │  │   │  │
│  │  │ │   switch(type):                           │ │  │   │  │
│  │  │ │     CLAUDE_CODE → new ClaudePythonProxy...│ │  │   │  │
│  │  │ │     GEMINI_CLI  → new GeminiAdapter (todo) │ │  │   │  │
│  │  │ └───────────────────────────────────────────┘ │  │   │  │
│  │  └────────────────────────────────────────────────┘  │   │  │
│  │           ▲                                          │   │  │
│  │           │                                          │   │  │
│  │     Messages, Agents               SSE Stream       │   │  │
│  │           │                                          │   │  │
│  │  ┌────────▼──────────────────────────────────────┐  │   │  │
│  │  │ Database Layer (SQLite)                        │  │   │  │
│  │  │ ┌───────────────────────────────────────────┐  │  │   │  │
│  │  │ │ DatabaseService                          │  │  │   │  │
│  │  │ │ - Connection management                  │  │  │   │  │
│  │  │ │ - Migration runner (schema.sql)           │  │  │   │  │
│  │  │ │ - FK constraints (ON)                     │  │  │   │  │
│  │  │ │ - Journal mode (DELETE)                   │  │  │   │  │
│  │  │ └───────────────────────────────────────────┘  │  │   │  │
│  │  │                                                 │  │   │  │
│  │  │ agents table:                                  │  │   │  │
│  │  │ ┌───────────────────────────────────────────┐  │  │   │  │
│  │  │ │ id           TEXT PRIMARY KEY              │  │  │   │  │
│  │  │ │ type         TEXT                          │  │  │   │  │
│  │  │ │ status       TEXT (running/completed/...) │  │  │   │  │
│  │  │ │ prompt       TEXT                          │  │  │   │  │
│  │  │ │ created_at   TEXT                          │  │  │   │  │
│  │  │ │ started_at   TEXT                          │  │  │   │  │
│  │  │ │ completed_at TEXT                          │  │  │   │  │
│  │  │ └───────────────────────────────────────────┘  │  │   │  │
│  │  │                                                 │  │   │  │
│  │  │ agent_messages table:                          │  │   │  │
│  │  │ ┌───────────────────────────────────────────┐  │  │   │  │
│  │  │ │ id               TEXT PRIMARY KEY (UUID v4)  │  │   │  │
│  │  │ │ agent_id         TEXT FK (agents.id)        │  │   │  │
│  │  │ │ sequence_number  INTEGER UNIQUE(agent_id)   │  │   │  │
│  │  │ │ type             TEXT                        │  │   │  │
│  │  │ │ role             TEXT                        │  │   │  │
│  │  │ │ content          TEXT                        │  │   │  │
│  │  │ │ raw              TEXT                        │  │   │  │
│  │  │ │ metadata         TEXT (JSON)                │  │   │  │
│  │  │ │ created_at       TEXT (ISO 8601)            │  │   │  │
│  │  │ │                                             │  │   │  │
│  │  │ │ Indexes:                                    │  │   │  │
│  │  │ │   (agent_id)                                │  │   │  │
│  │  │ │   (agent_id, sequence_number)               │  │   │  │
│  │  │ │   (created_at)                              │  │   │  │
│  │  │ └───────────────────────────────────────────┘  │  │   │  │
│  │  └────────────────────────────────────────────────┘  │   │  │
│  │                                                      │   │  │
│  └──────────────────────────────────────────────────────┘   │  │
│                                                               │  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ HTTP (port 8000)
         ▼
    ┌──────────────────────────┐
    │  External Service        │
    │  Claude Python Proxy     │
    │                          │
    │ POST /agent/stream       │
    │   ↓ spawns Claude CLI    │
    │   ↓ reads JSONL stream   │
    │   → SSE response         │
    │                          │
    └──────────────────────────┘
```

---

## 2. Message Flow Timeline

```
TIME                    PYTHON SERVICE              BACKEND                    FRONTEND
─────────────────────────────────────────────────────────────────────────────────────────

T0   Agent launches     Waiting...                  POST /agents → create
                                                   Agent saved to DB
                                                   Start Python proxy →

T1                      POST /agent/stream received
                        Spawn Claude CLI
                        Stream processing...

T2                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"message_start"}}
                                                   Parser sees message_start
                                                   Returns null
                                                   Skip silently

T3                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"content_block_delta",
                          "delta":{
                           "type":"text_delta",
                           "text":"Hello"}}}
                                                   Parser.parse() → AgentMessage
                                                   {type: 'assistant',
                                                    content: 'Hello',
                                                    metadata: {eventType: 'content_delta'}}
                                                   
                                                   Adapter.notifyObservers()
                                                   StreamingService.onMessage()
                                                   MessageService.saveMessage()
                                                   INSERT into agent_messages
                                                   (id=uuid1, sequence=1, ...)
                                                   
                                                   StreamingGateway.emitToRoom()
                                                   WebSocket: agent:message →
                                                                                 Hook receives event
                                                                                 Check dedup (not in set)
                                                                                 Check sequence (1 == 0+1 ✓)
                                                                                 Append to messages[]
                                                                                 Re-render AgentOutput

T4                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"content_block_delta",
                          "delta":{
                           "text":" world"}}}
                                                   Parser → AgentMessage
                                                   {content: " world"}
                                                   
                                                   MessageService.saveMessage()
                                                   (id=uuid2, sequence=2, ...)
                                                   
                                                   WebSocket: agent:message →
                                                                                 Hook receives
                                                                                 Not duplicate
                                                                                 Sequence check: 2 == 1+1 ✓
                                                                                 Append + re-render

T5                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"message_delta",
                          "usage":{
                           "input_tokens": 100,
                           "output_tokens": 50}}}
                                                   Parser → AgentMessage
                                                   {type: 'system',
                                                    content: '',
                                                    metadata: {
                                                     eventType: 'message_delta',
                                                     usage: {...}}}
                                                   
                                                   MessageService.saveMessage()
                                                   (id=uuid3, sequence=3, ...)
                                                   
                                                   WebSocket: agent:message →
                                                                                 Hook receives
                                                                                 Append system message

T6                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"content_block_stop"}}
                                                   Parser sees content_block_stop
                                                   Returns null
                                                   Skip silently

T7                      SSE: event:message
                        {"type":"stream_event",
                         "event":{
                          "type":"message_stop"}}
                                                   Parser sees message_stop
                                                   Returns null
                                                   Skip silently

T8                      SSE: event:complete
                        data: {"status":"success",
                              "duration": 5000}
                                                   Adapter sees event:complete
                                                   notifyObservers('onComplete')
                                                   StreamingService.broadcastComplete()
                                                   Update agent status to COMPLETED
                                                   Save to DB
                                                   WebSocket: agent:complete →
                                                                                 Hook receives
                                                                                 Frontend shows
                                                                                 completion badge

─────────────────────────────────────────────────────────────────────────────────────────
RESULT: User sees "Hello world" typed out in real-time with proper tokens aggregated
        Database has 3 messages (deltas + metadata)
        If user refreshes, REST API loads all 3 messages
```

---

## 3. Gap Detection and Filling

```
SCENARIO: Network interruption causes messages 4 and 5 to be lost

BEFORE GAP:
  lastSequenceRef = 3
  messages: [msg1, msg2, msg3]

STREAMING CONTINUES (but message 4 & 5 are lost):
  Receive WebSocket event with message 6

IN HOOK (useAgentMessages):
  if (message.sequenceNumber > lastSequenceRef + 1) {
    // 6 > 3 + 1 → GAP DETECTED!
    fillGap(agentId, lastSequenceRef)
  }

FILL GAP:
  const missing = await API.getAgentMessagesSince(agentId, 3)
  // Returns messages 4, 5, 6, 7, ... (all after sequence 3)

MERGE:
  merged = [msg1, msg2, msg3]
  for each missing message:
    if !messageIdsRef.has(message.id):
      merged.push(message)
      messageIdsRef.add(message.id)

RE-SORT:
  merged.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  // [msg1, msg2, msg3, msg4, msg5, msg6, msg7, ...]

UPDATE:
  lastSequenceRef = 7 (or whatever highest)
  setMessages(merged)

AFTER:
  No messages lost
  User sees complete conversation
  Continue receiving new messages
```

---

## 4. Error Scenarios

```
SCENARIO 1: Agent doesn't exist in database
─────────────────────────────────────────────

Backend sends message → SaveMessage()
  ↓
INSERT INTO agent_messages (agent_id = "uuid-xyz")
  ↓
FOREIGN KEY constraint failed!
  ↓
broadcastMessage() catches error
  ↓
if error includes "FOREIGN KEY constraint":
  log error
  emit agent:error event
  propagate error to caller
  ↓
Frontend receives agent:error
  ↓
Display error: "Agent does not exist"
User can try reconnecting


SCENARIO 2: WebSocket disconnection
────────────────────────────────────

Frontend disconnects → Socket closes
  ↓
useAgentMessages still has last state
  ↓
User refreshes page
  ↓
useAgentMessages mounts with agentId
  ↓
Call REST API: GET /agents/:id/messages
  ↓
Receive all historical messages
  ↓
Re-establish WebSocket connection
  ↓
Subscribe to agent
  ↓
Listen for new messages
  ↓
Gap detection works as before


SCENARIO 3: Out-of-order messages
──────────────────────────────────

Receive message seq=5
Receive message seq=3  (out of order)
  ↓
Hook detects: 3 <= 5 (not a gap)
  ↓
Append message seq=3 to state
  ↓
state = [msg1, msg2, msg4, msg5, msg3]  (out of order)
  ↓
NO RE-SORT!  (This is a bug!)
  ↓
User sees out-of-order messages
  ↓
FIX: Always re-sort on new messages
  ↓
setMessages(prev => {
  const next = [...prev, newMessage];
  return next.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
});
```

---

## 5. Database Transaction Flow

```
MESSAGE ARRIVAL at Database Layer
──────────────────────────────────

1. BEGIN (implicit in SQLite)

2. MessageService.saveMessage():
   
   a) Generate UUID:
      id = randomUUID()
      
   b) Get current max sequence:
      (Atomic within INSERT)
      
   c) INSERT INTO agent_messages:
      
      INSERT INTO agent_messages (
        id, agent_id, sequence_number, type, content, ...
      ) VALUES (
        'uuid-1234',
        'agent-5678',                           <- FK checked here!
        (SELECT MAX(sequence_number) 
         FROM agent_messages 
         WHERE agent_id = 'agent-5678') + 1,   <- Atomic!
        'assistant',
        'Hello',
        ...
      )
      
      ForeignKeyConstraint Check:
        ✓ agent_id 'agent-5678' exists in agents table
        ✓ If not → FOREIGN KEY constraint failed
        
      UniqueConstraint Check:
        ✓ (agent_id, sequence_number) pair is unique
        ✓ If not → UNIQUE constraint failed

3. SELECT back the sequence_number:
   SELECT sequence_number FROM agent_messages WHERE id = 'uuid-1234'
   
4. Return DTO:
   {
     id: 'uuid-1234',
     sequenceNumber: 1,
     ...
   }

5. COMMIT (on success)
   or
   ROLLBACK (on error)

───────────────────────────────────────

KEY INSIGHTS:

✓ Single INSERT = single transaction
✓ Subquery for sequence = race-condition free
✓ FK constraint = referential integrity
✓ UNIQUE constraint = no duplicate sequences
✓ All within one atomic operation

```

---

## 6. REST vs WebSocket Message Flow

```
INITIAL LOAD (REST)
───────────────────

User opens app, selects agent
  ↓
useAgentMessages(agentId) effect fires
  ↓
const history = await ApiService.getAgentMessages(agentId)
  ↓
HTTP: GET /agents/{agentId}/messages
  ↓
Controller validates agentId exists
  ↓
MessageService.findByAgentId(agentId)
  ↓
SELECT * FROM agent_messages 
  WHERE agent_id = ? 
  ORDER BY sequence_number ASC
  ↓
Return sorted AgentMessage[]
  ↓
Hook sets state: setMessages(history)
  ↓
Hook tracks: history.forEach(msg => messageIdsRef.add(msg.id))
  ↓
UI renders all messages


REAL-TIME UPDATE (WebSocket)
────────────────────────────

Agent is streaming
  ↓
Parser parses token
  ↓
StreamingService.broadcastMessage(agentId, message)
  ↓
1. Save to DB (as above)
  ↓
2. Get back saved message with IDs
  ↓
3. emitToRoom(`agent:${agentId}`, 'agent:message', {
     agentId,
     message: savedMessage,
     timestamp
   })
  ↓
WebSocket Server broadcasts to room
  ↓
All connected clients in room receive event
  ↓
Client receives:
   event.detail = {
     agentId: 'uuid-xyz',
     message: {
       id: 'uuid-msg-1',
       sequenceNumber: 100,
       type: 'assistant',
       content: 'Hello',
       ...
     },
     timestamp: '2025-11-28T10:30:00Z'
   }
  ↓
Hook's window.addEventListener('agent:message', handleMessage) fires
  ↓
handleMessage() checks:
  - Deduplication (ID in set?)
  - Gap detection (sequence continuous?)
  - Sequence tracking (update lastSeq)
  ↓
setMessages(prev => [...prev, message])
  ↓
Component re-renders with new message


GAP FILLING (REST + WebSocket)
───────────────────────────────

Gap detected in WebSocket stream
  ↓
Hook calls: fillGap(agentId, lastSequenceRef)
  ↓
const missing = await ApiService.getAgentMessagesSince(agentId, since)
  ↓
HTTP: GET /agents/{agentId}/messages?since={since}
  ↓
Controller:
  const sinceSeq = parseInt(since, 10)
  return messageService.findByAgentIdSince(agentId, sinceSeq)
  ↓
MessageService:
  SELECT * FROM agent_messages
  WHERE agent_id = ? AND sequence_number > ?
  ORDER BY sequence_number ASC
  ↓
Return AgentMessage[] of missing messages
  ↓
Hook merges missing with existing messages:
  - Deduplicate by ID
  - Re-sort by sequence
  ↓
setMessages(merged)
  ↓
Continue listening to WebSocket for next message
```

---

## 7. Deployment Architecture

```
DEVELOPMENT SETUP
─────────────────

┌─────────────────────────────────────────────────────┐
│ Developer Machine                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Terminal 1:                                         │
│ cd claude-proxy-service                             │
│ source venv/bin/activate                            │
│ uvicorn app.main:app --reload                       │
│ → Server at http://localhost:8000                   │
│                                                     │
│ Terminal 2:                                         │
│ cd backend                                          │
│ npm run dev                                         │
│ → NestJS at http://localhost:3000                   │
│ → DB at ./data/agent.db                             │
│                                                     │
│ Terminal 3:                                         │
│ cd frontend                                         │
│ npm run dev                                         │
│ → Vite at http://localhost:5173                     │
│ → Proxies to http://localhost:3000/api              │
│                                                     │
└─────────────────────────────────────────────────────┘
      ↑                    ↑                    ↑
      │ HTTP 5173          │ HTTP 3000          │ HTTP 8000
      │                    │                    │
    Browser          NestJS Backend      Claude Proxy
                                          (Python)
                                          
                                          
PRODUCTION SETUP (Docker)
─────────────────────────

┌──────────────────────────────────────────────────────┐
│ Docker Container                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Service 1: Backend (Node.js/NestJS)                 │
│ - Compiled from src/                                 │
│ - Listens on port 3000                              │
│ - Database at /app/data/agent.db                    │
│ - CLAUDE_PROXY_URL=http://python-service:8000       │
│                                                      │
│ Service 2: Frontend (Static files)                  │
│ - Built with npm run build                          │
│ - Served from /app/frontend/dist                    │
│ - Proxy config: /api → Backend:3000                 │
│                                                      │
│ Service 3: Python Proxy (Python/FastAPI)            │
│ - Listens on port 8000                              │
│ - Requires Claude CLI installed                     │
│ - Requires Claude authentication                    │
│                                                      │
└──────────────────────────────────────────────────────┘
         ↑                    ↑
         │ HTTP 80/443         │ Internal network
         │                     │
      Browser          Docker internal
                        networking
```

---

End of Architecture Diagrams
