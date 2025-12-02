/**
 * Tests for no-raw-message-access ESLint rule
 * Uses ESLint's RuleTester to validate the rule behavior
 */

const { RuleTester } = require('eslint');
const rule = require('./no-raw-message-access');

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('no-raw-message-access', rule, {
  valid: [
    // ✅ Using aggregated selector (CORRECT)
    {
      code: 'import { selectAggregatedMessagesForAgent } from "@headless-agent-manager/client"; const messages = useSelector(state => selectAggregatedMessagesForAgent(state, agentId));',
    },

    // ✅ Using aggregated selector for selected agent (CORRECT)
    {
      code: 'import { selectAggregatedMessagesForSelectedAgent } from "@headless-agent-manager/client"; const messages = useSelector(selectAggregatedMessagesForSelectedAgent);',
    },

    // ✅ Using deprecated but safe selector (CORRECT)
    {
      code: 'const messages = useSelector(state => selectMessagesForAgent(state, agentId));',
    },

    // ✅ Accessing other state properties (not messages)
    {
      code: 'const agents = useSelector(state => state.agents.byId);',
    },

    // ✅ Accessing connection state (not messages)
    {
      code: 'const isConnected = useSelector(state => state.connection.isConnected);',
    },

    // ✅ Using UNSAFE selector (explicitly allowed for debugging)
    {
      code: 'const rawMessages = useSelector(state => selectRawMessagesForAgent_UNSAFE(state, agentId));',
    },

    // ✅ Accessing messages.byAgentId but not .messages property
    {
      code: 'const agentMessages = useSelector(state => state.messages.byAgentId[agentId]);',
    },

    // ✅ Accessing lastSequence (safe)
    {
      code: 'const lastSeq = useSelector(state => state.messages.byAgentId[agentId]?.lastSequence);',
    },

    // ✅ Accessing loading state (safe)
    {
      code: 'const loading = useSelector(state => state.messages.byAgentId[agentId]?.loading);',
    },
  ],

  invalid: [
    // ❌ Direct access to raw messages (WRONG)
    {
      code: 'const messages = useSelector(state => state.messages.byAgentId[agentId]?.messages);',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },

    // ❌ Direct access without optional chaining (WRONG)
    {
      code: 'const messages = useSelector(state => state.messages.byAgentId[agentId].messages);',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },

    // ❌ Direct access with string literal agentId (WRONG)
    {
      code: 'const messages = useSelector(state => state.messages.byAgentId["agent-123"]?.messages);',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },

    // ❌ Direct access in arrow function (WRONG)
    {
      code: 'const getMessages = (state, id) => state.messages.byAgentId[id]?.messages;',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },

    // ❌ Direct access with 's' as state variable (WRONG)
    {
      code: 'const messages = useSelector(s => s.messages.byAgentId[id]?.messages);',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },

    // ❌ Direct access with rootState variable (WRONG)
    {
      code: 'const messages = useSelector(rootState => rootState.messages.byAgentId[id]?.messages);',
      errors: [
        {
          messageId: 'rawMessageAccess',
          type: 'MemberExpression',
        },
      ],
    },
  ],
});

console.log('✅ All ESLint rule tests passed!');
