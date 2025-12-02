# Module API Improvement Proposal

**Status**: Draft
**Created**: 2025-12-01
**Purpose**: Make streaming deduplication impossible to miss

## Problem Statement

The current module API hides critical deduplication behavior behind generic names. Developers (including AI agents) can easily access raw state and miss the aggregation logic, leading to duplicate messages in the UI.

### Evidence

1. **User encountered duplicates in another project** - didn't realize selector was needed
2. **Selector name doesn't indicate behavior** - `selectMessagesForAgent` doesn't mention deduplication
3. **Raw state access is too easy** - `state.messages.byAgentId[id].messages` bypasses aggregation
4. **Documentation is buried** - README has one note about aggregation (line 178)

---

## Current API Analysis

### Message Selectors (Current)

```typescript
// ❌ UNCLEAR: Name doesn't indicate deduplication
export const selectMessagesForAgent = createSelector(...);

// ❌ UNCLEAR: Name doesn't indicate deduplication
export const selectMessagesForSelectedAgent = createSelector(...);

// ✅ CLEAR: Utility name is descriptive
export function aggregateStreamingTokens(messages: AgentMessage[]): AgentMessage[];
```

### Current Usage Pattern

```typescript
// ❌ DANGEROUS: Easy to bypass deduplication
const messages = useSelector((state) => state.messages.byAgentId[agentId]?.messages);

// ✅ CORRECT: But not obvious this is required
const messages = useSelector((state) => selectMessagesForAgent(state, agentId));
```

---

## Proposed Improvements

### 1. Rename Selectors to Be Explicit

**Principle**: The selector name should indicate it performs aggregation/deduplication.

```typescript
// OPTION A: Focus on aggregation (streaming behavior)
export const selectAggregatedMessagesForAgent = createSelector(...);
export const selectAggregatedMessagesForSelectedAgent = createSelector(...);

// OPTION B: Focus on deduplication (duplicate prevention)
export const selectDeduplicatedMessagesForAgent = createSelector(...);
export const selectDeduplicatedMessagesForSelectedAgent = createSelector(...);

// OPTION C: Be completely explicit (verbose but clear)
export const selectStreamingAggregatedMessagesForAgent = createSelector(...);
export const selectStreamingAggregatedMessagesForSelectedAgent = createSelector(...);

// OPTION D: Add "Display" to indicate UI-ready
export const selectDisplayMessagesForAgent = createSelector(...);
export const selectDisplayMessagesForSelectedAgent = createSelector(...);
```

**Recommendation**: **Option A - Focus on Aggregation**
- "Aggregated" clearly indicates transformation
- Streaming is the common case
- Shorter than Option C
- More accurate than "Display"

### 2. Add Raw Selectors with Warning Names

Provide raw access but make it obvious it's dangerous:

```typescript
/**
 * @deprecated Use selectAggregatedMessagesForAgent instead
 * @warning Returns RAW messages including streaming tokens - NO deduplication applied
 * @internal For testing/debugging only
 */
export const selectRawMessagesForAgent_UNSAFE = (
  state: RootState,
  agentId: string
): AgentMessage[] => {
  return state.messages.byAgentId[agentId]?.messages || [];
};
```

### 3. Add Type-Safe Helper Hook

Create a hook that enforces correct usage:

```typescript
/**
 * Hook for accessing agent messages with automatic aggregation.
 *
 * This hook automatically:
 * - Fetches historical messages when agent selected
 * - Aggregates streaming tokens (typing effect)
 * - Removes duplicate complete messages
 * - Provides real-time WebSocket updates
 *
 * @example
 * ```tsx
 * const { messages, loading, error } = useAgentMessages(agentId);
 *
 * return messages.map(msg => <Message key={msg.id} {...msg} />);
 * ```
 */
export function useAgentMessages(agentId: string | null) {
  const dispatch = useAppDispatch();

  // Uses the CORRECT aggregated selector internally
  const messages = useSelector((state: RootState) => {
    if (!agentId) return [];
    return selectAggregatedMessagesForAgent(state, agentId);
  });

  // ... rest of implementation
}
```

### 4. Improve README Documentation

Add prominent warning at the top:

```markdown
## ⚠️ IMPORTANT: Always Use Aggregated Selectors

**DO NOT access raw state directly!** The module stores individual streaming tokens
in the database. You MUST use the aggregated selectors to prevent duplicate messages
in your UI.

### ❌ WRONG - Will Show Duplicates

```typescript
// This bypasses deduplication - DON'T DO THIS!
const messages = useSelector(state =>
  state.messages.byAgentId[agentId]?.messages
);
```

### ✅ CORRECT - Aggregates Tokens

```typescript
import { selectAggregatedMessagesForAgent } from '@headless-agent-manager/client';

