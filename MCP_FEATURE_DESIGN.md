# MCP Tools Configuration Feature - TDD Design Document

## Overview

Add support for dynamically configuring MCP (Model Context Protocol) servers when launching agents, allowing users to specify which MCP tools/servers the agent should have access to.

## Research Findings

### Claude CLI MCP Support

Claude CLI provides two key flags for MCP configuration:

1. **`--mcp-config <configs...>`**: Load MCP servers from JSON files or strings
2. **`--strict-mcp-config`**: Only use servers from `--mcp-config`, ignoring global configs

### MCP Configuration Format

MCP servers are configured using JSON matching the `claude_desktop_config.json` format:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

### Transport Types

MCP supports three transport types:
- **stdio**: Standard input/output communication (most common)
- **http**: HTTP-based communication
- **sse**: Server-Sent Events

## Architecture Design

### 1. Domain Layer

#### Value Objects

**`McpServerConfig.vo.ts`** - Represents a single MCP server configuration

```typescript
export interface McpServerConfigData {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http' | 'sse';
}

export class McpServerConfig {
  private constructor(
    public readonly name: string,
    public readonly command: string,
    public readonly args: string[],
    public readonly env: Record<string, string>,
    public readonly transport: 'stdio' | 'http' | 'sse'
  ) {}

  static create(data: McpServerConfigData): McpServerConfig {
    // Validation:
    // - name: non-empty, alphanumeric + hyphens
    // - command: non-empty
    // - args: valid array
    // - env: valid key-value pairs
    // - transport: valid enum value
  }

  toJSON(): object {
    // Convert to claude_desktop_config.json format
    return {
      command: this.command,
      args: this.args,
      env: this.env,
    };
  }
}
```

**`McpConfiguration.vo.ts`** - Collection of MCP servers

```typescript
export interface McpConfigurationData {
  servers: McpServerConfigData[];
  strict?: boolean; // Use --strict-mcp-config flag
}

export class McpConfiguration {
  private constructor(
    public readonly servers: Map<string, McpServerConfig>,
    public readonly strict: boolean
  ) {}

  static create(data: McpConfigurationData): McpConfiguration {
    // Validation:
    // - servers: non-empty array
    // - no duplicate server names
    // - each server is valid
  }

  toClaudeConfigJSON(): string {
    // Convert to JSON string for --mcp-config flag
    const mcpServers = {};
    this.servers.forEach((server, name) => {
      mcpServers[name] = server.toJSON();
    });
    return JSON.stringify({ mcpServers });
  }

  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }
}
```

### 2. Application Layer (DTO)

**`launch-agent.dto.ts`** - Update existing DTO

```typescript
export interface McpServerDto {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http' | 'sse';
}

export interface AgentConfigurationDto {
  // ... existing fields
  mcp?: {
    servers?: McpServerDto[];
    strict?: boolean;
  };
}
```

### 3. Domain Layer (Session)

**`session.vo.ts`** - Update Session configuration

```typescript
export interface AgentConfiguration {
  // ... existing fields
  mcp?: McpConfiguration; // Use the value object
}
```

### 4. Infrastructure Layer

#### Adapters

**`claude-python-proxy.adapter.ts`** - Update to pass MCP config

```typescript
// In streamFromProxy method:
if (session.configuration.mcp) {
  requestBody.mcp_config = session.configuration.mcp.toClaudeConfigJSON();
  requestBody.mcp_strict = session.configuration.mcp.strict;
}
```

**`claude-sdk.adapter.ts`** - Update SDK adapter (if SDK supports MCP)

```typescript
// Similar approach if SDK has MCP support
```

#### Python Proxy Service

**`app/main.py`** - Update request model

```python
class StartAgentRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    model: Optional[str] = None
    working_directory: Optional[str] = None
    mcp_config: Optional[str] = None  # JSON string
    mcp_strict: Optional[bool] = False
```

**`app/claude_runner.py`** - Update command builder

```python
def _build_command(self, prompt: str, options: Dict[str, Any]) -> str:
    # ... existing code

    # Add MCP configuration
    if mcp_config := options.get("mcp_config"):
        # Escape JSON string for shell
        escaped_json = json.dumps(mcp_config)
        command += f" --mcp-config '{escaped_json}'"

        if options.get("mcp_strict", False):
            command += " --strict-mcp-config"
```

