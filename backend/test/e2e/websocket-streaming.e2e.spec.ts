import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { DatabaseService } from '@infrastructure/database/database.service';

/**
 * WebSocket Streaming E2E Tests
 *
 * Tests REAL WebSocket streaming with message persistence using:
 * - socket.io-client for REAL WebSocket connections
 * - Synthetic agent adapter for controllable message timing
 * - Full NestJS application stack
 *
 * Critical validations:
 * 1. Messages stream reactively via WebSocket as they arrive
 * 2. ALL messages are persisted to database BEFORE WebSocket emission
 * 3. Message order is preserved (sequence numbers)
 * 4. Agent status transitions preserve existing messages
 * 5. Multiple clients can subscribe and receive same messages
 * 6. Database-first pattern: DB save happens before WebSocket emit
 */
describe('WebSocket Streaming E2E', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let dbService: DatabaseService;
  const testPort = 3002; // Use different port for E2E

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();

    // Apply same configuration as main.ts
    app.enableCors();
    app.setGlobalPrefix('api');

    await app.init();
    await app.listen(testPort);

    // Get database service for direct queries
    dbService = app.get(DatabaseService);
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  beforeEach(async () => {
    // Reset database before each test
    await request(app.getHttpServer())
      .post('/api/test/reset-database')
      .expect(204);
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Real-time message streaming', () => {
    it('should receive messages via WebSocket as they arrive', async () => {
      // Connect WebSocket client
      clientSocket = io(`http://localhost:${testPort}`);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => resolve());
      });

      expect(clientSocket.connected).toBe(true);

      // Subscribe to agent messages
      const messagesReceived: any[] = [];

      clientSocket.on('agent:message', (message) => {
        messagesReceived.push(message);
        console.log(`📨 Received message ${messagesReceived.length}: ${message.message?.type}`);
      });

      // Create synthetic agent that streams messages
      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test real-time streaming',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Message 1', type: 'assistant' } },
            { delay: 200, type: 'message', data: { content: 'Message 2', type: 'assistant' } },
            { delay: 300, type: 'message', data: { content: 'Message 3', type: 'assistant' } },
            { delay: 400, type: 'message', data: { content: 'Message 4', type: 'assistant' } },
            { delay: 500, type: 'message', data: { content: 'Message 5', type: 'assistant' } },
            { delay: 600, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;

      // Subscribe to this specific agent
      clientSocket.emit('subscribe', { agentId });

      // Wait for all messages to stream
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should have received all 5 messages via WebSocket
      expect(messagesReceived.length).toBe(5);

      // Messages should be in order
      messagesReceived.forEach((msg, i) => {
        expect(msg.message.sequenceNumber).toBe(i + 1);
        expect(msg.message.content).toBe(`Message ${i + 1}`);
      });
    }, 10000);

    it('should persist ALL streamed messages to database', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const messagesViaWebSocket: any[] = [];

      clientSocket.on('agent:message', (message) => {
        messagesViaWebSocket.push(message);
      });

      // Create agent with 10 messages
      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test message persistence',
          schedule: [
            ...Array.from({ length: 10 }, (_, i) => ({
              delay: (i + 1) * 50,
              type: 'message' as const,
              data: { content: `Msg ${i + 1}`, type: 'assistant' },
            })),
            { delay: 600, type: 'complete' as const, data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for all messages
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get messages from database directly
      const db = dbService.getDatabase();
      const dbMessages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
        .all(agentId);

      // Database should have ALL 10 messages
      expect(dbMessages.length).toBe(10);

      // WebSocket should have received them all too
      expect(messagesViaWebSocket.length).toBe(10);

      console.log(`✅ WebSocket: ${messagesViaWebSocket.length}, Database: ${dbMessages.length}`);

      // Verify content matches
      for (let i = 0; i < 10; i++) {
        expect((dbMessages[i] as any).content).toBe(`Msg ${i + 1}`);
        expect((dbMessages[i] as any).sequence_number).toBe(i + 1);
      }
    }, 10000);

    it('should receive messages in correct order', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const messagesReceived: any[] = [];
      clientSocket.on('agent:message', msg => messagesReceived.push(msg));

      const messageCount = 20;
      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test message ordering',
          schedule: [
            ...Array.from({ length: messageCount }, (_, i) => ({
              delay: (i + 1) * 25,
              type: 'message' as const,
              data: { content: `Ordered ${i + 1}`, type: 'assistant' },
            })),
            { delay: 600, type: 'complete' as const, data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify sequential order
      expect(messagesReceived.length).toBe(messageCount);

      for (let i = 0; i < messagesReceived.length; i++) {
        expect(messagesReceived[i].message.sequenceNumber).toBe(i + 1);
        expect(messagesReceived[i].message.content).toBe(`Ordered ${i + 1}`);
      }
    }, 10000);
  });

  describe('Message persistence before streaming', () => {
    it('should persist messages BEFORE emitting to WebSocket (database-first pattern)', async () => {
      // This is CRITICAL: database-first pattern
      // Messages must be in DB before WebSocket clients receive them

      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      let firstMessageTimestamp = 0;
      let dbCheckPassed = false;

      clientSocket.on('agent:message', (payload) => {
        if (firstMessageTimestamp === 0) {
          firstMessageTimestamp = Date.now();

          // Check database IMMEDIATELY when WebSocket fires
          const db = dbService.getDatabase();
          const dbMsg = db
            .prepare('SELECT * FROM agent_messages WHERE id = ?')
            .get(payload.message.id);

          // Message MUST exist in database (database-first pattern)
          expect(dbMsg).toBeDefined();
          expect((dbMsg as any).id).toBe(payload.message.id);

          dbCheckPassed = true;
          console.log('✅ Database-first pattern verified: Message in DB before WebSocket emission');
        }
      });

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test database-first pattern',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'First', type: 'assistant' } },
            { delay: 200, type: 'message', data: { content: 'Second', type: 'assistant' } },
            { delay: 300, type: 'message', data: { content: 'Third', type: 'assistant' } },
            { delay: 400, type: 'message', data: { content: 'Fourth', type: 'assistant' } },
            { delay: 500, type: 'message', data: { content: 'Fifth', type: 'assistant' } },
            { delay: 600, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(firstMessageTimestamp).toBeGreaterThan(0);
      expect(dbCheckPassed).toBe(true);
    }, 10000);

    it('should have all messages in database after streaming completes', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const messageCount = 15;
      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test complete persistence',
          schedule: [
            ...Array.from({ length: messageCount }, (_, i) => ({
              delay: (i + 1) * 30,
              type: 'message' as const,
              data: { content: `Complete ${i + 1}`, type: 'assistant' },
            })),
            { delay: 600, type: 'complete' as const, data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Query database
      const db = dbService.getDatabase();
      const dbMessages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number')
        .all(agentId);

      // ALL 15 messages should be persisted
      expect(dbMessages).toHaveLength(messageCount);

      // Sequence numbers should be sequential
      dbMessages.forEach((msg: any, i) => {
        expect(msg.sequence_number).toBe(i + 1);
        expect(msg.content).toBe(`Complete ${i + 1}`);
      });

      console.log(`✅ All ${dbMessages.length} streamed messages persisted to database`);
    }, 10000);
  });

  describe('Agent status changes preserve messages', () => {
    it('should preserve messages when agent completes', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const messageCount = 5;
      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test status preservation',
          schedule: [
            ...Array.from({ length: messageCount }, (_, i) => ({
              delay: (i + 1) * 100,
              type: 'message' as const,
              data: { content: `Status ${i + 1}`, type: 'assistant' },
            })),
            { delay: 700, type: 'complete' as const, data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for streaming
      await new Promise(resolve => setTimeout(resolve, 600));

      // Get messages before completion
      const db = dbService.getDatabase();
      const messagesBefore = db
        .prepare('SELECT COUNT(*) as c FROM agent_messages WHERE agent_id = ?')
        .get(agentId) as { c: number };

      console.log(`Messages before completion: ${messagesBefore.c}`);
      expect(messagesBefore.c).toBe(messageCount);

      // Wait for agent to complete (which triggers repository.save())
      await new Promise(resolve => setTimeout(resolve, 300));

      // Messages should STILL exist (UPDATE not INSERT OR REPLACE)
      const messagesAfter = db
        .prepare('SELECT COUNT(*) as c FROM agent_messages WHERE agent_id = ?')
        .get(agentId) as { c: number };

      console.log(`Messages after completion: ${messagesAfter.c}`);

      expect(messagesAfter.c).toBe(messagesBefore.c);
      expect(messagesAfter.c).toBe(messageCount);

      // Verify agent status is completed
      const agent = db
        .prepare('SELECT status FROM agents WHERE id = ?')
        .get(agentId) as { status: string };

      expect(agent.status).toBe('completed');
    }, 10000);

    it('should preserve messages when agent fails', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test error preservation',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Error 1', type: 'assistant' } },
            { delay: 200, type: 'message', data: { content: 'Error 2', type: 'assistant' } },
            { delay: 300, type: 'message', data: { content: 'Error 3', type: 'assistant' } },
            { delay: 400, type: 'error', data: { message: 'Synthetic error' } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 600));

      // Messages should STILL exist after error
      const db = dbService.getDatabase();
      const messages = db
        .prepare('SELECT COUNT(*) as c FROM agent_messages WHERE agent_id = ?')
        .get(agentId) as { c: number };

      expect(messages.c).toBe(3);

      // Verify agent status is failed
      const agent = db
        .prepare('SELECT status FROM agents WHERE id = ?')
        .get(agentId) as { status: string };

      expect(agent.status).toBe('failed');
    }, 10000);
  });

  describe('Multiple client subscriptions', () => {
    it('should deliver same messages to multiple subscribed clients', async () => {
      // Create two WebSocket clients
      const client1 = io(`http://localhost:${testPort}`);
      const client2 = io(`http://localhost:${testPort}`);

      await Promise.all([
        new Promise<void>(resolve => client1.on('connect', () => resolve())),
        new Promise<void>(resolve => client2.on('connect', () => resolve())),
      ]);

      const client1Messages: any[] = [];
      const client2Messages: any[] = [];

      client1.on('agent:message', msg => client1Messages.push(msg));
      client2.on('agent:message', msg => client2Messages.push(msg));

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test multi-client',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Multi 1', type: 'assistant' } },
            { delay: 200, type: 'message', data: { content: 'Multi 2', type: 'assistant' } },
            { delay: 300, type: 'message', data: { content: 'Multi 3', type: 'assistant' } },
            { delay: 400, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;

      // Both clients subscribe
      client1.emit('subscribe', { agentId });
      client2.emit('subscribe', { agentId });

      await new Promise(resolve => setTimeout(resolve, 600));

      // Both clients should receive same messages
      expect(client1Messages.length).toBe(3);
      expect(client2Messages.length).toBe(3);

      for (let i = 0; i < 3; i++) {
        expect(client1Messages[i].message.content).toBe(`Multi ${i + 1}`);
        expect(client2Messages[i].message.content).toBe(`Multi ${i + 1}`);
        expect(client1Messages[i].message.id).toBe(client2Messages[i].message.id);
      }

      // Cleanup
      client1.disconnect();
      client2.disconnect();
    }, 10000);

    it('should allow client to unsubscribe and stop receiving messages', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      const messagesReceived: any[] = [];
      clientSocket.on('agent:message', msg => messagesReceived.push(msg));

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test unsubscribe',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Unsub 1', type: 'assistant' } },
            { delay: 200, type: 'message', data: { content: 'Unsub 2', type: 'assistant' } },
            { delay: 300, type: 'message', data: { content: 'Unsub 3', type: 'assistant' } },
            { delay: 400, type: 'message', data: { content: 'Unsub 4', type: 'assistant' } },
            { delay: 500, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for first 2 messages
      await new Promise(resolve => setTimeout(resolve, 250));

      // Unsubscribe
      clientSocket.emit('unsubscribe', { agentId });

      // Wait for remaining messages
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should only have received first 2 messages
      expect(messagesReceived.length).toBeLessThanOrEqual(2);

      console.log(`✅ Received ${messagesReceived.length} messages before unsubscribe`);
    }, 10000);
  });

  describe('WebSocket connection lifecycle', () => {
    it('should receive agent:created event when agent launches', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      let agentCreatedEvent: any = null;
      clientSocket.on('agent:created', (event) => {
        agentCreatedEvent = event;
        console.log('📢 agent:created event received:', event);
      });

      await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test agent:created',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Created', type: 'assistant' } },
            { delay: 200, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(agentCreatedEvent).not.toBeNull();
      expect(agentCreatedEvent.agent).toBeDefined();
      expect(agentCreatedEvent.agent.status).toBe('running');
    }, 10000);

    it('should receive agent:complete event when agent finishes', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      let completeEvent: any = null;
      clientSocket.on('agent:complete', (event) => {
        completeEvent = event;
        console.log('✅ agent:complete event received:', event);
      });

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test completion event',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Msg', type: 'assistant' } },
            { delay: 200, type: 'complete', data: { success: true } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(completeEvent).not.toBeNull();
      expect(completeEvent.agentId).toBe(agentId);
      expect(completeEvent.result).toBeDefined();
    }, 10000);

    it('should receive agent:error event when agent fails', async () => {
      clientSocket = io(`http://localhost:${testPort}`);
      await new Promise<void>(resolve => clientSocket.on('connect', () => resolve()));

      let errorEvent: any = null;
      clientSocket.on('agent:error', (event) => {
        errorEvent = event;
        console.log('❌ agent:error event received:', event);
      });

      const launchResponse = await request(app.getHttpServer())
        .post('/api/test/agents/synthetic')
        .send({
          prompt: 'Test error event',
          schedule: [
            { delay: 100, type: 'message', data: { content: 'Before error', type: 'assistant' } },
            { delay: 200, type: 'error', data: { message: 'Test error' } },
          ],
        })
        .expect(201);

      const agentId = launchResponse.body.agentId;
      clientSocket.emit('subscribe', { agentId });

      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(errorEvent).not.toBeNull();
      expect(errorEvent.agentId).toBe(agentId);
      expect(errorEvent.error).toBeDefined();
      expect(errorEvent.error.message).toContain('Test error');
    }, 10000);
  });
});
