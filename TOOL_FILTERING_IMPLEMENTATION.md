# Tool Filtering Implementation - Complete Guide

## Overview

This document describes the end-to-end implementation of tool filtering for Claude Code agents. Tool filtering allows agents to be launched with restricted access to MCP tools via the `--allowed-tools` and `--disallowed-tools` CLI flags.

**Status**: ✅ COMPLETE - Fully implemented and tested

**Date**: 2025-12-03

## Architecture Overview

Tool filtering flows through multiple layers of the system:

```
Frontend/API Request
    ↓
LaunchAgentDto (DTO Layer)
    ↓
AgentConfiguration (Domain Layer)
    ↓
Session Value Object (Domain Layer)
    ↓
ClaudePythonProxyAdapter (Infrastructure Layer)
    ↓
Python Proxy HTTP Request
    ↓
Python FastAPI Service (main.py)
    ↓
ClaudeRunner (claude_runner.py)
    ↓
Claude CLI Command (--allowed-tools / --disallowed-tools)
```

## Implementation Details

### 1. DTO Layer (`LaunchAgentDto`)

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend/src/application/dto/launch-agent.dto.ts`

**Fields**:
```typescript
export interface AgentConfigurationDto {
  allowedTools?: string[];      // List of allowed tool names
  disallowedTools?: string[];   // List of disallowed tool names
  // ... other fields
}
```

**Conversion to Domain**:
```typescript
toAgentConfiguration(): AgentConfiguration {
  const config: AgentConfiguration = {};

  if (this.configuration.allowedTools) {
    config.allowedTools = this.configuration.allowedTools;
  }

  if (this.configuration.disallowedTools) {
    config.disallowedTools = this.configuration.disallowedTools;
  }

  return config;
}
```

### 2. Domain Layer (`AgentConfiguration`)

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend/src/domain/value-objects/session.vo.ts`

**Interface**:
```typescript
export interface AgentConfiguration {
  allowedTools?: string[];
  disallowedTools?: string[];
  // ... other fields
}
```

**Session Value Object**:
```typescript
export class Session {
  readonly prompt: string;
  readonly configuration: AgentConfiguration;

  static create(prompt: string, configuration: AgentConfiguration): Session {
    // Configuration is validated and stored immutably
    return new Session(prompt, configuration);
  }
}
```

### 3. Infrastructure Layer (`ClaudePythonProxyAdapter`)

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend/src/infrastructure/adapters/claude-python-proxy.adapter.ts`

**Request Body Building** (lines 229-236):
```typescript
// Add tool filtering if configured
if (session.configuration.allowedTools) {
  requestBody.allowed_tools = session.configuration.allowedTools;
}

if (session.configuration.disallowedTools) {
  requestBody.disallowed_tools = session.configuration.disallowedTools;
}
```

**HTTP Request**:
```typescript
const response = await fetch(`${this.proxyUrl}/agent/stream`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),  // Contains allowed_tools and disallowed_tools
});
```

### 4. Python Proxy Service (`main.py`)

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service/app/main.py`

**Request Model** (lines 34-44):
```python
class StartAgentRequest(BaseModel):
    """Request to start a new agent"""

    prompt: str
    session_id: Optional[str] = None
    model: Optional[str] = None
    working_directory: Optional[str] = None
    mcp_config: Optional[str] = None
    mcp_strict: Optional[bool] = False
    allowed_tools: Optional[list[str]] = None      # NEW
    disallowed_tools: Optional[list[str]] = None   # NEW
```

**Options Building** (`/agent/start` and `/agent/stream` endpoints):
```python
# Build options
options: Dict[str, any] = {}
if request.session_id:
    options["session_id"] = request.session_id
if request.model:
    options["model"] = request.model
if request.working_directory:
    options["working_directory"] = request.working_directory
if request.mcp_config:
    options["mcp_config"] = request.mcp_config
if request.mcp_strict:
    options["mcp_strict"] = request.mcp_strict
if request.allowed_tools:
    options["allowed_tools"] = request.allowed_tools      # NEW
if request.disallowed_tools:
    options["disallowed_tools"] = request.disallowed_tools  # NEW

# Start Claude process
process = claude_runner.start_agent(request.prompt, options)
```

