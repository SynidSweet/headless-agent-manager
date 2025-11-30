# @headless-agent-manager/client

Redux state management client for headless AI agent orchestration.

**A framework-agnostic module for managing AI CLI agents with real-time WebSocket updates.**

## Features

- 🎯 **Redux-based state management** - Predictable, debuggable state
- 🔄 **Real-time WebSocket updates** - Automatic message streaming
- 🧩 **Framework-agnostic** - Works in any JavaScript environment
- 📦 **Type-safe** - Full TypeScript support
- 🧪 **Well-tested** - 106 tests with 95%+ coverage
- 🛠️ **Reusable utilities** - Message aggregation, gap detection
- 🎨 **Clean Architecture** - Proper separation of concerns

## Installation

```bash
npm install @headless-agent-manager/client
```

**Peer Dependencies:**
```bash
npm install @reduxjs/toolkit
```

## Quick Start

### 1. Create Client Instance

```typescript
import { createAgentClient } from '@headless-agent-manager/client';

const client = createAgentClient({
  apiUrl: 'http://localhost:3000',
  websocketUrl: 'http://localhost:3000',
  debug: true, // Enable Redux DevTools
});

export const { store, actions, selectors, socket } = client;
```

### 2. Integrate with React

```tsx
import { Provider } from 'react-redux';
import { store } from './client';

function App() {
  return (
    <Provider store={store}>
      <YourComponents />
    </Provider>
  );
}
```

### 3. Use in Components

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { selectAllAgents, launchAgent } from '@headless-agent-manager/client';

function AgentList() {
  const dispatch = useDispatch();
  const agents = useSelector(selectAllAgents);

  const handleLaunch = async () => {
    await dispatch(launchAgent({
      type: 'claude-code',
      prompt: 'Write a hello world function',
    }));
  };

  return (
    <div>
      <button onClick={handleLaunch}>Launch Agent</button>
      {agents.map(agent => (
        <div key={agent.id}>{agent.id} - {agent.status}</div>
      ))}
    </div>
  );
}
```

## API Reference

### `createAgentClient(config)`

Creates a configured agent management client.

**Parameters:**
```typescript
interface AgentClientConfig {
  apiUrl: string;           // Backend API URL
  websocketUrl: string;     // WebSocket server URL
  debug?: boolean;          // Enable Redux DevTools (default: false)
  headers?: Record<string, string>; // Custom HTTP headers
}
```

**Returns:**
```typescript
interface AgentClient {
  store: EnhancedStore;     // Redux store
  actions: Actions;         // All Redux actions
  selectors: Selectors;     // All selectors
  socket: Socket;           // Socket.IO instance
}
```

---

### Actions

#### Agent Actions

```typescript
// Async thunks (API calls)
dispatch(fetchAgents());
dispatch(launchAgent({ type: 'claude-code', prompt: '...' }));
dispatch(terminateAgent(agentId));

// Sync actions (local state updates)
dispatch(agentSelected(agentId));
dispatch(agentStatusUpdated({ agentId, status: 'running' }));
```

#### Message Actions

```typescript
// Async thunks
dispatch(fetchMessages(agentId));
dispatch(fetchMessagesSince({ agentId, since: 10 }));

// Sync actions
dispatch(messageReceived({ agentId, message: {...} }));
dispatch(messagesCleared(agentId));
```

#### Connection Actions

```typescript
dispatch(connected({ connectionId: 'conn-123' }));
dispatch(disconnected());
dispatch(connectionError('Network error'));
dispatch(agentSubscribed(agentId));
```

---

### Selectors

#### Agent Selectors

```typescript
const agents = useSelector(selectAllAgents);
const selected = useSelector(selectSelectedAgent);
const agent = useSelector((state) => selectAgentById(state, agentId));
const running = useSelector(selectRunningAgents);
const completed = useSelector(selectCompletedAgents);
const failed = useSelector(selectFailedAgents);
```

#### Message Selectors

```typescript
const messages = useSelector((state) =>
  selectMessagesForAgent(state, agentId)
);
const selectedMessages = useSelector(selectMessagesForSelectedAgent);
const lastSeq = useSelector((state) =>
  selectLastSequenceForAgent(state, agentId)
);
```

**Note**: Message selectors automatically aggregate streaming tokens for typing effect.

#### Connection Selectors

```typescript
const isConnected = useSelector(selectIsConnected);
const connectionId = useSelector(selectConnectionId);
const error = useSelector(selectConnectionError);
const reconnectAttempts = useSelector(selectReconnectAttempts);
const subscribedAgents = useSelector(selectSubscribedAgents);
```

---

### Utilities

#### `aggregateStreamingTokens(messages)`

Aggregates streaming `content_delta` tokens into complete messages and removes duplicates.

```typescript
import { aggregateStreamingTokens } from '@headless-agent-manager/client';