const messages = useSelector(state =>
  selectAggregatedMessagesForAgent(state, agentId)
);
```

### Why This Matters

Claude CLI sends messages in two forms:
1. **Streaming tokens** - Individual characters/words as they're generated
2. **Complete message** - The full message after streaming completes

Without aggregation, your UI will show:
- "H" "e" "l" "l" "o" (5 messages)
- "Hello" (complete message)
- Result: User sees "H" "e" "l" "l" "o" "Hello" (DUPLICATES!)

With aggregation, your UI shows:
- "Hello" (1 aggregated message, duplicate removed)
```

### 5. Add TypeScript Lint Rule (Optional)

Create a custom ESLint rule to warn about raw state access:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    '@headless-agent-manager/no-raw-message-access': 'error'
  }
};

// Rule implementation
// Detects: state.messages.byAgentId[...]?.messages
// Suggests: Use selectAggregatedMessagesForAgent instead
```

---

## Proposed New API

### Core Exports

```typescript
// ========================================
// RECOMMENDED: Aggregated Selectors
// ========================================

/**
 * Select aggregated messages for a specific agent.
 *
 * **Automatically handles:**
 * - Streaming token aggregation (typing effect)
 * - Duplicate complete message removal
 * - Proper message ordering
 *
 * **Use this for UI display!**
 */
export const selectAggregatedMessagesForAgent = createSelector(...);

/**
 * Select aggregated messages for the currently selected agent.
 *
 * **Automatically handles:**
 * - Streaming token aggregation (typing effect)
 * - Duplicate complete message removal
 * - Proper message ordering
 *
 * **Use this for UI display!**
 */
export const selectAggregatedMessagesForSelectedAgent = createSelector(...);

// ========================================
// ADVANCED: Raw Access (Use with caution)
// ========================================

/**
 * Select raw messages WITHOUT aggregation or deduplication.
 *
 * **⚠️ WARNING**: Returns streaming tokens and complete messages separately.
 * This will cause duplicate messages in your UI!
 *
 * **Only use if:**
 * - You're implementing custom aggregation logic
 * - You're debugging message flow
 * - You're testing the aggregation function
 *
 * **For UI display, use**: `selectAggregatedMessagesForAgent`
 *
 * @deprecated Use selectAggregatedMessagesForAgent for UI display
 * @internal For advanced use cases only
 */
export const selectRawMessagesForAgent_UNSAFE = (...);

// ========================================
// UTILITIES
// ========================================

/**
 * Utility function to aggregate streaming tokens and remove duplicates.
 *
 * **You probably don't need this** - use `selectAggregatedMessagesForAgent` instead.
 *
 * Only use this if you're accessing messages outside of Redux selectors.
 */
export function aggregateStreamingTokens(messages: AgentMessage[]): AgentMessage[];
```

### Backward Compatibility

Provide aliases for the old names (deprecated):

```typescript
/**
 * @deprecated Use selectAggregatedMessagesForAgent instead
 * @see selectAggregatedMessagesForAgent
 */
export const selectMessagesForAgent = selectAggregatedMessagesForAgent;

/**
 * @deprecated Use selectAggregatedMessagesForSelectedAgent instead
 * @see selectAggregatedMessagesForSelectedAgent
 */
export const selectMessagesForSelectedAgent = selectAggregatedMessagesForSelectedAgent;
```

---

## Migration Guide

### For Existing Users (Backward Compatible)

**Option 1: No changes needed (using old names)**
```typescript
// Still works! Old names are aliases
const messages = useSelector(state => selectMessagesForAgent(state, agentId));
```

**Option 2: Update to new names (recommended)**
```typescript
// Search and replace:
// selectMessagesForAgent → selectAggregatedMessagesForAgent
// selectMessagesForSelectedAgent → selectAggregatedMessagesForSelectedAgent

const messages = useSelector(state =>
  selectAggregatedMessagesForAgent(state, agentId)
);
```

### For New Users

```typescript
// Clear and obvious - hard to get wrong!
import { selectAggregatedMessagesForAgent } from '@headless-agent-manager/client';