### 5. Claude Runner (`claude_runner.py`)

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service/app/claude_runner.py`

**Command Building** (lines 198-206):
```python
# Add allowed tools if provided
if "allowed_tools" in options and options["allowed_tools"]:
    tools_list = ",".join(options["allowed_tools"])
    parts.extend(["--allowed-tools", tools_list])

# Add disallowed tools if provided
if "disallowed_tools" in options and options["disallowed_tools"]:
    tools_list = ",".join(options["disallowed_tools"])
    parts.extend(["--disallowed-tools", tools_list])

return " ".join(parts)
```

## Generated CLI Commands

### Example 1: Allowed Tools Only

**Configuration**:
```typescript
{
  allowedTools: ['Read', 'Write', 'Grep']
}
```

**Generated CLI Command**:
```bash
claude -p "Your prompt" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --allowed-tools Read,Write,Grep
```

### Example 2: Disallowed Tools Only

**Configuration**:
```typescript
{
  disallowedTools: ['Bash', 'Edit']
}
```

**Generated CLI Command**:
```bash
claude -p "Your prompt" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --disallowed-tools Bash,Edit
```

### Example 3: Both Allowed and Disallowed

**Configuration**:
```typescript
{
  allowedTools: ['Read', 'Grep'],
  disallowedTools: ['Bash', 'Write']
}
```

**Generated CLI Command**:
```bash
claude -p "Your prompt" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --allowed-tools Read,Grep \
  --disallowed-tools Bash,Write
```

### Example 4: With MCP Configuration

**Configuration**:
```typescript
{
  mcp: {
    servers: [{
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem']
    }]
  },
  allowedTools: ['Read', 'mcp__filesystem__read_file']
}
```

**Generated CLI Command**:
```bash
claude -p "Your prompt" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --mcp-config '{"mcpServers":{"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}}}' \
  --allowed-tools Read,mcp__filesystem__read_file
```

## Data Flow Example

### Complete Request Flow

1. **Frontend sends request**:
```json
POST /api/agents/launch
{
  "type": "claude-code",
  "prompt": "Help me review the code",
  "configuration": {
    "allowedTools": ["Read", "Grep"],
    "disallowedTools": ["Bash", "Edit"]
  }
}
```

2. **DTO validation and conversion**:
```typescript
const dto = new LaunchAgentDto();
dto.type = "claude-code";
dto.prompt = "Help me review the code";
dto.configuration = {
  allowedTools: ["Read", "Grep"],
  disallowedTools: ["Bash", "Edit"]
};

const agentConfig = dto.toAgentConfiguration();
// agentConfig.allowedTools = ["Read", "Grep"]
// agentConfig.disallowedTools = ["Bash", "Edit"]
```

3. **Session creation**:
```typescript
const session = Session.create("Help me review the code", agentConfig);
// session.configuration.allowedTools = ["Read", "Grep"]
// session.configuration.disallowedTools = ["Bash", "Edit"]
```

4. **TypeScript adapter sends to Python proxy**:
```typescript
const requestBody = {
  prompt: "Help me review the code",
  allowed_tools: ["Read", "Grep"],
  disallowed_tools: ["Bash", "Edit"]
};

fetch('http://localhost:8000/agent/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
});
```

5. **Python proxy receives and processes**:
```python
request = StartAgentRequest(
    prompt="Help me review the code",
    allowed_tools=["Read", "Grep"],
    disallowed_tools=["Bash", "Edit"]
)

options = {
    "allowed_tools": ["Read", "Grep"],
    "disallowed_tools": ["Bash", "Edit"]
}

