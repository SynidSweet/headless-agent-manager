# API Reference

## Overview

This document provides complete API reference for the Headless AI Agent Management System.

**Base URLs:**
- REST API: `http://localhost:3000/api`
- WebSocket: `ws://localhost:3001/ws`

**Authentication:** None (MVP) - Will be added in future versions

---

## REST API Endpoints

### Providers Resource

#### Get Available Providers

**Endpoint:** `GET /api/providers`

**Description:** Retrieve all available agent providers (Claude Code, Gemini CLI) with their supported models and capabilities

**Request Example:**
```
GET /api/providers
```

**Response:** `200 OK`
```json
{
  "totalCount": 2,
  "providers": [
    {
      "type": "claude-code",
      "name": "Claude Code",
      "description": "Anthropic Claude AI agent with advanced coding capabilities",
      "isAvailable": true,
      "capabilities": {
        "streaming": true,
        "multiTurn": true,
        "toolUse": true,
        "fileAccess": true,
        "customInstructions": true,
        "mcpSupport": true,
        "modelSelection": true
      },
      "models": [
        {
          "id": "claude-sonnet-4-5-20250929",
          "name": "Claude Sonnet 4.5",
          "description": "Best model for complex agents and coding tasks with optimal balance of intelligence, speed, and cost",
          "contextWindow": 200000,
          "capabilities": ["streaming", "tool-use", "vision", "file-access", "multi-turn"],
          "isAvailable": true,
          "isDefault": true,
          "costTier": "medium"
        },
        {
          "id": "claude-opus-4-5-20251101",
          "name": "Claude Opus 4.5",
          "description": "Most intelligent model with 80.9% SWE-bench score, best for complex reasoning",
          "contextWindow": 200000,
          "capabilities": ["streaming", "tool-use", "vision", "file-access", "multi-turn"],
          "isAvailable": true,
          "isDefault": false,
          "costTier": "high"
        },
        {
          "id": "claude-haiku-4-5-20251001",
          "name": "Claude Haiku 4.5",
          "description": "Fastest model with near-frontier performance, optimized for high-volume tasks",
          "contextWindow": 200000,
          "capabilities": ["streaming", "tool-use", "vision", "file-access", "multi-turn"],
          "isAvailable": true,
          "isDefault": false,
          "costTier": "low"
        }
      ]
    },
    {
      "type": "gemini-cli",
      "name": "Gemini CLI",
      "description": "Google Gemini AI agent with massive context windows and multimodal capabilities",
      "isAvailable": true,
      "capabilities": {
        "streaming": true,
        "multiTurn": true,
        "toolUse": true,
        "fileAccess": true,
        "customInstructions": false,
        "mcpSupport": false,
        "modelSelection": true
      },
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "description": "Most capable Gemini model with 1M token context and adaptive thinking",
          "contextWindow": 1000000,
          "capabilities": ["streaming", "tool-use", "vision", "multimodal", "audio", "video"],
          "isAvailable": true,
          "isDefault": true,
          "costTier": "medium"
        },
        {
          "id": "gemini-2.5-flash",
          "name": "Gemini 2.5 Flash",
          "description": "Fast, efficient model with excellent multimodal capabilities",
          "contextWindow": 1000000,
          "capabilities": ["streaming", "tool-use", "vision", "multimodal", "audio", "video"],
          "isAvailable": true,
          "isDefault": false,
          "costTier": "low"
        }
      ]
    }
  ]
}
```

**Response Fields:**

**Provider Object:**
- `type`: Provider identifier (claude-code, gemini-cli)
- `name`: Human-readable provider name
- `description`: Provider description
- `isAvailable`: Whether provider is currently available
- `capabilities`: Provider-level capabilities object
- `models`: Array of available models

**Model Object:**
- `id`: Model identifier for API requests
- `name`: Human-readable model name
- `description`: Model description and use case
- `contextWindow`: Maximum context window in tokens
- `capabilities`: Array of model capabilities
- `isAvailable`: Whether model is currently available
- `isDefault`: Whether this is the default model for the provider
- `costTier`: Cost level (low, medium, high)

**Capabilities Object:**
- `streaming`: Real-time message streaming
- `multiTurn`: Multi-turn conversations
- `toolUse`: Function calling and tool use
- `fileAccess`: File system access
- `customInstructions`: Custom system prompts
- `mcpSupport`: Model Context Protocol support
- `modelSelection`: Model selection at launch

**Use Cases:**
- Frontend UI: Populate provider/model selection dropdowns
- API clients: Discover available agent types and models
- Validation: Check if a provider/model is available before launching
- Documentation: Auto-generate provider documentation

**Performance:** Response time < 100ms (in-memory static data)

---

### Agents Resource

#### Create Agent (Launch)

**Endpoint:** `POST /api/agents`

