/**
 * Agent Launch → Message Persistence Integration Test
 *
 * THIS TEST WOULD HAVE CAUGHT THE FK BUG!
 *
 * Tests the complete flow with REAL database and FK constraints:
 * 1. Launch agent via orchestration service
 * 2. Verify agent exists in database
 * 3. Verify messages can be saved for that agent
 * 4. Verify FK referential integrity
 *
 * TDD Principle: Test behavior at boundaries, not implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AgentOrchestrationService } from '../../src/application/services/agent-orchestration.service';
import { AgentMessageService } from '../../src/application/services/agent-message.service';
import { DatabaseService } from '../../src/infrastructure/database/database.service';
import { SqliteAgentRepository } from '../../src/infrastructure/repositories/sqlite-agent.repository';
import { AgentFactoryAdapter } from '../../src/infrastructure/adapters/agent-factory.adapter';
import { ClaudePythonProxyAdapter } from '../../src/infrastructure/adapters/claude-python-proxy.adapter';
import { ClaudeSDKAdapter } from '../../src/infrastructure/adapters/claude-sdk.adapter';
import { SyntheticAgentAdapter } from '../../src/infrastructure/adapters/synthetic-agent.adapter';
import { ConsoleLogger } from '../../src/infrastructure/logging/console-logger.service';
import { LaunchAgentDto } from '../../src/application/dto/launch-agent.dto';

describe.skip('Agent Launch → Message Persistence Integration (DEPRECATED - use simplified version)', () => {
  let app: TestingModule;
  let orchestrationService: AgentOrchestrationService;
  let messageService: AgentMessageService;
  let databaseService: DatabaseService;
  let agentRepository: SqliteAgentRepository;

  beforeAll(async () => {
    // Create REAL module with REAL database (no mocks!)
    app = await Test.createTestingModule({
      providers: [
        // Core services
        AgentOrchestrationService,
        AgentMessageService,

        // Database (in-memory but with REAL FK constraints)
        {
          provide: DatabaseService,
          useFactory: () => {
            const db = new DatabaseService(':memory:');
            db.onModuleInit(); // Initialize with schema
            return db;
          },
        },

        // Repository
        SqliteAgentRepository,

        // Adapters
        AgentFactoryAdapter,
        SyntheticAgentAdapter,
        {
          provide: ClaudePythonProxyAdapter,
          useFactory: () => new ClaudePythonProxyAdapter(
            'http://localhost:8000',
            new ConsoleLogger()
          ),
        },
        {
          provide: ClaudeSDKAdapter,
          useFactory: () => new ClaudeSDKAdapter(
            'test-api-key',
            new ConsoleLogger()
          ),
        },

        // Logger
        ConsoleLogger,
      ],
    }).compile();

    orchestrationService = app.get<AgentOrchestrationService>(AgentOrchestrationService);
    messageService = app.get<AgentMessageService>(AgentMessageService);
    databaseService = app.get<DatabaseService>(DatabaseService);
    agentRepository = app.get<SqliteAgentRepository>(SqliteAgentRepository);
  });

  afterAll(async () => {
    databaseService.close();
    await app.close();
  });

  beforeEach(() => {
    // Clean database
    const db = databaseService.getDatabase();
    db.exec('DELETE FROM agent_messages');
    db.exec('DELETE FROM agents');
  });

  describe('Critical: FK Integrity Between Agent and Messages', () => {
    it('should fail: REPRODUCES THE BUG before fix', async () => {
      // This test reproduces the exact bug reported by user
      // It SHOULD FAIL before the fix is applied

      // Arrange: Configure synthetic agent for fast, deterministic test
      const syntheticAdapter = app.get<SyntheticAgentAdapter>(SyntheticAgentAdapter);
      const agentId = require('crypto').randomUUID();
      const agentIdObj = require('@domain/value-objects/agent-id.vo').AgentId.fromString(agentId);

      syntheticAdapter.configure(agentIdObj, {
        schedule: [
          { delay: 0, type: 'message', data: { type: 'assistant', content: 'Test message' } },
          { delay: 50, type: 'complete', data: { success: true } },
        ],
      });

      // Act: Launch via orchestration (simulating real user action)
      const dto = new LaunchAgentDto();
      dto.type = 'synthetic';
      dto.prompt = 'FK test';
      dto.configuration = { outputFormat: 'stream-json' };

      const launchedAgent = await orchestrationService.launchAgent(dto);

      // Wait for messages to emit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Agent returned by launch should exist in database
      const db = databaseService.getDatabase();
      const agentInDb = db
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get(launchedAgent.id.toString());

      // CRITICAL TEST: This will FAIL before fix!
      // The agent returned by launch has a different ID than the one in DB
      expect(agentInDb).toBeDefined();
      expect((agentInDb as any).id).toBe(launchedAgent.id.toString());

      // Assert: Messages should be saveable for the returned agent
      // This will FAIL with FK constraint error before fix
      await expect(
        messageService.saveMessage({
          agentId: launchedAgent.id.toString(),
          type: 'assistant',
          content: 'Manual test message',
        })
      ).resolves.toBeDefined();

      // Verify messages were actually saved
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ?')
        .all(launchedAgent.id.toString());

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should save messages for agent after launch (the core requirement)', async () => {
      // THE most basic requirement: launched agents can receive messages

      // Arrange & Act: Launch synthetic agent
      const syntheticAdapter = app.get<SyntheticAgentAdapter>(SyntheticAgentAdapter);
      const agentId = require('crypto').randomUUID();
      const agentIdObj = require('@domain/value-objects/agent-id.vo').AgentId.fromString(agentId);

      syntheticAdapter.configure(agentIdObj, {
        schedule: [
          { delay: 0, type: 'message', data: { type: 'assistant', content: 'Message 1' } },
          { delay: 20, type: 'message', data: { type: 'assistant', content: 'Message 2' } },
          { delay: 50, type: 'complete', data: { success: true } },
        ],
      });

      const dto = new LaunchAgentDto();
      dto.type = 'synthetic';
      dto.prompt = 'Message test';
      dto.configuration = {};

      const agent = await orchestrationService.launchAgent(dto);

      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Messages persisted successfully
      const db = databaseService.getDatabase();
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
        .all(agent.id.toString()) as any[];

      expect(messages.length).toBeGreaterThanOrEqual(2);
      messages.forEach(msg => {
        expect(msg.agent_id).toBe(agent.id.toString());
      });
    });

    it('should maintain ID consistency: orchestration → runner → repository', async () => {
      // Test the contract: agent ID must be consistent across layers

      // Launch agent
      const syntheticAdapter = app.get<SyntheticAgentAdapter>(SyntheticAgentAdapter);
      const agentId = require('crypto').randomUUID();
      const agentIdObj = require('@domain/value-objects/agent-id.vo').AgentId.fromString(agentId);

      syntheticAdapter.configure(agentIdObj, {
        schedule: [{ delay: 50, type: 'complete', data: { success: true } }],
      });

      const dto = new LaunchAgentDto();
      dto.type = 'synthetic';
      dto.prompt = 'ID consistency test';
      dto.configuration = {};

      const launchedAgent = await orchestrationService.launchAgent(dto);

      // Verify: Agent in DB has same ID as returned agent
      const savedAgent = await agentRepository.findById(launchedAgent.id);

      expect(savedAgent).toBeDefined();
      expect(savedAgent!.id.toString()).toBe(launchedAgent.id.toString());
      expect(savedAgent!.session.prompt).toBe(launchedAgent.session.prompt);
    });
  });
});
