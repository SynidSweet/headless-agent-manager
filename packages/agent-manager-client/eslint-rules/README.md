# ESLint Rules for @headless-agent-manager/client

Custom ESLint rules to prevent common mistakes when using this module.

## Available Rules

### `no-raw-message-access`

**Prevents direct access to raw message state without aggregation.**

This rule detects patterns like:

```typescript
// ❌ Detected by this rule
const messages = useSelector(state => state.messages.byAgentId[id]?.messages);
```

And suggests using:

```typescript
// ✅ Recommended
const messages = useSelector(state => selectAggregatedMessagesForAgent(state, id));
```

**Why?** Accessing raw state bypasses message aggregation, causing duplicate messages in your UI (streaming tokens + complete message).

---

## Setup Options

### Option 1: Simple Approach (TypeScript Only) ⭐ RECOMMENDED

If you're using TypeScript, the easiest way is to add type-safe helper hooks:

```typescript
// hooks/useMessages.ts
import { useSelector } from 'react-redux';
import { selectAggregatedMessagesForAgent } from '@headless-agent-manager/client';
import type { RootState } from '@headless-agent-manager/client';

/**
 * Type-safe hook for accessing aggregated messages.
 * Prevents raw state access by not exposing the full state.
 */
export function useAgentMessages(agentId: string | null) {
  return useSelector((state: RootState) => {
    if (!agentId) return [];
    return selectAggregatedMessagesForAgent(state, agentId);
  });
}

// Usage in components
function MyComponent({ agentId }: { agentId: string }) {
  const messages = useAgentMessages(agentId); // ✅ Safe, aggregated
  // Can't access raw state - no escape hatch!
}
```

**Benefits:**
- ✅ No ESLint setup required
- ✅ TypeScript enforces correct usage
- ✅ Simpler, less configuration
- ✅ Works immediately

---

### Option 2: ESLint Rule (Advanced)

For stricter compile-time checking, use the custom ESLint rule.

#### Step 1: Install Dependencies

```bash
npm install --save-dev eslint @eslint/eslintrc
```

#### Step 2: Copy Rule to Your Project

```bash
mkdir -p .eslint-rules
cp node_modules/@headless-agent-manager/client/eslint-rules/no-raw-message-access.js .eslint-rules/
```

#### Step 3: Configure ESLint

Create or update `.eslintrc.js`:

```javascript
const noRawMessageAccess = require('./.eslint-rules/no-raw-message-access');

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['local'],
  rules: {
    // Custom rule to prevent raw message access
    'local/no-raw-message-access': 'error',
  },
  settings: {
    // Register the custom rule
    'local-rules': {
      'no-raw-message-access': noRawMessageAccess,
    },
  },
};
```

#### Step 4: Install eslint-plugin-local

```bash
npm install --save-dev eslint-plugin-local
```

#### Step 5: Run ESLint

```bash
npx eslint src/**/*.ts src/**/*.tsx
```

---

## Testing the Rule

Run the rule tests to verify it works correctly:

```bash
cd node_modules/@headless-agent-manager/client/eslint-rules
node no-raw-message-access.test.js
```

Expected output:
```
✅ All ESLint rule tests passed!
```

---

## Examples

### ❌ Code That Triggers the Rule

```typescript
// Direct state access
const messages = useSelector(state =>
  state.messages.byAgentId[agentId]?.messages
);

// Custom selector without aggregation
const selectMyMessages = createSelector(
  [state => state.messages.byAgentId[id]],
  (agentMessages) => agentMessages?.messages  // ❌ No aggregation!
);

// Destructuring raw state
const messages = useSelector(state => {
  const { messages } = state.messages.byAgentId[id] || {};
  return messages; // ❌ Raw messages
});
```

### ✅ Code That Passes the Rule

```typescript
// Using aggregated selector
const messages = useSelector(state =>
  selectAggregatedMessagesForAgent(state, agentId)
);

// Using recommended selector for selected agent
const messages = useSelector(selectAggregatedMessagesForSelectedAgent);

// Custom selector WITH aggregation
import { aggregateStreamingTokens } from '@headless-agent-manager/client';

const selectMyMessages = createSelector(
  [state => state.messages.byAgentId[id]],
  (agentMessages) => {
    const raw = agentMessages?.messages || [];
    return aggregateStreamingTokens(raw); // ✅ Aggregated!
  }
);

// Using UNSAFE selector (explicitly allowed for debugging)
const rawMessages = useSelector(state =>
  selectRawMessagesForAgent_UNSAFE(state, agentId)
);
```

---

## Error Messages

When the rule detects raw message access, you'll see:

```
error: Direct access to raw message state detected. This causes duplicate messages in the UI!
Instead of: state.messages.byAgentId[agentId]?.messages
Use: selectAggregatedMessagesForAgent(state, agentId)

See: https://github.com/your-org/headless-agent-manager#critical-always-use-aggregated-message-selectors
```

---

## Comparison: TypeScript vs ESLint

| Feature | TypeScript Approach | ESLint Rule |
|---------|-------------------|-------------|
| Setup complexity | Low (just create hooks) | Medium (install + configure) |
| Compile-time detection | ✅ Yes | ✅ Yes |
| IDE integration | ✅ Immediate | ⚠️ Requires ESLint plugin |
| Catches all cases | ⚠️ If hooks used consistently | ✅ Catches all patterns |
| Maintenance | Low (just code) | Medium (rule updates) |
| **Recommendation** | ⭐ Start here | Add if needed |

---

## Troubleshooting

### Rule not triggering

1. **Check ESLint is running**: `npx eslint --version`
2. **Verify rule is loaded**: Add `console.log('Rule loaded')` to rule file
3. **Check file patterns**: Ensure ESLint is scanning your TS/TSX files
4. **Verify parser**: Must use `@typescript-eslint/parser` for TypeScript

### False positives

If the rule triggers on valid code:

1. **Add ESLint disable comment**:
   ```typescript
   // eslint-disable-next-line local/no-raw-message-access
   const messages = state.messages.byAgentId[id]?.messages;
   ```

2. **Use the UNSAFE selector** (makes intent clear):
   ```typescript
   const messages = useSelector(state =>
     selectRawMessagesForAgent_UNSAFE(state, id)
   );
   ```

### False negatives

If the rule doesn't catch a pattern:

1. **File an issue** with the code example
2. **Use TypeScript hooks** as a fallback (recommended anyway)

---

## Contributing

To improve the rule:

1. Add test cases to `no-raw-message-access.test.js`
2. Run tests: `node no-raw-message-access.test.js`
3. Update rule logic in `no-raw-message-access.js`
4. Document changes in this README

---

## References

- [ESLint Custom Rules Documentation](https://eslint.org/docs/latest/developer-guide/working-with-rules)
- [ESLint RuleTester](https://eslint.org/docs/latest/developer-guide/nodejs-api#ruletester)
- [Main Module README](../README.md#critical-always-use-aggregated-message-selectors)
