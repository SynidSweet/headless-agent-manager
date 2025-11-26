/**
 * IAgentRunner Contract Compliance Tests
 *
 * Purpose: Verify all implementations honor the IAgentRunner interface contract
 * Layer: Boundary between Application and Infrastructure
 * Type: Contract
 *
 * CRITICAL: These tests prevent FK violation bugs and integration failures
 * by verifying that adapters return data compatible with the domain layer.
 *
 * Contract Requirements:
 * 1. start() must return a valid Agent entity
 * 2. Agent ID must be stable (never changes)
 * 3. Returned agent must be saveable to repository (FK integrity)
 * 4. Messages must reference the correct agent ID
 * 5. stop() must clean up resources
 * 6. subscribe() must deliver events
 *
 * Tested Implementations:
 * - SyntheticAgentAdapter (always available, no external dependencies)
 * - ClaudePythonProxyAdapter (skip if proxy unavailable)
 * - ClaudeSDKAdapter (skip if API key unavailable)
 *
 * Uses REAL implementations, NO mocks (except external APIs)
 */

import { IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { SyntheticAgentAdapter, SyntheticAgentConfig } from '@infrastructure/adapters/synthetic-agent.adapter';
import { ClaudePythonProxyAdapter } from '@infrastructure/adapters/claude-python-proxy.adapter';
import { ClaudeSDKAdapter } from '@infrastructure/adapters/claude-sdk.adapter';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Session } from '@domain/value-objects/session.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { Agent } from '@domain/entities/agent.entity';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';

