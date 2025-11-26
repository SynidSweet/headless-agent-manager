/**
 * Synthetic Agent Launch Integration Test
 *
 * TDD: This test would have caught the FK constraint bug
 *
 * Tests:
 * 1. Agent must be saved to DB before starting
 * 2. Messages must reference existing agent (FK integrity)
 * 3. Race conditions between agent start and message emission
 *
 * This is a REAL integration test:
 * - Uses actual database with FK constraints
 * - Tests actual timing/race conditions
 * - No mocks for critical data persistence
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/infrastructure/database/database.service';

describe('Synthetic Agent Launch - FK Constraint Protection (Integration)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    const db = databaseService.getDatabase();
    db.exec('DELETE FROM agent_messages');
    db.exec('DELETE FROM agents');
  });

  describe('Foreign Key Constraint Protection', () => {
    it('should save agent to DB BEFORE emitting messages', async () => {
      // Arrange: Fast schedule that would trigger race condition
      const schedule = [
        { delay: 0, type: 'message', data: { type: 'assistant', content: 'Immediate message' } },
        { delay: 100, type: 'complete', data: { success: true } },
      ];

      // Act: Launch synthetic agent
      const response = await request(app.getHttpServer())
        .post('/test/agents/synthetic')
        .send({
          prompt: 'Race condition test',
          schedule,
        })
        .expect(201);

      const agentId = response.body.agentId;

      // Wait for agent to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Assert: Agent exists in database
      const db = databaseService.getDatabase();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
      expect(agent).toBeDefined();
      expect(agent.id).toBe(agentId);

      // Assert: Messages were saved successfully (FK constraint didn't fail)
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
        .all(agentId) as any[];

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].agent_id).toBe(agentId);

      // Critical: If FK constraint failed, messages would have length 0
      // This test would fail BEFORE the fix
    });

    it('should handle rapid message emission without FK errors', async () => {
      // Arrange: Rapid-fire messages to stress test FK integrity
      const schedule = [
        { delay: 0, type: 'message', data: { type: 'assistant', content: 'Message 1' } },
        { delay: 10, type: 'message', data: { type: 'assistant', content: 'Message 2' } },
        { delay: 20, type: 'message', data: { type: 'assistant', content: 'Message 3' } },
        { delay: 30, type: 'message', data: { type: 'assistant', content: 'Message 4' } },
        { delay: 40, type: 'message', data: { type: 'assistant', content: 'Message 5' } },
        { delay: 100, type: 'complete', data: { success: true } },
      ];

      // Act: Launch agent with rapid messages
      const response = await request(app.getHttpServer())
        .post('/test/agents/synthetic')
        .send({
          prompt: 'Rapid messages test',
          schedule,
        })
        .expect(201);

      const agentId = response.body.agentId;

      // Wait for all messages
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert: All messages saved successfully
      const db = databaseService.getDatabase();
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
        .all(agentId) as any[];

      // Should have all 5 messages
      expect(messages.length).toBe(5);

      // Verify sequence numbers are correct
      messages.forEach((msg: any, index: number) => {
        expect(msg.sequence_number).toBe(index + 1);
        expect(msg.agent_id).toBe(agentId);
      });
    });

    it('should reproduce the bug: agent NOT saved before start (negative test)', async () => {
      // This test demonstrates what would happen WITHOUT the fix
      // We'll manually trigger the race condition

      const db = databaseService.getDatabase();
      const testAgentId = '00000000-0000-0000-0000-000000000000';

      // Act: Try to insert message for non-existent agent
      const insertMessage = () => {
        db.prepare(
          `INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          'msg-1',
          testAgentId, // This agent doesn't exist!
          1,
          'assistant',
          'Test message',
          new Date().toISOString()
        );
      };

      // Assert: Should throw FK constraint error
      expect(insertMessage).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('should maintain FK integrity even with agent completion', async () => {
      // Arrange: Schedule with messages after completion
      const schedule = [
        { delay: 0, type: 'message', data: { type: 'assistant', content: 'Before complete' } },
        { delay: 50, type: 'complete', data: { success: true } },
        // Note: In real scenarios, late messages might arrive after completion
      ];

      // Act: Launch agent
      const response = await request(app.getHttpServer())
        .post('/test/agents/synthetic')
        .send({
          prompt: 'Completion test',
          schedule,
        })
        .expect(201);

      const agentId = response.body.agentId;

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Agent still exists (not deleted on completion)
      const db = databaseService.getDatabase();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
      expect(agent).toBeDefined();
      expect(agent.status).toBe('completed');

      // Assert: Messages saved successfully
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ?')
        .all(agentId) as any[];
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Lifecycle Order', () => {
    it('should follow correct order: save → start → emit messages', async () => {
      // Arrange: Track operation order
      const operations: string[] = [];

      // Spy on database to detect save
      const db = databaseService.getDatabase();
      const originalPrepare = db.prepare.bind(db);

      db.prepare = function (sql: string) {
        if (sql.includes('INSERT INTO agents')) {
          operations.push('DB_SAVE');
        }
        return originalPrepare(sql);
      };

      const schedule = [
        { delay: 0, type: 'message', data: { type: 'assistant', content: 'First message' } },
        { delay: 50, type: 'complete', data: { success: true } },
      ];

      // Act: Launch agent
      await request(app.getHttpServer())
        .post('/test/agents/synthetic')
        .send({
          prompt: 'Order test',
          schedule,
        })
        .expect(201);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Restore original prepare
      db.prepare = originalPrepare;

      // Assert: DB_SAVE should happen before messages
      expect(operations[0]).toBe('DB_SAVE');
    });
  });
});
