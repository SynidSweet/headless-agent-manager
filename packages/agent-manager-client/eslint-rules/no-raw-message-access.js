/**
 * ESLint Rule: no-raw-message-access (v3 - Robust AST Traversal)
 *
 * Detects direct access to raw message state that bypasses aggregation.
 *
 * @example
 * // ❌ BAD - Will trigger this rule
 * const messages = useSelector(state => state.messages.byAgentId[id]?.messages);
 *
 * // ✅ GOOD - Recommended approach
 * const messages = useSelector(state => selectAggregatedMessagesForAgent(state, id));
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent direct access to raw message state without aggregation',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/your-org/headless-agent-manager/blob/main/packages/agent-manager-client/eslint-rules/README.md',
    },
    messages: {
      rawMessageAccess: [
        'Direct access to raw message state detected. This causes duplicate messages in the UI!',
        '',
        'Instead of: state.messages.byAgentId[{{agentId}}]?.messages',
        'Use: selectAggregatedMessagesForAgent(state, {{agentId}})',
        '',
        'Why? Claude CLI sends both streaming tokens AND complete messages.',
        'Without aggregation, your UI shows duplicates!',
        '',
        'See: README.md#critical-always-use-aggregated-message-selectors',
      ].join('\n'),
    },
    schema: [],
    fixable: null,
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      MemberExpression(node) {
        // Only check when accessing .messages property
        if (node.property.type !== 'Identifier' || node.property.name !== 'messages') {
          return;
        }

        // Filter out intermediate .messages (like in state.messages.byAgentId)
        // We only want the FINAL .messages (after byAgentId)
        // The final one has object.type === 'MemberExpression', not 'Identifier'
        if (node.object.type === 'Identifier') {
          // This is state.messages (intermediate), skip it
          return;
        }

        // Now we know object is MemberExpression (the FINAL .messages access)
        // object should be: state.messages.byAgentId[agentId]
        const objectNode = node.object;

        // Must be a MemberExpression (the byAgentId[...] part)
        if (objectNode.type !== 'MemberExpression') {
          return;
        }

        // Check if this is accessing: byAgentId[something]
        if (!objectNode.computed) {
          return;
        }

        // Check if accessing .byAgentId
        const byAgentIdNode = objectNode.object;
        if (
          byAgentIdNode.type !== 'MemberExpression' ||
          byAgentIdNode.property.type !== 'Identifier' ||
          byAgentIdNode.property.name !== 'byAgentId'
        ) {
          return;
        }

        // Check if parent is .messages (state.messages)
        const messagesNode = byAgentIdNode.object;
        if (
          messagesNode.type !== 'MemberExpression' ||
          messagesNode.property.type !== 'Identifier' ||
          messagesNode.property.name !== 'messages'
        ) {
          return;
        }

        // Check if it starts with state/s/rootState
        const stateNode = messagesNode.object;
        if (
          stateNode.type !== 'Identifier' ||
          !['state', 's', 'rootState'].includes(stateNode.name)
        ) {
          return;
        }

        // We found the pattern! state.messages.byAgentId[x]?.messages
        const agentIdText = sourceCode.getText(objectNode.property);

        context.report({
          node,
          messageId: 'rawMessageAccess',
          data: { agentId: agentIdText },
        });
      },
    };
  },
};