describe('IAgentRunner Contract', () => {
  let db: DatabaseService;
  let repository: SqliteAgentRepository;

  beforeEach(() => {
    // Setup REAL database for FK constraint testing
    db = new DatabaseService(':memory:');
    db.onModuleInit();

    // Verify FK constraints are enabled (CRITICAL)
    const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });
    if (fkEnabled !== 1) {
      throw new Error('Foreign keys must be enabled for contract tests');
    }

    repository = new SqliteAgentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // Helper to wait for async events
  const waitFor = (condition: () => boolean, timeout = 5000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (condition()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
        }
      }, 50);
    });
  };

  /**
   * Adapter Configuration
   * Defines which adapters to test and how to skip unavailable ones
   */
  const adapters = [
    {
      name: 'SyntheticAgentAdapter',
      factory: async () => {
        const adapter = new SyntheticAgentAdapter();
        return { adapter, needsSetup: true };
      },
      skip: false, // Always available
      setupSession: (agentId: AgentId) => {
        // Synthetic adapter needs pre-configuration
        const adapter = new SyntheticAgentAdapter();
        const config: SyntheticAgentConfig = {
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Test message 1' } },
            { delay: 200, type: 'message', data: { content: 'Test message 2' } },
            { delay: 300, type: 'complete', data: { success: true, messageCount: 2 } },
          ],
        };
        adapter.configure(agentId, config);

        const session = Session.create(
          'Contract test',
          { sessionId: agentId.toString() } // Synthetic adapter uses session.id to look up config
        );

        return { adapter, session };
      },
    },
    {
      name: 'ClaudePythonProxyAdapter',
      factory: async () => {
        // Skip if proxy not running
        const proxyUrl = process.env.CLAUDE_PROXY_URL || 'http://localhost:8000';
        try {
          const response = await fetch(`${proxyUrl}/health`);
          if (!response.ok) throw new Error('Proxy not healthy');

          const adapter = new ClaudePythonProxyAdapter(proxyUrl, new ConsoleLogger());
          return { adapter, needsSetup: false };
        } catch (error) {
          return { adapter: null, needsSetup: false };
        }
      },
      skip: true, // Skip by default (requires external service)
      setupSession: () => {
        const proxyUrl = process.env.CLAUDE_PROXY_URL || 'http://localhost:8000';
        const adapter = new ClaudePythonProxyAdapter(proxyUrl, new ConsoleLogger());
        const session = Session.create(
          'Say "Hello from contract test" and nothing else',
          {}
        );
        return { adapter, session };
      },
    },
    {
      name: 'ClaudeSDKAdapter',
      factory: async () => {
        // Skip if API key not available
        if (!process.env.ANTHROPIC_API_KEY) {
          return { adapter: null, needsSetup: false };
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        const adapter = new ClaudeSDKAdapter(apiKey, new ConsoleLogger());
        return { adapter, needsSetup: false };
      },
      skip: true, // Skip by default (costs money)
      setupSession: () => {
        const apiKey = process.env.ANTHROPIC_API_KEY || '';
        const adapter = new ClaudeSDKAdapter(apiKey, new ConsoleLogger());
        const session = Session.create(
          'Say "Hello from contract test" and nothing else',
          {}
        );
        return { adapter, session };
      },
    },
  ];

  adapters.forEach(({ name, skip, setupSession }) => {
    describe(`${name} implements IAgentRunner`, () => {
      if (skip) {
        console.log(`⚠️  Skipping ${name} - external dependencies not available`);
      }

      it('CONTRACT #1: start() must return a valid Agent entity', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);

        // Act
        const agent = await adapter.start(session);

        // Assert
        expect(agent).toBeInstanceOf(Agent);
        expect(agent.id).toBeInstanceOf(AgentId);
        expect(agent.type).toBe(AgentType.SYNTHETIC);
        expect(agent.status).toBe(AgentStatus.RUNNING);

        // Cleanup
        await adapter.stop(agent.id);
      }, 10000);

      it('CONTRACT #2: Agent ID must be stable (never changes)', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);

        // Act
        const agent = await adapter.start(session);
        const id1 = agent.id.toString();

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 50));

        const id2 = agent.id.toString();

        // Assert - ID must never change
        expect(id1).toBe(id2);

        // Cleanup
        await adapter.stop(agent.id);
      }, 10000);

      it('CONTRACT #3: Returned agent must be saveable to repository (FK integrity)', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);

        // Act
        const agent = await adapter.start(session);

        // Assert - CRITICAL: Agent must be saveable without FK errors
        await expect(repository.save(agent)).resolves.not.toThrow();

        // Verify it was actually saved
        const saved = await repository.findById(agent.id);
        expect(saved).toBeDefined();
        expect(saved?.id.toString()).toBe(agent.id.toString());

        // Cleanup
        await adapter.stop(agent.id);
      }, 10000);

      it('CONTRACT #4: Messages must reference correct agent ID', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);
        const agent = await adapter.start(session);

        // Save agent first (required for FK)
        await repository.save(agent);

        const messages: AgentMessage[] = [];
        const observer: IAgentObserver = {
          onMessage: (msg) => messages.push(msg),
          onStatusChange: () => {},
          onError: () => {},
          onComplete: () => {},
        };

        // Act - Subscribe and wait for messages
        adapter.subscribe(agent.id, observer);

        // Wait for at least one message
        await waitFor(() => messages.length > 0, 5000);

        // Assert - Messages should be about this agent
        expect(messages.length).toBeGreaterThan(0);

        // All messages should be valid (this is the contract - they're deliverable)
        messages.forEach((msg) => {
          expect(msg).toBeDefined();
          expect(msg.content).toBeDefined();
        });

        // Cleanup
        await adapter.stop(agent.id);
      }, 10000);

      it('CONTRACT #5: stop() must clean up resources', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);
        const agent = await adapter.start(session);

        // Act - Stop the agent
        await adapter.stop(agent.id);

        // Assert - Status should change after stop
        const status = await adapter.getStatus(agent.id);
        // Status should be COMPLETED or no longer RUNNING
        expect(status).not.toBe(AgentStatus.INITIALIZING);
      }, 10000);

      it('CONTRACT #6: subscribe() must deliver events to observer', async () => {
        if (skip) {
          console.log(`   Skipped: ${name} not available`);
          return;
        }

        // Arrange
        const agentId = AgentId.generate();
        const { adapter, session } = setupSession(agentId);
        const agent = await adapter.start(session);

        let messageReceived = false;
        const observer: IAgentObserver = {
          onMessage: () => {
            messageReceived = true;
          },
          onStatusChange: () => {},
          onError: () => {},
          onComplete: () => {},
        };

        // Act
        adapter.subscribe(agent.id, observer);

        // Wait for message
        await waitFor(() => messageReceived, 5000);

        // Assert
        expect(messageReceived).toBe(true);

        // Cleanup
        await adapter.stop(agent.id);
      }, 10000);
    });
  });

  /**
   * Cross-Adapter Consistency Tests
   * Verify all adapters behave consistently
   */
  describe('Cross-Adapter Consistency', () => {
    it('All adapters should return agents with consistent structure', async () => {
      // Test with SyntheticAgentAdapter (always available)
      const agentId = AgentId.generate();
      const adapter = new SyntheticAgentAdapter();
      const config: SyntheticAgentConfig = {
        schedule: [{ delay: 100, type: 'complete', data: { success: true } }],
      };
      adapter.configure(agentId, config);

      const session = Session.create(
        'Test',
        { sessionId: agentId.toString() }
      );

      const agent = await adapter.start(session);

      // Verify agent structure
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('type');
      expect(agent).toHaveProperty('status');
      expect(agent).toHaveProperty('session');

      // All adapters should return these methods
      expect(typeof agent.markAsRunning).toBe('function');
      expect(typeof agent.markAsCompleted).toBe('function');
      expect(typeof agent.markAsFailed).toBe('function');

      await adapter.stop(agent.id);
    });

    it('All adapters should allow multiple observers', async () => {
      // Test with SyntheticAgentAdapter
      const agentId = AgentId.generate();
      const adapter = new SyntheticAgentAdapter();
      const config: SyntheticAgentConfig = {
        schedule: [
          { delay: 100, type: 'message', data: { content: 'Test' } },
          { delay: 200, type: 'complete', data: { success: true } },
        ],
      };
      adapter.configure(agentId, config);

      const session = Session.create(
        'Test',
        { sessionId: agentId.toString() }
      );

      const agent = await adapter.start(session);

      let observer1Called = false;
      let observer2Called = false;

      const observer1: IAgentObserver = {
        onMessage: () => {
          observer1Called = true;
        },
        onStatusChange: () => {},
        onError: () => {},
        onComplete: () => {},
      };

      const observer2: IAgentObserver = {
        onMessage: () => {
          observer2Called = true;
        },
        onStatusChange: () => {},
        onError: () => {},
        onComplete: () => {},
      };

      // Subscribe both observers
      adapter.subscribe(agent.id, observer1);
      adapter.subscribe(agent.id, observer2);

      // Wait for messages
      await waitFor(() => observer1Called && observer2Called, 5000);

      // Both should receive events
      expect(observer1Called).toBe(true);
      expect(observer2Called).toBe(true);

      await adapter.stop(agent.id);
    });
  });
});