**Description:** Launch a new AI agent instance

**Request Body:**
```json
{
  "type": "claude-code" | "gemini-cli",
  "prompt": "string (required, min: 1 char)",
  "configuration": {
    "sessionId": "string (optional, for resume)",
    "outputFormat": "stream-json (default)",
    "customArgs": ["string"] (optional)
  }
}
```

**Request Example:**
```json
{
  "type": "claude-code",
  "prompt": "Create a function to calculate fibonacci numbers",
  "configuration": {
    "outputFormat": "stream-json"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "claude-code",
  "status": "initializing",
  "createdAt": "2025-11-09T12:00:00.000Z",
  "startedAt": null,
  "completedAt": null
}
```

**Error Responses:**

`400 Bad Request` - Invalid request body
```json
{
  "statusCode": 400,
  "message": [
    "prompt should not be empty",
    "type must be one of: claude-code, gemini-cli"
  ],
  "error": "Bad Request"
}
```

`500 Internal Server Error` - Agent launch failed
```json
{
  "statusCode": 500,
  "message": "Failed to launch agent: CLI not found",
  "error": "Internal Server Error"
}
```

---

#### List Agents

**Endpoint:** `GET /api/agents`

**Description:** Retrieve all agents or filter by status

**Query Parameters:**
- `status` (optional): Filter by status (initializing, running, completed, failed, terminated)
- `type` (optional): Filter by agent type (claude-code, gemini-cli)
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Request Example:**
```
GET /api/agents?status=running&type=claude-code&limit=10
```

**Response:** `200 OK`
```json
{
  "agents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "claude-code",
      "status": "running",
      "createdAt": "2025-11-09T12:00:00.000Z",
      "startedAt": "2025-11-09T12:00:01.234Z",
      "completedAt": null
    },
    {
      "id": "660f9511-f3ac-52e5-b827-557766551111",
      "type": "claude-code",
      "status": "running",
      "createdAt": "2025-11-09T12:05:00.000Z",
      "startedAt": "2025-11-09T12:05:02.456Z",
      "completedAt": null
    }
  ],
  "total": 2,
  "limit": 10,
  "offset": 0
}
```

---

#### Get Agent Details

**Endpoint:** `GET /api/agents/:id`

**Description:** Retrieve detailed information about a specific agent

**Path Parameters:**
- `id`: Agent UUID

**Request Example:**
```
GET /api/agents/550e8400-e29b-41d4-a716-446655440000
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "claude-code",
  "status": "running",
  "session": {
    "id": "session-abc-123",
    "prompt": "Create a function to calculate fibonacci numbers",
    "messageCount": 5,
    "lastMessageAt": "2025-11-09T12:05:30.000Z"
  },
  "createdAt": "2025-11-09T12:00:00.000Z",
  "startedAt": "2025-11-09T12:00:01.234Z",
  "completedAt": null,
  "metadata": {
    "processId": 12345,
    "cliVersion": "1.2.3"
  }
}
```

**Error Responses:**

`404 Not Found` - Agent not found
```json
{
  "statusCode": 404,
  "message": "Agent 550e8400-e29b-41d4-a716-446655440000 not found",
  "error": "Not Found"
}
```

---

#### Terminate Agent

**Endpoint:** `DELETE /api/agents/:id`

**Description:** Gracefully terminate a running agent

**Path Parameters:**
- `id`: Agent UUID

**Request Example:**
```
DELETE /api/agents/550e8400-e29b-41d4-a716-446655440000
```

**Response:** `204 No Content`

**Error Responses:**

`404 Not Found` - Agent not found
```json
{
  "statusCode": 404,
  "message": "Agent 550e8400-e29b-41d4-a716-446655440000 not found",
  "error": "Not Found"
}
```

`409 Conflict` - Agent already terminated
```json
{
  "statusCode": 409,
  "message": "Agent is already terminated",
  "error": "Conflict"
}
```

---

#### Get Agent Status

**Endpoint:** `GET /api/agents/:id/status`

**Description:** Get current status of an agent (lightweight endpoint)

**Path Parameters:**
- `id`: Agent UUID

**Request Example:**
```
GET /api/agents/550e8400-e29b-41d4-a716-446655440000/status
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "timestamp": "2025-11-09T12:10:00.000Z"
}
```

---

### Health Check

#### System Health

**Endpoint:** `GET /api/health`

**Description:** Check system health status

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2025-11-09T12:00:00.000Z",
  "uptime": 3600,
  "services": {
    "database": "ok",
    "websocket": "ok"
  },
  "agents": {
    "active": 5,
    "total": 12
  }
}
```

**Unhealthy Response:** `503 Service Unavailable`
```json
{
  "status": "degraded",
  "timestamp": "2025-11-09T12:00:00.000Z",
  "services": {
    "database": "ok",
    "websocket": "error"
  },
  "errors": [
    "WebSocket server not responding"
  ]
}
```

---

## WebSocket API

### Connection

**URL:** `ws://localhost:3001/ws`

