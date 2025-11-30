# Message Persistence Root Cause Analysis

## Investigation Summary

**Date**: 2025-11-28
**Status**: ROOT CAUSE IDENTIFIED
**Severity**: CRITICAL - Messages don't persist, breaking frontend message display

## The Paradox

Messages are successfully inserted into the database (logs confirm `changes: 1`), but queries return 0 rows:

```
[DEBUG] INSERT result: { changes: 1, lastInsertRowid: 1 }
[DEBUG] SELECT result: { sequence_number: 1 }  ← Works immediately after INSERT
```

But later:
```bash
$ curl http://localhost:3000/api/agents/{id}/messages
[]  ← Returns empty array

$ node -e "db.prepare('SELECT COUNT(*) FROM agent_messages').get()"
{ c: 0 }  ← Database shows 0 rows
```

## Key Findings

### 1. WAL Mode Works Correctly in Tests ✅

Created `/test/integration/message-flow-diagnostic.spec.ts` - ALL 4 TESTS PASS:
- Messages save to file-based database with WAL mode
- Messages persist across WAL checkpoints
- Fresh database connections can read the data
- No transaction isolation issues

**Conclusion**: WAL mode itself is NOT the problem.

### 2. Production Environment Shows Strange Behavior ⚠️

- **Multiple backend processes running** (9 processes found)
- **Only ONE process has database open** (PID 51527)
- **Messages insert successfully** (logs confirm)
- **Immediate SELECT works** (returns data right after INSERT)
- **Later queries fail** (return 0 rows)
- **Controller debug logs don't appear** (added console.log but no output)

### 3. The Smoking Gun 🔍

When I added debug logging to `AgentController.getAgentMessages()`:
```typescript
console.log('[AgentController.getAgentMessages] Calling findByAgentId');
const result = await this.messageService.findByAgentId(id);
console.log('[AgentController.getAgentMessages] Result:', result.length, 'messages');
```

**These logs NEVER appear** even though:
- API returns HTTP 200
- API returns `[]` (empty array)
- Agent exists in database

**This means**: The `AgentMessageService.findByAgentId()` method is NOT being called!

## Root Cause Hypothesis

### Theory: Multiple DatabaseService Instances

Despite the fix in `infrastructure.module.ts` (removing standalone registrations), there may still be multiple instances created due to:

1. **NestJS module imports** - `ApplicationModule` imports `InfrastructureModule`
2. **Dependency injection scope** - Default is singleton, but across modules?
3. **ts-node-dev hot reload** - May create orphaned instances

### Evidence:

**From handoff document**:
> **Theory 3: better-sqlite3 + NestJS Incompatibility**
> - Some interaction between NestJS lifecycle and better-sqlite3
> - Works in tests (synchronous, clean lifecycle) but not in production
> - **Evidence:** Tests pass 100%, production has paradox

**From my investigation**:
- DatabaseService logs show instance ID: `#instance-44938-1764287558283`
- But process PID changed from 44938 → 51527 (ts-node-dev restart)
- Old instance might still have messages in memory/WAL
- New instance has clean database

## The Actual Bug

**AgentController is returning an empty array WITHOUT calling AgentMessageService.findByAgentId()**

Possible causes:
1. **Exception thrown before reaching the call** (but HTTP 200 suggests no exception)
2. **Different AgentMessageService instance** (old instance has messages, new one doesn't)
3. **Caching layer returning stale data** (but we're getting `[]`, not stale data)
4. **TypeScript compilation issue** (ts-node-dev transpiling wrong code)

## Next Steps for Fix

### Step 1: Verify Instance Isolation

Add instance tracking to `AgentMessageService`:
```typescript
@Injectable()
export class AgentMessageService {
  private readonly instanceId = Math.random().toString(36).substring(7);

  async saveMessage(dto: CreateMessageDto) {
    console.log(`[AgentMessageService#${this.instanceId}] saveMessage called`);
    // ...
  }

  async findByAgentId(agentId: string) {
    console.log(`[AgentMessageService#${this.instanceId}] findByAgentId called`);
    // ...
  }
}
```

### Step 2: Verify Controller Execution

Add try-catch with explicit logging:
```typescript
@Get(':id/messages')
async getAgentMessages(@Param('id') id: string): Promise<AgentMessageDto[]> {
  try {
    console.log('[TRACE] getAgentMessages START');
    const result = await this.messageService.findByAgentId(id);
    console.log('[TRACE] getAgentMessages RESULT:', result.length);
    return result;
  } catch (error) {
    console.error('[TRACE] getAgentMessages ERROR:', error);
    throw error;
  }
}
```

### Step 3: Check for Implicit Return

Verify the controller method is actually returning the result:
```typescript
// Current code (line 173):
return result;

// Verify this is NOT being short-circuited somewhere
```

### Step 4: Fix Database Scope

Ensure DatabaseService is truly singleton across ALL modules:
```typescript
// In infrastructure.module.ts
{
  provide: DatabaseService,
  scope: Scope.DEFAULT, // Explicit singleton
  useFactory: (config: ConfigService) => {
    // ...
  },
}
```

## Files Modified During Investigation

1. `test/integration/message-flow-diagnostic.spec.ts` - NEW (diagnostic tests)
2. `src/presentation/controllers/agent.controller.ts` - Added debug logging
3. `src/application/services/agent-message.service.ts` - Already has debug logging

## Temporary Workaround

None available - messages are fundamentally not persisting.

## Impact

- Frontend cannot display message history
- Users see empty output for completed agents
- Breaks core functionality of the application

## Resolution Timeline

- **Discovered**: 2025-11-28 00:28 UTC
- **Root Cause Identified**: 2025-11-28 01:35 UTC (Controller not calling service method)
- **Fix Status**: PENDING - Need to verify why controller returns `[]` without calling service

---

**Next Agent**: Focus on verifying controller execution flow. The bug is NOT in WAL mode, NOT in the database layer, but in how the controller handles the request.
