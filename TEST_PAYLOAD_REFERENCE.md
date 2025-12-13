# Test Payload Structure Reference

Complete guide to test payloads for the Headless AI Agent Management System.

## Table of Contents
- [Basic Launch Payload](#basic-launch-payload)
- [Complete Configuration](#complete-configuration)
- [MCP Configuration](#mcp-configuration)
- [Working Directory](#working-directory)
- [Combined Examples](#combined-examples)
- [Validation Rules](#validation-rules)
- [Error Examples](#error-examples)

---

## Basic Launch Payload

### Minimal Required Payload
```json
{
  "type": "claude-code",
  "prompt": "Say hello"
}
```

**Required Fields:**
- `type` (string): Agent type - must be `"claude-code"` or `"gemini-cli"`
- `prompt` (string): The prompt to send to the agent - cannot be empty

**Response:**
```json
{
  "agentId": "agent-uuid-here",
  "status": "initializing",
  "type": "claude-code",
  "createdAt": "2025-12-13T10:00:00.000Z"
}
```

---

## Complete Configuration

### Full Configuration Options
```json
{
  "type": "claude-code",
  "prompt": "Analyze this project",
  "configuration": {
    "outputFormat": "stream-json",
    "sessionId": "session-uuid-here",
    "instructions": "Custom instructions that replace CLAUDE.md files",
    "customArgs": ["--verbose", "--debug"],
    "metadata": {
      "project": "my-app",
      "version": "1.0.0"
    },
    "timeout": 300000,
    "allowedTools": ["Bash", "Read", "Write"],
    "disallowedTools": ["WebSearch"],
    "workingDirectory": "/home/user/my-project",
    "conversationName": "Project Analysis",
    "model": "claude-sonnet-4-5-20250929",
    "mcp": {
      "servers": [...],
      "strict": true
    }
  }
}
```

### Configuration Field Details

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `outputFormat` | string | No | CLI output format | `"stream-json"` |
| `sessionId` | string | No | Resume previous session | `"session-abc123"` |
| `instructions` | string | No | Custom instructions (max 100k chars) | `"Follow these rules..."` |
| `customArgs` | string[] | No | Additional CLI arguments | `["--verbose"]` |
| `metadata` | object | No | Custom metadata for tracking | `{"key": "value"}` |
| `timeout` | number | No | Timeout in milliseconds | `300000` |
| `allowedTools` | string[] | No | Tools the agent can use | `["Bash", "Read"]` |
| `disallowedTools` | string[] | No | Tools the agent cannot use | `["WebSearch"]` |
| `workingDirectory` | string | No | Agent execution directory | `"/tmp/test"` |
| `conversationName` | string | No | UI display name (max 100 chars) | `"My Task"` |
| `model` | string | No | Claude model to use | `"claude-opus-4-20250514"` |
| `mcp` | object | No | MCP server configuration | See [MCP Configuration](#mcp-configuration) |

---

## MCP Configuration

### Single MCP Server
```json
{
  "type": "claude-code",
  "prompt": "List files in the project",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
        }
      ]
    }
  }
}
```

### MCP Server with Environment Variables
```json
{
  "type": "claude-code",
  "prompt": "Search for best practices",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "brave-search",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"],
          "env": {
            "BRAVE_API_KEY": "your-api-key-here"
          }
        }
      ]
    }
  }
}
```

### Multiple MCP Servers
```json
{
  "type": "claude-code",
  "prompt": "Analyze files and search web",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/project"]
        },
        {
          "name": "brave-search",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"],
          "env": {
            "BRAVE_API_KEY": "your-key"
          }
        },
        {
          "name": "github",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "gh_token_here"
          }
        }
      ]
    }
  }
}
```

### MCP Strict Mode
```json
{
  "type": "claude-code",
  "prompt": "Run isolated task",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
        }
      ],
      "strict": true
    }
  }
}
```

**Strict Mode:**
- `strict: true` - Agent ONLY uses specified MCP servers (ignores global MCP config)
- `strict: false` (default) - Agent uses both specified and global MCP servers

### MCP Server Configuration Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | Yes | Server identifier (alphanumeric + `-_`) | `"filesystem"` |
| `command` | string | Yes | Command to start server | `"npx"` |
| `args` | string[] | No | Command arguments | `["-y", "@model..."]` |
| `env` | object | No | Environment variables | `{"API_KEY": "..."}` |
| `transport` | string | No | Transport type | `"stdio"` (default) |

**Transport Types:**
- `stdio` (default) - Standard input/output
- `http` - HTTP transport
- `sse` - Server-Sent Events

---

## Working Directory

### Absolute Path
```json
{
  "type": "claude-code",
  "prompt": "Read package.json",
  "configuration": {
    "workingDirectory": "/home/user/my-project"
  }
}
```

### Relative Path
```json
{
  "type": "claude-code",
  "prompt": "Run tests",
  "configuration": {
    "workingDirectory": "./test-project"
  }
}
```

**Notes:**
- Absolute paths: `/home/user/project`
- Relative paths: `./my-project` (relative to backend CWD)
- Default: Backend's current working directory

---

## Combined Examples

### Example 1: Full-Featured Development Agent
```json
{
  "type": "claude-code",
  "prompt": "Analyze the codebase and suggest improvements",
  "configuration": {
    "workingDirectory": "/home/user/my-app",
    "conversationName": "Code Review",
    "model": "claude-sonnet-4-5-20250929",
    "allowedTools": ["Bash", "Read", "Grep", "Write"],
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/my-app"]
        },
        {
          "name": "github",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "gh_your_token_here"
          }
        }
      ],
      "strict": false
    },
    "metadata": {
      "projectId": "proj-123",
      "userId": "user-456"
    }
  }
}
```

### Example 2: Isolated Testing Agent
```json
{
  "type": "claude-code",
  "prompt": "Run unit tests and report coverage",
  "configuration": {
    "workingDirectory": "/tmp/test-env",
    "conversationName": "Test Run",
    "timeout": 600000,
    "allowedTools": ["Bash"],
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/test-env"]
        }
      ],
      "strict": true
    }
  }
}
```

### Example 3: Multi-Turn Conversation
```json
{
  "type": "claude-code",
  "prompt": "Continue from previous session",
  "configuration": {
    "sessionId": "session-abc123-def456",
    "workingDirectory": "/home/user/project",
    "conversationName": "Ongoing Work"
  }
}
```

### Example 4: Custom Instructions Agent
```json
{
  "type": "claude-code",
  "prompt": "Implement the feature as specified",
  "configuration": {
    "instructions": "You are a senior developer. Follow TDD principles. Write tests first. Use TypeScript strict mode.",
    "workingDirectory": "/home/user/feature-branch",
    "conversationName": "Feature Development",
    "allowedTools": ["Bash", "Read", "Write", "Edit"]
  }
}
```

### Example 5: Research Agent with Web Search
```json
{
  "type": "claude-code",
  "prompt": "Research best practices for React performance optimization",
  "configuration": {
    "conversationName": "Research Task",
    "model": "claude-opus-4-20250514",
    "mcp": {
      "servers": [
        {
          "name": "brave-search",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"],
          "env": {
            "BRAVE_API_KEY": "BSA_your_api_key_here"
          }
        }
      ]
    },
    "metadata": {
      "taskType": "research",
      "topic": "react-performance"
    }
  }
}
```

---

## Validation Rules

### Agent Type Validation
```typescript
// ✅ Valid
type: "claude-code"
type: "gemini-cli"

// ❌ Invalid
type: ""           // Error: Agent type is required
type: "invalid"    // Error: Invalid agent type
```

### Prompt Validation
```typescript
// ✅ Valid
prompt: "Say hello"
prompt: "Multi-line\nprompt\nhere"

// ❌ Invalid
prompt: ""         // Error: Prompt is required
prompt: "   "      // Error: Prompt is required (whitespace only)
```

### Conversation Name Validation
```typescript
// ✅ Valid
conversationName: "My Task"
conversationName: "A".repeat(100)  // Exactly 100 chars

// ❌ Invalid
conversationName: ""               // Error: Cannot be empty
conversationName: "   "            // Error: Cannot be empty (whitespace)
conversationName: "A".repeat(101)  // Error: Max 100 characters
```

### MCP Server Name Validation
```typescript
// ✅ Valid
name: "filesystem"
name: "brave-search"
name: "my_server_123"

// ❌ Invalid
name: ""                    // Error: Name cannot be empty
name: "invalid@name!"       // Error: Only alphanumeric, hyphens, underscores
name: "duplicate"           // Error: Duplicate server names not allowed
```

### MCP Command Validation
```typescript
// ✅ Valid
command: "npx"
command: "/usr/bin/python"

// ❌ Invalid
command: ""                 // Error: Command cannot be empty
```

### MCP Transport Validation
```typescript
// ✅ Valid
transport: "stdio"
transport: "http"
transport: "sse"
transport: undefined        // Uses default: "stdio"

// ❌ Invalid
transport: "invalid"        // Error: Must be stdio, http, or sse
```

---

## Error Examples

### 400 Bad Request - Missing Type
```json
{
  "prompt": "Say hello"
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Agent type is required",
  "error": "Bad Request"
}
```

### 400 Bad Request - Missing Prompt
```json
{
  "type": "claude-code"
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Prompt is required",
  "error": "Bad Request"
}
```

### 400 Bad Request - Invalid Agent Type
```json
{
  "type": "invalid-type",
  "prompt": "Say hello"
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid agent type: invalid-type. Must be one of: claude-code, gemini-cli",
  "error": "Bad Request"
}
```

### 400 Bad Request - Conversation Name Too Long
```json
{
  "type": "claude-code",
  "prompt": "Test",
  "configuration": {
    "conversationName": "A".repeat(101)
  }
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Conversation name must be 100 characters or less",
  "error": "Bad Request"
}
```

### 400 Bad Request - Invalid MCP Server Name
```json
{
  "type": "claude-code",
  "prompt": "Test",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "invalid@name!",
          "command": "npx"
        }
      ]
    }
  }
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Server name must contain only alphanumeric characters, hyphens, and underscores",
  "error": "Bad Request"
}
```

### 400 Bad Request - Duplicate MCP Server Names
```json
{
  "type": "claude-code",
  "prompt": "Test",
  "configuration": {
    "mcp": {
      "servers": [
        { "name": "filesystem", "command": "cmd1" },
        { "name": "filesystem", "command": "cmd2" }
      ]
    }
  }
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Duplicate MCP server name: filesystem",
  "error": "Bad Request"
}
```

### 400 Bad Request - Empty MCP Command
```json
{
  "type": "claude-code",
  "prompt": "Test",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "test",
          "command": ""
        }
      ]
    }
  }
}
```
**Response:**
```json
{
  "statusCode": 400,
  "message": "Command cannot be empty",
  "error": "Bad Request"
}
```

---

## Quick Reference Table

### Common Test Scenarios

| Scenario | Type | Prompt | Configuration |
|----------|------|--------|---------------|
| Minimal | `claude-code` | `"Hello"` | `{}` |
| Custom Directory | `claude-code` | `"Read files"` | `{ workingDirectory: "/tmp" }` |
| MCP Filesystem | `claude-code` | `"List files"` | `{ mcp: { servers: [filesystem] } }` |
| MCP Web Search | `claude-code` | `"Search web"` | `{ mcp: { servers: [brave-search] } }` |
| Multi-MCP | `claude-code` | `"Use tools"` | `{ mcp: { servers: [fs, search] } }` |
| Strict MCP | `claude-code` | `"Isolated"` | `{ mcp: { strict: true, ... } }` |
| Custom Model | `claude-code` | `"Task"` | `{ model: "claude-opus-4-..." }` |
| Named Conversation | `claude-code` | `"Work"` | `{ conversationName: "My Task" }` |
| Tool Restrictions | `claude-code` | `"Safe task"` | `{ allowedTools: ["Read"] }` |
| With Metadata | `claude-code` | `"Track this"` | `{ metadata: { key: "val" } }` |

---

## Testing with cURL

### Basic Test
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "claude-code",
    "prompt": "Say hello"
  }'
```

### With MCP Configuration
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "claude-code",
    "prompt": "List files",
    "configuration": {
      "workingDirectory": "/tmp",
      "mcp": {
        "servers": [
          {
            "name": "filesystem",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
          }
        ]
      }
    }
  }'
```

### Check Agent Status
```bash
# Replace AGENT_ID with the agentId from launch response
curl http://localhost:3000/api/agents/AGENT_ID/status
```

### Get Agent Messages
```bash
curl http://localhost:3000/api/agents/AGENT_ID/messages
```

### Terminate Agent
```bash
curl -X DELETE http://localhost:3000/api/agents/AGENT_ID
```

---

## TypeScript Types

### Complete Type Definitions
```typescript
// Agent type enumeration
type AgentType = 'claude-code' | 'gemini-cli';

// MCP server configuration
interface McpServerDto {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http' | 'sse';
}

// MCP configuration
interface McpConfigurationDto {
  servers?: McpServerDto[];
  strict?: boolean;
}

// Agent configuration
interface AgentConfigurationDto {
  outputFormat?: string;
  sessionId?: string;
  instructions?: string;
  customArgs?: string[];
  metadata?: Record<string, unknown>;
  timeout?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  workingDirectory?: string;
  conversationName?: string;
  model?: string;
  mcp?: McpConfigurationDto;
}

// Launch agent request
interface LaunchAgentDto {
  type: AgentType;
  prompt: string;
  configuration?: AgentConfigurationDto;
}

// Launch agent response
interface LaunchAgentResponse {
  agentId: string;
  status: 'initializing' | 'running' | 'completed' | 'failed';
  type: AgentType;
  createdAt: string;
}
```

---

## Implementation Files

**Backend:**
- DTO: `/backend/src/application/dto/launch-agent.dto.ts`
- Domain: `/backend/src/domain/value-objects/session.vo.ts`
- Domain: `/backend/src/domain/value-objects/mcp-configuration.vo.ts`
- Adapter: `/backend/src/infrastructure/adapters/claude-python-proxy.adapter.ts`
- Controller: `/backend/src/presentation/controllers/agent.controller.ts`

**Tests:**
- Unit Tests: `/backend/test/unit/application/dto/launch-agent.dto.spec.ts`
- Smoke Tests: `/backend/test/e2e/smoke/python-proxy.smoke.spec.ts`
- Integration: `/backend/test/integration/adapters/claude-python-proxy.integration.spec.ts`

---

**Last Updated**: 2025-12-13
**API Version**: v1
**Related Docs**:
- [SPECIFICATION.md](/SPECIFICATION.md)
- [MCP_FEATURE_DESIGN.md](/MCP_FEATURE_DESIGN.md)
- [E2E_TESTING_GUIDE.md](/E2E_TESTING_GUIDE.md)