**Protocol:** Socket.IO or native WebSocket (to be determined during implementation)

**Connection Example (Socket.IO):**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

---

### Client → Server Events

#### Subscribe to Agent

**Event:** `subscribe`

**Description:** Subscribe to real-time updates from a specific agent

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example:**
```javascript
socket.emit('subscribe', {
  agentId: '550e8400-e29b-41d4-a716-446655440000'
});
```

**Response:** Server will start sending agent events to this client

**Error Handling:**
```javascript
socket.on('error', (error) => {
  console.error('Subscription error:', error);
  // error = { code: 'AGENT_NOT_FOUND', message: '...' }
});
```

---

#### Unsubscribe from Agent

**Event:** `unsubscribe`

**Description:** Stop receiving updates from a specific agent

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example:**
```javascript
socket.emit('unsubscribe', {
  agentId: '550e8400-e29b-41d4-a716-446655440000'
});
```

---

### Server → Client Events

#### Agent Message

**Event:** `agent:message`

**Description:** New message from agent (streaming output)

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-09T12:05:30.123Z",
  "message": {
    "type": "assistant" | "user" | "system" | "error",
    "role": "assistant",
    "content": "I'll create a fibonacci function for you...",
    "metadata": {
      "toolUse": null,
      "thinking": false
    }
  }
}
```

**Example Handler:**
```javascript
socket.on('agent:message', (data) => {
  console.log(`[${data.agentId}] ${data.message.content}`);

  // Update UI with streaming message
  appendMessageToUI(data.agentId, data.message);
});
```

**Message Types:**

- **`assistant`**: AI agent response
  ```json
  {
    "type": "assistant",
    "content": "Here's the fibonacci function...",
    "metadata": {}
  }
  ```

- **`user`**: Echo of user input
  ```json
  {
    "type": "user",
    "content": "Create a fibonacci function",
    "metadata": {}
  }
  ```

- **`system`**: System messages (init, result, etc.)
  ```json
  {
    "type": "system",
    "role": "init",
    "content": "Session started",
    "metadata": { "sessionId": "abc-123" }
  }
  ```

- **`error`**: Error messages
  ```json
  {
    "type": "error",
    "content": "CLI process exited with code 1",
    "metadata": { "code": 1, "signal": null }
  }
  ```

---

#### Agent Status Change

**Event:** `agent:status`

**Description:** Agent status changed

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running" | "completed" | "failed" | "terminated",
  "timestamp": "2025-11-09T12:05:30.123Z",
  "previousStatus": "initializing"
}
```

**Example Handler:**
```javascript
socket.on('agent:status', (data) => {
  console.log(`Agent ${data.agentId} status: ${data.status}`);

  // Update UI status indicator
  updateAgentStatus(data.agentId, data.status);
});
```

---

#### Agent Error

**Event:** `agent:error`

**Description:** Agent encountered an error

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-09T12:05:30.123Z",
  "error": {
    "code": "CLI_SPAWN_ERROR",
    "message": "Failed to spawn claude process",
    "details": {
      "errno": -2,
      "syscall": "spawn claude",
      "path": "claude"
    }
  }
}
```

**Example Handler:**
```javascript
socket.on('agent:error', (data) => {
  console.error(`Agent ${data.agentId} error:`, data.error);

  // Show error notification
  showErrorNotification(data.error.message);
});
```

**Common Error Codes:**
- `CLI_NOT_FOUND`: CLI executable not found
- `CLI_SPAWN_ERROR`: Failed to spawn process
- `CLI_CRASH`: Process crashed unexpectedly
- `PARSE_ERROR`: Failed to parse CLI output
- `TIMEOUT`: Agent exceeded timeout limit

---

#### Agent Complete

**Event:** `agent:complete`

**Description:** Agent completed execution

**Payload:**
```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-09T12:10:00.000Z",
  "result": {
    "status": "success" | "failed",
    "duration": 298567,
    "messageCount": 42,
    "stats": {
      "tokensUsed": 1234,
      "apiCalls": 5
    }
  }
}
```

**Example Handler:**
```javascript
socket.on('agent:complete', (data) => {
  console.log(`Agent ${data.agentId} completed in ${data.result.duration}ms`);

  // Show completion notification
  showCompletionNotification(data.agentId, data.result);

  // Optionally unsubscribe
  socket.emit('unsubscribe', { agentId: data.agentId });
});
```

---

#### Connection Events

**Event:** `connect`

**Description:** Successfully connected to WebSocket server

**Payload:** None

**Example:**
```javascript
socket.on('connect', () => {
  console.log('Connected with ID:', socket.id);

  // Re-subscribe to agents after reconnection
  resubscribeToActiveAgents();
});
```

---

**Event:** `disconnect`

**Description:** Disconnected from WebSocket server

**Payload:**
```json
{
  "reason": "transport close" | "ping timeout" | "server disconnect"
}
```

**Example:**
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  if (reason === 'io server disconnect') {
    // Server initiated disconnect, reconnect manually
    socket.connect();
  }
  // Otherwise, socket.io will auto-reconnect
});
```