function AgentOutput({ agentId }) {
  const messages = useSelector(state =>
    selectAggregatedMessagesForAgent(state, agentId)
  );

  return messages.map(msg => <Message key={msg.id} {...msg} />);
}
```

---

## Implementation Plan

### Phase 1: Add New Names (Non-Breaking)

1. Add new selector names alongside old ones
2. Mark old names as `@deprecated` in JSDoc
3. Update README with prominent warning
4. Add migration guide to README

**Files to update:**
- `src/store/selectors/index.ts` - Add new exports
- `src/index.ts` - Export new names
- `README.md` - Add warning section
- `test/selectors/selectors.test.ts` - Add tests for new names

**Estimated time**: 1 hour

### Phase 2: Add Raw Access (Optional)

1. Create `selectRawMessagesForAgent_UNSAFE`
2. Add strong warnings in JSDoc
3. Document use cases for raw access
4. Add tests

**Files to update:**
- `src/store/selectors/index.ts` - Add raw selector
- `README.md` - Document raw access
- `test/selectors/selectors.test.ts` - Add tests

**Estimated time**: 30 minutes

### Phase 3: Update Examples and Documentation

1. Update all README examples to use new names
2. Update frontend MVP to use new names
3. Add "Common Pitfalls" section to README
4. Add troubleshooting guide

**Files to update:**
- `README.md` - All examples
- `frontend/src/hooks/useAgentMessages.ts` - Use new names internally
- `frontend/README.md` - Update examples

**Estimated time**: 30 minutes

### Phase 4: Add TypeScript Lint Rule (Optional)

1. Create ESLint plugin for raw state access detection
2. Add to recommended config
3. Document in README

**Estimated time**: 2 hours

---

## Comparison: Before vs After

### Before (Current)

```typescript
// ❌ Problem: Name doesn't indicate deduplication
import { selectMessagesForAgent } from '@headless-agent-manager/client';

const messages = useSelector(state => selectMessagesForAgent(state, agentId));

// Easy to accidentally do this:
const messages = useSelector(state => state.messages.byAgentId[agentId]?.messages);
// ^ No TypeScript error, but shows duplicates in UI!
```

### After (Proposed)

```typescript
// ✅ Solution: Name makes aggregation explicit
import { selectAggregatedMessagesForAgent } from '@headless-agent-manager/client';

const messages = useSelector(state =>
  selectAggregatedMessagesForAgent(state, agentId)
);

// If you try raw access, TypeScript warns you:
import { selectRawMessagesForAgent_UNSAFE } from '@headless-agent-manager/client';
//                                    ^^^^^^ "_UNSAFE" suffix is a clear warning

const messages = useSelector(state =>
  selectRawMessagesForAgent_UNSAFE(state, agentId)
);
// IDE shows @deprecated warning + documentation about why this is dangerous
```

---

## Decision Matrix

| Selector Name | Clarity | Brevity | Backward Compatible | Recommendation |
|--------------|---------|---------|-------------------|----------------|
| `selectMessagesForAgent` | ⚠️ Low | ✅ Short | ✅ Current | ❌ Deprecate |
| `selectAggregatedMessagesForAgent` | ✅ High | ✅ Medium | ✅ Alias | ✅ **RECOMMENDED** |
| `selectDeduplicatedMessagesForAgent` | ✅ High | ✅ Medium | ✅ Alias | ⚠️ Less accurate |
| `selectStreamingAggregatedMessages...` | ✅ Very High | ❌ Long | ✅ Alias | ❌ Too verbose |
| `selectDisplayMessagesForAgent` | ⚠️ Medium | ✅ Medium | ✅ Alias | ❌ Ambiguous |

**Winner**: `selectAggregatedMessagesForAgent`
- Clearly indicates transformation
- Not too long
- Accurate (aggregation is what's happening)
- Easy to search for
- Works well with autocomplete

---

## Open Questions

1. **Should we remove old names in v2.0.0?**
   - Pro: Forces migration to clearer API
   - Con: Breaking change for existing users
   - **Recommendation**: Keep as deprecated aliases forever (no breaking change needed)

2. **Should we add the UNSAFE raw selector?**
   - Pro: Provides escape hatch for advanced users
   - Con: More API surface area
   - **Recommendation**: Yes, but clearly marked as internal/advanced

3. **Should we implement ESLint rule?**
   - Pro: Catches raw state access at compile time
   - Con: Requires separate package, more maintenance
   - **Recommendation**: Phase 4 (optional), evaluate demand first

---

## Success Metrics

After implementation, measure:

1. **GitHub issues about duplicates** - Should drop to zero
2. **README clarity** - User feedback on new warning section
3. **Adoption rate** - How many projects use new names vs old
4. **AI agent success** - Can AI agents find correct selector without help?

Target: **Zero duplicate message bugs in projects using the module**

---

## Next Steps

1. **Review this proposal** - Get feedback from team/users
2. **Implement Phase 1** - Add new names, keep old as aliases
3. **Update documentation** - Prominent warnings in README
4. **Test with new project** - Verify AI agents understand the new API
5. **Gather feedback** - Are the new names clear enough?

---

**Prepared by**: AI Assistant
**For review by**: Development Team
**Target release**: v1.1.0 (non-breaking)