## TDD Implementation Plan

### Phase 1: Domain Layer (Value Objects)

**Test File**: `backend/test/unit/domain/value-objects/mcp-server-config.vo.spec.ts`

Tests to write (RED → GREEN → REFACTOR):
1. ✅ Should create valid MCP server config with all fields
2. ✅ Should create config with minimal fields (command only)
3. ✅ Should validate server name (non-empty, alphanumeric + hyphens)
4. ✅ Should validate command (non-empty)
5. ✅ Should default transport to 'stdio'
6. ✅ Should validate transport enum
7. ✅ Should convert to JSON format correctly
8. ✅ Should handle environment variables
9. ❌ Should reject empty server name
10. ❌ Should reject invalid server name characters
11. ❌ Should reject empty command

**Test File**: `backend/test/unit/domain/value-objects/mcp-configuration.vo.spec.ts`

Tests to write:
1. ✅ Should create configuration with multiple servers
2. ✅ Should create configuration with strict mode enabled
3. ✅ Should convert to Claude config JSON format
4. ✅ Should get list of server names
5. ✅ Should handle empty servers list
6. ❌ Should reject duplicate server names
7. ❌ Should reject invalid servers
8. ✅ Should generate valid JSON string for --mcp-config flag

### Phase 2: DTO Layer

**Test File**: `backend/test/unit/application/dto/launch-agent.dto.spec.ts`

Tests to add:
1. ✅ Should accept MCP configuration in DTO
2. ✅ Should convert DTO MCP to domain McpConfiguration
3. ✅ Should handle missing MCP configuration (optional)
4. ✅ Should validate MCP server DTOs
5. ✅ Should pass through to AgentConfiguration correctly

### Phase 3: Session Value Object

**Test File**: `backend/test/unit/domain/value-objects/session.vo.spec.ts`

Tests to add:
1. ✅ Should create session with MCP configuration
2. ✅ Should create session without MCP configuration
3. ✅ Should include MCP in session serialization

### Phase 4: Infrastructure Layer (Adapters)

**Test File**: `backend/test/unit/infrastructure/adapters/claude-python-proxy.adapter.spec.ts`

Tests to add:
1. ✅ Should extract MCP config from session
2. ✅ Should pass MCP JSON to Python proxy
3. ✅ Should pass strict flag when enabled
4. ✅ Should not pass MCP if not configured
5. ✅ Should handle MCP config in request body

### Phase 5: Python Proxy Service

**Test File**: `claude-proxy-service/tests/test_mcp_config.py`

Tests to write:
1. ✅ Should accept mcp_config in request
2. ✅ Should pass mcp_config to command builder
3. ✅ Should generate --mcp-config flag correctly
4. ✅ Should generate --strict-mcp-config flag when enabled
5. ✅ Should escape JSON string properly for shell
6. ✅ Should handle missing MCP config

### Phase 6: Integration Tests

**Test File**: `backend/test/integration/mcp-configuration.integration.spec.ts`

Tests to write:
1. ✅ Should launch agent with single MCP server
2. ✅ Should launch agent with multiple MCP servers
3. ✅ Should launch agent with strict MCP mode
4. ✅ Should launch agent with MCP environment variables
5. ✅ Should launch agent without MCP (backward compatibility)
6. ✅ Should reject invalid MCP configuration

### Phase 7: Smoke Tests (Real CLI)

**Test File**: `backend/test/e2e/smoke/mcp-configuration.smoke.spec.ts`

Tests to write (requires real MCP servers):
1. ✅ Should launch Claude agent with filesystem MCP server
2. ✅ Should launch agent with custom MCP server
3. ✅ Should verify MCP tools are available to agent
4. ✅ Should isolate agent with strict mode

## API Usage Examples

### Example 1: Single MCP Server (Filesystem)

```bash
POST /api/agents
Content-Type: application/json

{
  "type": "claude-code",
  "prompt": "List files in the current directory using MCP tools",
  "configuration": {
    "workingDirectory": "/home/user/projects",
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
        }
      ]
    }
  }
}
```

### Example 2: Multiple MCP Servers