process = claude_runner.start_agent(request.prompt, options)
```

6. **Claude runner builds command**:
```python
command = [
    "claude",
    "-p", '"Help me review the code"',
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--allowed-tools", "Read,Grep",
    "--disallowed-tools", "Bash,Edit"
]

# Executes: claude -p "Help me review the code" --output-format stream-json --verbose --include-partial-messages --allowed-tools Read,Grep --disallowed-tools Bash,Edit
```

## Testing

### Python Tests

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service/tests/test_tool_filtering.py`

**Coverage**:
- Single allowed tool
- Multiple allowed tools
- Single disallowed tool
- Multiple disallowed tools
- Both allowed and disallowed together
- Empty arrays handling
- Tool filtering with other options (session_id, model, working_directory)
- Tool filtering with MCP configuration
- MCP tool names (e.g., `mcp__filesystem__read_file`)
- Special characters in tool names

**Run tests**:
```bash
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/claude-proxy-service
source venv/bin/activate
pytest tests/test_tool_filtering.py -v
```

### TypeScript Tests

**File**: `/home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend/test/unit/infrastructure/adapters/claude-python-proxy.adapter.spec.ts`

**Coverage**:
- Allowed tools passed to request body
- Disallowed tools passed to request body
- Both allowed and disallowed tools
- No tool filtering when not configured
- MCP tool names in allowed_tools
- Tool filtering with MCP configuration
- Empty tool arrays

**Run tests**:
```bash
cd /home/dev/projects/mcp-management-system/dev/headless-agent-manager/backend
npm test -- claude-python-proxy.adapter.spec.ts
```

## Edge Cases and Limitations

### Edge Cases Handled

1. **Empty Arrays**: Empty arrays are passed through but not converted to CLI flags
   - `allowedTools: []` → No `--allowed-tools` flag added
   - `disallowedTools: []` → No `--disallowed-tools` flag added

2. **MCP Tool Names**: Tool names with special characters are handled correctly
   - `mcp__filesystem__read_file` → Passed as-is in comma-separated list
   - `custom-tool` → Passed as-is in comma-separated list

3. **Both Filters Together**: Both allowed and disallowed can be specified simultaneously
   - CLI receives both `--allowed-tools` and `--disallowed-tools` flags
   - Claude CLI resolves the precedence

4. **Tool Filtering with MCP**: Works seamlessly with MCP configuration
   - MCP servers can be configured
   - MCP tools can be filtered alongside built-in tools

### Known Limitations

1. **No Validation of Tool Names**: The system does not validate that tool names are valid
   - Invalid tool names are passed to Claude CLI
   - Claude CLI handles validation and errors

2. **No Conflict Resolution**: If both allowed and disallowed contain the same tool
   - Both are passed to Claude CLI
   - Claude CLI resolves the conflict (typically disallowed takes precedence)

3. **Case Sensitivity**: Tool names are case-sensitive
   - `Read` and `read` are treated as different tools
   - Must match exact tool names from Claude CLI

## Error Handling

### TypeScript Layer

```typescript
// No explicit error handling needed - if fields are undefined, they're simply not included
if (session.configuration.allowedTools) {
  requestBody.allowed_tools = session.configuration.allowedTools;
}
```

### Python Layer

```python
# Optional fields with default None - no error if not provided
allowed_tools: Optional[list[str]] = None

# Check before adding to options
if request.allowed_tools:
    options["allowed_tools"] = request.allowed_tools
```

### Claude CLI Layer

- If invalid tool names are provided, Claude CLI will error
- Error is captured in stderr and streamed back through SSE
- Frontend receives error event and can display to user

## Integration with Existing Features

### Works With

1. **Session Management**: Tool filtering persists across session continuations
2. **MCP Configuration**: Can filter both built-in and MCP tools
3. **Working Directory**: Tool filtering independent of working directory
4. **Model Selection**: Tool filtering independent of model choice
5. **Custom Instructions**: Tool filtering applied regardless of instructions

### Independent Of