const streamingMessages = [
  { content: 'Hello', metadata: { eventType: 'content_delta' } },
  { content: ' world', metadata: { eventType: 'content_delta' } },
  { content: 'Hello world' }, // Duplicate complete message
];

const aggregated = aggregateStreamingTokens(streamingMessages);
// Returns: [{ content: 'Hello world', metadata: { aggregated: true } }]
```

---

## Advanced Usage

### Creating Typed Hooks

```typescript
// hooks/useAppState.ts
import { useSelector, useDispatch } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '@headless-agent-manager/client';

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppDispatch = () => useDispatch();

// Convenience hooks
export function useAgents() {
  return useAppSelector(selectAllAgents);
}

export function useSelectedAgent() {
  return useAppSelector(selectSelectedAgent);
}
```

### Custom Middleware

```typescript
import { createAgentClient } from '@headless-agent-manager/client';
import { configureStore } from '@reduxjs/toolkit';

// Create client first
const client = createAgentClient({ ...config });

// Recreate store with custom middleware
const customStore = configureStore({
  reducer: {
    agents: agentsSlice.reducer,
    messages: messagesSlice.reducer,
    connection: connectionSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(createWebSocketMiddleware(client.socket))
      .concat(myCustomMiddleware),
});
```

### Direct Socket Access

```typescript
const client = createAgentClient({ ...config });

// Listen for custom events
client.socket.on('custom:event', (data) => {
  console.log('Custom event:', data);
});

// Emit custom events
client.socket.emit('custom:command', { data: '...' });
```

---

## State Structure

```typescript
{
  agents: {
    byId: {
      'agent-123': {
        id: 'agent-123',
        type: 'claude-code',
        status: 'running',
        createdAt: '2025-01-01T00:00:00Z',
      }
    },
    allIds: ['agent-123'],
    selectedAgentId: 'agent-123',
    loading: false,
    error: null,
  },
  messages: {
    byAgentId: {
      'agent-123': {
        messages: [
          {
            id: 'msg-1',
            agentId: 'agent-123',
            type: 'assistant',
            content: 'Hello',
            sequenceNumber: 1,
            timestamp: '2025-01-01T00:00:00Z',
          }
        ],
        lastSequence: 1,
        loading: false,
        error: null,
      }
    },
    messageIds: { 'msg-1': true },
  },
  connection: {
    isConnected: true,
    connectionId: 'conn-123',
    error: null,
    reconnectAttempts: 0,
    subscribedAgents: ['agent-123'],
  }
}
```

---

## Testing

The module exports testing utilities for easy mocking.

```typescript
import { createMockStore, mockMessageFixtures } from '@headless-agent-manager/client/testing';

describe('MyComponent', () => {
  it('should render agents', () => {
    const store = createMockStore({
      agents: {
        byId: { 'agent-1': { id: 'agent-1', status: 'running' } },
        allIds: ['agent-1'],
      },
    });

    render(
      <Provider store={store}>
        <MyComponent />
      </Provider>
    );

    // ... assertions
  });
});
```

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

---

## WebSocket Events

The module automatically handles these WebSocket events:

### Incoming (from server)

- `connect` - Connection established
- `disconnect` - Connection lost
- `agent:created` - New agent created
- `agent:status` - Agent status updated
- `agent:message` - New message received
- `agent:error` - Agent error occurred
- `agent:complete` - Agent completed

### Outgoing (to server)

- `subscribe:agent` - Subscribe to agent updates
- `unsubscribe:agent` - Unsubscribe from agent

All events are automatically handled by the WebSocket middleware. No manual event management needed!

---

## Best Practices

### 1. Use Selectors for Derived Data

```typescript
// ✅ GOOD: Use memoized selectors
const runningAgents = useSelector(selectRunningAgents);

// ❌ BAD: Filter in component (re-computes on every render)
const runningAgents = agents.filter(a => a.status === 'running');
```

### 2. Dispatch Async Actions Properly

```typescript
// ✅ GOOD: Handle promise
const handleLaunch = async () => {
  try {
    await dispatch(launchAgent({ ...request })).unwrap();
    console.log('Agent launched!');
  } catch (error) {
    console.error('Launch failed:', error);
  }
};

// ❌ BAD: Fire and forget
dispatch(launchAgent({ ...request }));
```

### 3. Subscribe to Agents Automatically

The module automatically subscribes to agents when messages are fetched. No manual subscription needed!

```typescript
// Automatically subscribes via middleware
dispatch(fetchMessages(agentId));
```

### 4. Clean Up on Unmount

```typescript
// ✅ GOOD: Properly typed dispatch
const dispatch = useAppDispatch();

useEffect(() => {
  // Cleanup logic if needed
  return () => {
    // Module handles cleanup automatically
  };
}, []);
```

---

## Troubleshooting

### WebSocket not connecting

1. Check `websocketUrl` matches backend server
2. Verify backend is running
3. Check browser console for connection errors
4. Enable debug mode: `createAgentClient({ debug: true })`

### Messages not appearing

1. Ensure agent is subscribed (check `selectSubscribedAgents`)
2. Check WebSocket connection (`selectIsConnected`)
3. Verify backend is emitting `agent:message` events
4. Check Redux DevTools for state updates

### Type errors

1. Ensure `@reduxjs/toolkit` is installed
2. Check TypeScript version (>= 5.0 recommended)
3. Import types from module: `import type { Agent } from '@headless-agent-manager/client'`

---

## Examples

### Complete React App

```tsx
// client.ts
import { createAgentClient } from '@headless-agent-manager/client';

export const { store, actions, selectors } = createAgentClient({
  apiUrl: process.env.VITE_API_URL || 'http://localhost:3000',
  websocketUrl: process.env.VITE_WS_URL || 'http://localhost:3000',
  debug: process.env.NODE_ENV === 'development',
});

// App.tsx
import { Provider } from 'react-redux';
import { store } from './client';
import { AgentDashboard } from './components/AgentDashboard';

export function App() {
  return (
    <Provider store={store}>
      <AgentDashboard />
    </Provider>
  );
}

// components/AgentDashboard.tsx
import { useSelector, useDispatch } from 'react-redux';
import { selectAllAgents, launchAgent, terminateAgent } from '@headless-agent-manager/client';

export function AgentDashboard() {
  const dispatch = useDispatch();
  const agents = useSelector(selectAllAgents);

  return (
    <div>
      <button onClick={() => dispatch(launchAgent({
        type: 'claude-code',
        prompt: 'Write a fibonacci function',
      }))}>
        Launch Agent
      </button>

      {agents.map(agent => (
        <div key={agent.id}>
          {agent.id} - {agent.status}
          {agent.status === 'running' && (
            <button onClick={() => dispatch(terminateAgent(agent.id))}>
              Terminate
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  Agent,
  AgentType,
  AgentStatus,
  AgentMessage,
  AgentConfiguration,
  LaunchAgentRequest,
  LaunchAgentResponse,
  SessionInfo,
  RootState,
  AgentClient,
} from '@headless-agent-manager/client';
```

---

## Contributing

Contributions welcome! Please follow TDD (Test-Driven Development):

1. Write test first (RED)
2. Implement minimum code to pass (GREEN)
3. Refactor while keeping tests green (REFACTOR)

### Running Tests

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm run test:coverage # Coverage report
```

---

## License

MIT

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/headless-agent-manager/issues)
- **Documentation**: See `/docs` in repository
- **Examples**: See `/examples` in repository

---

**Version**: 1.0.0
**Last Updated**: 2025-11-30