```bash
POST /api/agents
Content-Type: application/json

{
  "type": "claude-code",
  "prompt": "Search the web and analyze local files",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
        },
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

### Example 3: Strict Mode (Isolated MCP)

```bash
POST /api/agents
Content-Type: application/json

{
  "type": "claude-code",
  "prompt": "Use only the filesystem tool, nothing else",
  "configuration": {
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/safe-dir"]
        }
      ],
      "strict": true
    }
  }
}
```

## SOLID Principles Applied

### Single Responsibility Principle (SRP)
- `McpServerConfig`: Represents a single server configuration
- `McpConfiguration`: Manages collection of servers
- Each layer has a focused responsibility

### Open/Closed Principle (OCP)
- Can add new MCP transport types without modifying existing code
- Configuration format is extensible via JSON

### Liskov Substitution Principle (LSP)
- McpConfiguration can be null/undefined (optional feature)
- Backward compatible with existing agent launches

### Interface Segregation Principle (ISP)
- MCP configuration is optional in AgentConfiguration
- Clients not using MCP don't see MCP complexity

### Dependency Inversion Principle (DIP)
- Application layer depends on domain abstractions (McpConfiguration)
- Infrastructure adapts domain model to CLI format

## Error Handling

### Validation Errors

```typescript
// Domain layer throws descriptive errors
throw new Error('MCP server name must be alphanumeric with hyphens only');
throw new Error('Duplicate MCP server name: filesystem');
throw new Error('MCP server command cannot be empty');
```

### Runtime Errors

```typescript
// Infrastructure layer logs and handles gracefully
if (mcpConfigError) {
  this.logger.error('Failed to configure MCP servers', { error });
  // Continue with agent launch without MCP
  // OR reject the launch if MCP is critical
}
```

## Migration Path

### Backward Compatibility

All existing agent launches continue to work without changes:

```typescript
// Old requests (no MCP) still work
POST /api/agents
{
  "type": "claude-code",
  "prompt": "Hello world"
  // No configuration.mcp field
}
```

### Incremental Adoption

Users can gradually adopt MCP configuration:

1. **Phase 1**: Launch agents without MCP (current behavior)
2. **Phase 2**: Add MCP servers as needed
3. **Phase 3**: Use strict mode for security/isolation

## Performance Considerations

### JSON String Generation

- MCP config JSON generated once per agent launch
- Cached in Session value object
- No performance impact on message streaming

### CLI Startup Time

- MCP servers may add ~100-500ms to agent startup
- Acceptable for the added functionality
- Document in user guide

## Security Considerations

### Environment Variables

- MCP server env vars passed through subprocess
- Should validate/sanitize API keys
- Consider encryption for sensitive values in storage

### Command Injection

- All MCP config validated in domain layer
- Command/args properly escaped in Python subprocess
- JSON string properly escaped for shell

### Strict Mode

- Recommended for production environments
- Isolates agent from global MCP servers
- Prevents unintended tool access

## Documentation Updates

### Files to Update

1. `CLAUDE.md` - Add MCP configuration section
2. `docs/api-reference.md` - Document MCP endpoints
3. `docs/setup-guide.md` - MCP setup instructions
4. `SPECIFICATION.md` - Update system design
5. Create `docs/mcp-guide.md` - Comprehensive MCP guide

## Success Criteria

✅ All unit tests pass (100% coverage on new code)
✅ All integration tests pass
✅ At least 2 smoke tests with real MCP servers
✅ Backward compatibility maintained (existing tests pass)
✅ Documentation complete
✅ Code review approved
✅ Performance acceptable (<500ms overhead)

## Estimated Effort

- Phase 1 (Domain): 2-3 hours
- Phase 2 (DTO): 1 hour
- Phase 3 (Session): 30 minutes
- Phase 4 (Adapters): 2 hours
- Phase 5 (Python): 1-2 hours
- Phase 6 (Integration): 2 hours
- Phase 7 (Smoke): 2-3 hours
- Documentation: 1-2 hours

**Total**: 12-16 hours

## Next Steps

1. Review this design document
2. Get approval on architecture approach
3. Start Phase 1: Domain layer TDD implementation
4. Proceed through phases sequentially
5. Update documentation continuously

---

**Design Version**: 1.0
**Last Updated**: 2025-12-02
**Status**: Ready for Review