- Output format (always `stream-json` for proxy)
- Verbose mode (always enabled for streaming)
- Timeout configuration
- Metadata fields

## Usage Examples

### Basic Read-Only Agent

```typescript
const config: AgentConfigurationDto = {
  allowedTools: ['Read', 'Grep', 'Glob']
};
```

### Agent Without Shell Access

```typescript
const config: AgentConfigurationDto = {
  disallowedTools: ['Bash']
};
```

### Research Agent (No Modifications)

```typescript
const config: AgentConfigurationDto = {
  allowedTools: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
  disallowedTools: ['Write', 'Edit', 'Bash', 'NotebookEdit']
};
```

### MCP-Enhanced Read-Only Agent

```typescript
const config: AgentConfigurationDto = {
  mcp: {
    servers: [{
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/data']
    }]
  },
  allowedTools: [
    'Read',
    'Grep',
    'mcp__filesystem__read_file',
    'mcp__filesystem__search_files'
  ],
  disallowedTools: [
    'Write',
    'Edit',
    'Bash',
    'mcp__filesystem__write_file'
  ]
};
```

## Future Enhancements

### Potential Improvements

1. **Tool Name Validation**:
   - Validate tool names against a known list
   - Provide helpful error messages for typos
   - Auto-complete for tool names in frontend

2. **Preset Configurations**:
   - Pre-defined tool sets (read-only, researcher, developer)
   - User-saveable presets
   - Organization-wide policies

3. **Dynamic Tool Discovery**:
   - Query available tools from Claude CLI
   - List available MCP tools from configured servers
   - Real-time tool availability checking

4. **Conflict Detection**:
   - Detect tool conflicts before sending to CLI
   - Warn if tool is both allowed and disallowed
   - Suggest resolution strategies

5. **Tool Usage Analytics**:
   - Track which tools are actually used
   - Identify unused allowed tools
   - Recommend optimal tool sets

## Troubleshooting

### Issue: Tool filtering not working

**Symptoms**: Agent has access to all tools despite configuration

**Checks**:
1. Verify `allowedTools` or `disallowedTools` in request body
2. Check Python proxy logs for received options
3. Inspect generated CLI command in logs
4. Ensure Claude CLI version supports `--allowed-tools`/`--disallowed-tools`

**Debug**:
```bash
# Check Python proxy logs
tail -f /path/to/proxy/logs

# Manually test CLI command
claude -p "test" --allowed-tools Read,Write
```

### Issue: Tools not being passed to Python proxy

**Symptoms**: Request body doesn't contain `allowed_tools`/`disallowed_tools`

**Checks**:
1. Verify DTO has `allowedTools`/`disallowedTools` populated
2. Check `toAgentConfiguration()` conversion
3. Verify `Session.configuration` has the fields
4. Check adapter is reading from `session.configuration`

**Debug**:
```typescript
// Add logging in adapter
console.log('Session config:', JSON.stringify(session.configuration));
console.log('Request body:', JSON.stringify(requestBody));
```

### Issue: Python command building fails

**Symptoms**: Claude CLI not receiving tool flags

**Checks**:
1. Verify `options` dict has `allowed_tools`/`disallowed_tools`
2. Check `_build_command()` receives options
3. Verify comma-joining of tool lists
4. Check final command string

**Debug**:
```python
# Add logging in claude_runner.py
print(f"Options received: {options}")
print(f"Built command: {command}")
```

## Conclusion

Tool filtering is now fully implemented across all layers of the system:

- ✅ DTO layer accepts and validates tool filtering
- ✅ Domain layer stores tool filtering in `AgentConfiguration`
- ✅ Infrastructure adapter passes tool filtering to Python proxy
- ✅ Python proxy receives and processes tool filtering
- ✅ Claude runner builds CLI commands with tool flags
- ✅ Comprehensive tests for both Python and TypeScript
- ✅ Documentation complete with examples

The implementation follows existing patterns (MCP configuration) and maintains consistency with the codebase architecture.