---

**Event:** `error`

**Description:** Connection or subscription error

**Payload:**
```json
{
  "code": "AGENT_NOT_FOUND" | "SUBSCRIPTION_LIMIT_REACHED" | "UNAUTHORIZED",
  "message": "Error description"
}
```

**Example:**
```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error);

  switch(error.code) {
    case 'AGENT_NOT_FOUND':
      // Handle missing agent
      break;
    case 'SUBSCRIPTION_LIMIT_REACHED':
      // Handle subscription limit
      break;
  }
});
```

---

## Data Types

### Agent

```typescript
interface Agent {
  id: string;                    // UUID
  type: 'claude-code' | 'gemini-cli';
  status: AgentStatus;
  session: Session;
  createdAt: string;             // ISO 8601
  startedAt?: string;            // ISO 8601
  completedAt?: string;          // ISO 8601
  metadata?: Record<string, any>;
}
```

### AgentStatus

```typescript
enum AgentStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated'
}
```

### Session

```typescript
interface Session {
  id: string;
  prompt: string;
  configuration: AgentConfiguration;
  messageCount: number;
  lastMessageAt?: string;        // ISO 8601
  conversationHistory?: Message[];
}
```

### AgentConfiguration

```typescript
interface AgentConfiguration {
  sessionId?: string;            // For resume
  outputFormat?: 'stream-json' | 'json';
  customArgs?: string[];
  timeout?: number;              // Milliseconds
  allowedTools?: string[];
  disallowedTools?: string[];
}
```

### AgentMessage

```typescript
interface AgentMessage {
  type: 'assistant' | 'user' | 'system' | 'error';
  role?: string;
  content: string | object;
  metadata?: Record<string, any>;
}
```

### AgentResult

```typescript
interface AgentResult {
  status: 'success' | 'failed';
  duration: number;              // Milliseconds
  messageCount: number;
  stats?: {
    tokensUsed?: number;
    apiCalls?: number;
    [key: string]: any;
  };
}
```

### AgentError

```typescript
interface AgentError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
```

---

## Rate Limiting (Future)

Currently no rate limiting in MVP. Future implementation:

```
Rate Limit: 60 requests per minute per client
Headers:
  X-RateLimit-Limit: 60
  X-RateLimit-Remaining: 45
  X-RateLimit-Reset: 1699520400

Response when exceeded (429 Too Many Requests):
{
  "statusCode": 429,
  "message": "Rate limit exceeded. Try again in 30 seconds",
  "error": "Too Many Requests"
}
```

---

## CORS Configuration

**Allowed Origins (Development):**
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Backend)

**Allowed Methods:**
- GET, POST, PUT, DELETE, OPTIONS

**Allowed Headers:**
- Content-Type, Authorization

---

## Example Usage

### Complete Flow Example

**1. Launch Agent:**
```javascript
// POST /api/agents
const response = await fetch('http://localhost:3000/api/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'claude-code',
    prompt: 'Create a todo app',
    configuration: {}
  })
});

const agent = await response.json();
// { id: '550e8400...', status: 'initializing', ... }
```

**2. Connect WebSocket:**
```javascript
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected');
});
```

**3. Subscribe to Agent:**
```javascript
socket.emit('subscribe', { agentId: agent.id });
```

**4. Receive Messages:**
```javascript
socket.on('agent:message', (data) => {
  console.log('Message:', data.message.content);
});

socket.on('agent:status', (data) => {
  console.log('Status:', data.status);
});

socket.on('agent:complete', (data) => {
  console.log('Completed!', data.result);
  socket.emit('unsubscribe', { agentId: agent.id });
});
```

**5. Monitor via REST:**
```javascript
// Poll for status updates (alternative to WebSocket)
const interval = setInterval(async () => {
  const response = await fetch(
    `http://localhost:3000/api/agents/${agent.id}/status`
  );
  const status = await response.json();

  if (status.status === 'completed') {
    clearInterval(interval);
  }
}, 1000);
```

---

## OpenAPI/Swagger Documentation

Once implemented, interactive API documentation will be available at:

**URL:** `http://localhost:3000/api-docs`

This will provide:
- Interactive API testing
- Request/response examples
- Schema definitions
- Authentication flows (future)

---

**Last Updated**: 2025-11-09
**Status**: Draft - Will be updated during implementation
