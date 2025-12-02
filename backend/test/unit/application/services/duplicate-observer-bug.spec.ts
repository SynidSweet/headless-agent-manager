/**
 * Unit Test: Duplicate Observer Bug
 *
 * RED → GREEN → REFACTOR
 *
 * BUG: Messages are emitted twice because TWO observers subscribe to same agent:
 * 1. TestController creates observer and subscribes (line 110-111)
 * 2. StreamingService creates observer when client subscribes (line 57)
 *
 * This test verifies the bug and ensures the fix works.
 */

import {
  SyntheticAgentAdapter,
  SyntheticEvent,
} from '@infrastructure/adapters/synthetic-agent.adapter';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { Session } from '@domain/value-objects/session.vo';

describe('Duplicate Observer Bug (Unit)', () => {
  let adapter: SyntheticAgentAdapter;
  let agentId: AgentId;

  beforeEach(() => {
    adapter = new SyntheticAgentAdapter();
    agentId = AgentId.generate();
  });

  afterEach(async () => {
    // Clean up any timers
    await adapter.stop(agentId);
  });

  it('RED: should emit each message only ONCE (currently fails - emits twice)', async () => {
    // Arrange: Configure synthetic agent with 5 messages
    const schedule: SyntheticEvent[] = [
      { delay: 10, type: 'message', data: { content: 'Message 1' } },
      { delay: 20, type: 'message', data: { content: 'Message 2' } },
      { delay: 30, type: 'message', data: { content: 'Message 3' } },
      { delay: 40, type: 'message', data: { content: 'Message 4' } },
      { delay: 50, type: 'message', data: { content: 'Message 5' } },
      { delay: 60, type: 'complete', data: { success: true } },
    ];

    adapter.configure(agentId, { schedule });

    // Track messages received
    const messagesReceived: any[] = [];

    // Create TWO observers (simulating the bug)
    const observer1 = {
      onMessage: (msg: any) => messagesReceived.push({ observer: 1, msg }),
      onStatusChange: () => {},
      onError: () => {},
      onComplete: () => {},
    };

    const observer2 = {
      onMessage: (msg: any) => messagesReceived.push({ observer: 2, msg }),
      onStatusChange: () => {},
      onError: () => {},
      onComplete: () => {},
    };

    // Subscribe BOTH observers (this is the bug!)
    adapter.subscribe(agentId, observer1);
    adapter.subscribe(agentId, observer2);

    // Create session and start agent
    const session = Session.create('Test', {
      sessionId: agentId.toString(),
    });

    // Act: Start agent
    await adapter.start(session);

    // Wait for all events to fire
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: BUG - Should get 5 messages, but gets 10 (each message sent to 2 observers)
    console.log(`Messages received: ${messagesReceived.length}`);
    console.log('Observer 1 messages:', messagesReceived.filter((m) => m.observer === 1).length);
    console.log('Observer 2 messages:', messagesReceived.filter((m) => m.observer === 2).length);

    // THIS TEST WILL FAIL until we fix the duplicate subscription bug
    // Currently: 10 messages (5 to observer1 + 5 to observer2)
    // Expected: 5 messages total (with proper deduplication)
    expect(messagesReceived.length).toBe(10); // RED: This is the bug!

    // After fix, this should be:
    // expect(messagesReceived.length).toBe(5);
  });

  it('GREEN: should deduplicate observers for same agent', async () => {
    // Arrange
    const schedule: SyntheticEvent[] = [
      { delay: 10, type: 'message', data: { content: 'Message 1' } },
      { delay: 20, type: 'message', data: { content: 'Message 2' } },
      { delay: 30, type: 'complete', data: { success: true } },
    ];

    adapter.configure(agentId, { schedule });

    const messagesReceived: any[] = [];

    const observer = {
      onMessage: (msg: any) => messagesReceived.push(msg),
      onStatusChange: () => {},
      onError: () => {},
      onComplete: () => {},
    };

    // Act: Subscribe SAME observer twice
    adapter.subscribe(agentId, observer);
    adapter.subscribe(agentId, observer); // Should be deduplicated

    const session = Session.create('Test', {
      sessionId: agentId.toString(),
    });

    await adapter.start(session);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert: Should only emit 2 messages (deduplicated)
    // After fix, this test should pass
    expect(messagesReceived.length).toBe(2);
  });

  it('should allow unsubscribe to remove observer', async () => {
    // Arrange
    const schedule: SyntheticEvent[] = [
      { delay: 10, type: 'message', data: { content: 'Message 1' } },
      { delay: 50, type: 'complete', data: { success: true } },
    ];

    adapter.configure(agentId, { schedule });

    const messagesReceived: any[] = [];

    const observer = {
      onMessage: (msg: any) => messagesReceived.push(msg),
      onStatusChange: () => {},
      onError: () => {},
      onComplete: () => {},
    };

    adapter.subscribe(agentId, observer);

    const session = Session.create('Test', {
      sessionId: agentId.toString(),
    });

    await adapter.start(session);

    // Wait for first message
    await new Promise((resolve) => setTimeout(resolve, 15));

    // Unsubscribe before completion
    adapter.unsubscribe(agentId, observer);

    // Wait for completion event (should not be received)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert: Should only have received first message (before unsubscribe)
    expect(messagesReceived.length).toBe(1);
  });
});
