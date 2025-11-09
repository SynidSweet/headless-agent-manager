import { ClaudeCodeAdapter } from '@infrastructure/adapters/claude-code.adapter';
import { ProcessManager } from '@infrastructure/process/process-manager.service';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';
import { Session } from '@domain/value-objects/session.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Integration Test for ClaudeCodeAdapter with REAL Claude CLI
 *
 * NOTE: This test requires Claude CLI to be installed and available in PATH
 * These tests verify that we can spawn and communicate with the real CLI
 */
/**
 * INTEGRATION TEST NOTE - KNOWN LIMITATION
 *
 * ISSUE: Claude CLI does not output to stdout/stderr when spawned from Node.js child_process
 * See: https://github.com/anthropics/claude-code/issues/6775
 *      https://github.com/anthropics/claude-code/issues/771
 *
 * FINDINGS:
 * - Claude works fine from terminal: ✅
 * - Claude spawned with Python subprocess: ✅
 * - Claude spawned with Node.js child_process: ❌ (no stdout/stderr output)
 * - Even with shell: true, data events, encoding set: ❌
 *
 * RECOMMENDATION:
 * - For production: Use Claude Code TypeScript SDK instead of CLI spawning
 * - For MVP: Tests skipped, manual validation provided
 * - Alternative: Wrapper shell script approach
 *
 * STATUS: Skipped until upstream issue resolved or SDK integration implemented
 */
describe.skip('ClaudeCodeAdapter Integration (Real CLI - BLOCKED BY UPSTREAM BUG)', () => {
  let adapter: ClaudeCodeAdapter;
  let processManager: ProcessManager;
  let parser: ClaudeMessageParser;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
    processManager = new ProcessManager(logger);
    parser = new ClaudeMessageParser();
    adapter = new ClaudeCodeAdapter(processManager, parser, logger);
  });

  describe('real Claude CLI execution', () => {
    it(
      'should successfully spawn Claude Code and receive streaming messages',
      async () => {
        // Arrange
        const session = Session.create('What is 2 + 2? Answer with just the number.', {
          outputFormat: 'stream-json',
        });

        const messages: AgentMessage[] = [];
        let completed = false;

        const observer: IAgentObserver = {
          onMessage: (message: AgentMessage) => {
            messages.push(message);
            console.log('[TEST] Message:', message.type, message.metadata?.subtype || '');
          },
          onStatusChange: jest.fn(),
          onError: (error) => {
            console.log('[TEST] Error:', error.message);
          },
          onComplete: (result) => {
            completed = true;
            console.log('[TEST] Completed:', result.status);
          },
        };

        // Act
        const agent = await adapter.start(session);
        adapter.subscribe(agent.id, observer);

        // Wait for completion or timeout (10 seconds)
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (completed || messages.length > 0) {
              clearInterval(check);
              resolve();
            }
          }, 100);

          setTimeout(() => {
            clearInterval(check);
            resolve();
          }, 10000);
        });

        // Assert
        console.log('[TEST] Total messages:', messages.length);
        console.log('[TEST] Message types:', messages.map((m) => m.type));

        // Should receive multiple messages (init, assistant, result)
        expect(messages.length).toBeGreaterThanOrEqual(3);

        // Should have system init message
        const initMessage = messages.find((m) => m.metadata?.subtype === 'init');
        expect(initMessage).toBeDefined();

        // Should have assistant message
        const assistantMessage = messages.find((m) => m.type === 'assistant');
        expect(assistantMessage).toBeDefined();

        // Should have result message
        const resultMessage = messages.find((m) => m.metadata?.subtype === 'success');
        expect(resultMessage).toBeDefined();

        // Clean up
        try {
          await adapter.stop(agent.id);
        } catch (error) {
          // May already be stopped
        }
      },
      15000
    );
  });

  describe('process lifecycle', () => {
    it(
      'should properly stop running Claude CLI process',
      async () => {
        // Arrange
        const session = Session.create('Count from 1 to 5', {
          outputFormat: 'stream-json',
        });

        // Act
        const agent = await adapter.start(session);

        // Wait a bit for process to start streaming
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify it's running
        const statusBefore = await adapter.getStatus(agent.id);
        expect(statusBefore).toBe(AgentStatus.RUNNING);

        // Stop it
        await adapter.stop(agent.id);

        // Assert - should be stopped now
        await expect(adapter.getStatus(agent.id)).rejects.toThrow('No running agent found');
      },
      10000
    );
  });
});
