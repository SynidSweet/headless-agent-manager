import { ClaudeSDKAdapter } from '@infrastructure/adapters/claude-sdk.adapter';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';
import { Session } from '@domain/value-objects/session.vo';
import { IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Integration Test for ClaudeSDKAdapter with REAL Claude API
 *
 * NOTE: Requires ANTHROPIC_API_KEY environment variable
 * To run: ANTHROPIC_API_KEY=sk-... npm run test:integration
 */
describe('ClaudeSDKAdapter Integration (Real API)', () => {
  let adapter: ClaudeSDKAdapter;
  let logger: ConsoleLogger;

  beforeAll(() => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  ANTHROPIC_API_KEY not set - integration tests will be skipped');
      console.warn('   To run: ANTHROPIC_API_KEY=sk-... npm run test:integration');
    }
  });

  beforeEach(() => {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    logger = new ConsoleLogger();
    adapter = new ClaudeSDKAdapter(apiKey, logger);
  });

  // Only run if API key is provided
  const describeIfApiKey = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

  describeIfApiKey('real Claude API execution', () => {
    it('should successfully stream messages from Claude API', async () => {
      // Arrange
      const session = Session.create('What is 2 + 2? Answer with just the number.', {});

      const messages: AgentMessage[] = [];
      let completed = false;

      const observer: IAgentObserver = {
        onMessage: (message: AgentMessage) => {
          messages.push(message);
          console.log('[TEST] Message:', message.type, message.metadata?.isDelta ? '(delta)' : '');

          // Log content if it's a delta
          if (message.metadata?.isDelta && typeof message.content === 'string') {
            process.stdout.write(message.content);
          }
        },
        onStatusChange: jest.fn(),
        onError: (error) => {
          console.error('[TEST] Error:', error.message);
        },
        onComplete: (result) => {
          completed = true;
          console.log('\n[TEST] Completed:', result.status, `(${result.duration}ms)`);
          console.log('[TEST] Usage:', result.stats?.usage);
        },
      };

      // Act
      const agent = await adapter.start(session);
      adapter.subscribe(agent.id, observer);

      console.log('[TEST] Agent started, waiting for streaming...\n');

      // Wait for completion (max 15 seconds)
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (completed) {
            clearInterval(check);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 15000);
      });

      // Assert
      console.log('\n[TEST] Total messages received:', messages.length);

      // Should receive multiple messages
      expect(messages.length).toBeGreaterThan(0);

      // Should have init message
      const initMessage = messages.find((m) => m.role === 'init');
      expect(initMessage).toBeDefined();

      // Should have assistant delta messages
      const deltaMessages = messages.filter((m) => m.metadata?.isDelta);
      expect(deltaMessages.length).toBeGreaterThan(0);

      // Should have result message
      const resultMessage = messages.find((m) => m.role === 'result');
      expect(resultMessage).toBeDefined();
      expect(resultMessage?.metadata?.usage).toBeDefined();

      // Should complete
      expect(completed).toBe(true);
    }, 20000);

    it('should handle streaming for longer responses', async () => {
      // Arrange
      const session = Session.create('Count from 1 to 5, one number per line.', {});

      const messages: AgentMessage[] = [];
      let completed = false;

      const observer: IAgentObserver = {
        onMessage: (message: AgentMessage) => {
          messages.push(message);
        },
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: () => {
          completed = true;
        },
      };

      // Act
      const agent = await adapter.start(session);
      adapter.subscribe(agent.id, observer);

      // Wait for completion
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (completed) {
            clearInterval(check);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 20000);
      });

      // Assert
      console.log('[TEST] Messages received for longer response:', messages.length);

      // Should receive many delta messages for longer response
      const deltaMessages = messages.filter((m) => m.metadata?.isDelta);
      expect(deltaMessages.length).toBeGreaterThan(5); // Should have multiple chunks

      // Should complete
      expect(completed).toBe(true);
    }, 25000);
  });

  describe('process lifecycle', () => {
    const describeIfApiKey = process.env.ANTHROPIC_API_KEY ? it : it.skip;

    describeIfApiKey(
      'should properly stop running agent',
      async () => {
        // Arrange
        const session = Session.create('Write a very long essay about TypeScript.', {});

        // Act
        const agent = await adapter.start(session);

        // Wait a bit for streaming to start
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Stop it mid-stream
        await adapter.stop(agent.id);

        // Assert - should be stopped
        await expect(adapter.getStatus(agent.id)).rejects.toThrow('No running agent found');
      },
      10000
    );
  });
});
