/**
 * WebSocket Event Emission Integration Tests
 *
 * Validates that WebSocket events are emitted correctly when agents are launched/terminated.
 *
 * TDD METHODOLOGY:
 * 1. RED: Write test that demonstrates the bug
 * 2. GREEN: Fix the code to make test pass
 * 3. REFACTOR: Clean up if needed
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';

describe('WebSocket Event Emission Integration', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let serverUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // Match production setup
    await app.init();
    await app.listen(0); // Use random available port

    // Get the actual port assigned
    const address = app.getHttpServer().address();
    const port = address.port;
    serverUrl = `http://localhost:${port}`;

    console.log('[Test Suite] Server listening on:', serverUrl);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach((done) => {
    // Create fresh WebSocket client for each test
    clientSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    clientSocket.on('connect', () => {
      console.log('[Test] WebSocket connected:', clientSocket.id);
      done();
    });

    clientSocket.on('connect_error', (error) => {
      console.error('[Test] WebSocket connection error:', error);
      done(error);
    });
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.close();
    }

    // Clean up all agents
    await request(app.getHttpServer()).post('/api/test/reset-database').expect(204);
  });

  /**
   * RED: Test that should initially fail (demonstrating the bug)
   *
   * This test validates that agent:created event is emitted when
   * an agent is launched via POST /api/agents.
   */
  it('should emit agent:created event when agent is launched via POST /api/agents', (done) => {
    // Setup: Listen for agent:created event
    let receivedEvent = false;
    let eventData: any = null;

    clientSocket.on('agent:created', (data) => {
      console.log('[Test] Received agent:created event:', data);
      receivedEvent = true;
      eventData = data;
    });

    // Execute: Launch agent via REST API
    request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'claude-code',
        prompt: 'Test prompt for event emission',
      })
      .expect(201)
      .then((response) => {
        const { agentId } = response.body;
        console.log('[Test] Agent launched:', agentId);

        // Wait for event to arrive (give it 5 seconds)
        setTimeout(() => {
          // Assert: Event should have been received
          expect(receivedEvent).toBe(true);
          expect(eventData).toBeDefined();
          expect(eventData.agent).toBeDefined();
          expect(eventData.agent.id).toBe(agentId);
          expect(eventData.agent.type).toBe('claude-code');
          expect(eventData.timestamp).toBeDefined();

          done();
        }, 5000);
      })
      .catch((error) => {
        done(error);
      });
  }, 10000); // 10 second timeout for whole test

  /**
   * Test: agent:deleted event emission
   *
   * Validates that agent:deleted event is emitted when
   * an agent is terminated via DELETE /api/agents/:id
   */
  it('should emit agent:deleted event when agent is terminated', (done) => {
    let agentId: string;

    // Setup: Listen for agent:deleted event
    let receivedDeletedEvent = false;
    let deletedEventData: any = null;

    clientSocket.on('agent:deleted', (data) => {
      console.log('[Test] Received agent:deleted event:', data);
      receivedDeletedEvent = true;
      deletedEventData = data;
    });

    // First: Launch an agent
    request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'claude-code',
        prompt: 'Test prompt',
      })
      .expect(201)
      .then((response) => {
        agentId = response.body.agentId;
        console.log('[Test] Agent launched:', agentId);

        // Then: Terminate the agent
        return request(app.getHttpServer())
          .delete(`/api/agents/${agentId}?force=true`)
          .expect(204);
      })
      .then(() => {
        console.log('[Test] Agent terminated:', agentId);

        // Wait for event to arrive
        setTimeout(() => {
          // Assert: Event should have been received
          expect(receivedDeletedEvent).toBe(true);
          expect(deletedEventData).toBeDefined();
          expect(deletedEventData.agentId).toBe(agentId);
          expect(deletedEventData.timestamp).toBeDefined();

          done();
        }, 3000);
      })
      .catch((error) => {
        done(error);
      });
  }, 15000); // 15 second timeout

  /**
   * Test: Multiple WebSocket clients receive events
   *
   * Validates that emitToAll() broadcasts to all connected clients
   */
  it('should broadcast agent:created to all connected WebSocket clients', (done) => {
    // Create second WebSocket client
    const client2 = io(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    client2.on('connect', () => {
      console.log('[Test] Client 2 connected:', client2.id);

      // Setup: Both clients listen for agent:created
      let client1Received = false;
      let client2Received = false;

      clientSocket.on('agent:created', () => {
        console.log('[Test] Client 1 received agent:created');
        client1Received = true;
        checkBothReceived();
      });

      client2.on('agent:created', () => {
        console.log('[Test] Client 2 received agent:created');
        client2Received = true;
        checkBothReceived();
      });

      const checkBothReceived = () => {
        if (client1Received && client2Received) {
          console.log('[Test] ✅ Both clients received event');
          client2.close();
          done();
        }
      };

      // Execute: Launch agent
      request(app.getHttpServer())
        .post('/api/agents')
        .send({
          type: 'claude-code',
          prompt: 'Test broadcast',
        })
        .expect(201)
        .then((response) => {
          console.log('[Test] Agent launched:', response.body.agentId);

          // Wait for events
          setTimeout(() => {
            // If we get here without both receiving, test fails
            if (!client1Received || !client2Received) {
              client2.close();
              done(
                new Error(
                  `Not all clients received event. Client1: ${client1Received}, Client2: ${client2Received}`
                )
              );
            }
          }, 5000);
        })
        .catch((error) => {
          client2.close();
          done(error);
        });
    });

    client2.on('connect_error', (error) => {
      console.error('[Test] Client 2 connection error:', error);
      client2.close();
      done(error);
    });
  }, 15000);

  /**
   * Test: Event payload structure
   *
   * Validates that agent:created event has correct payload structure
   */
  it('should emit agent:created with correct payload structure', (done) => {
    clientSocket.on('agent:created', (data) => {
      console.log('[Test] Received event data:', JSON.stringify(data, null, 2));

      // Validate structure
      expect(data).toHaveProperty('agent');
      expect(data).toHaveProperty('timestamp');

      expect(data.agent).toHaveProperty('id');
      expect(data.agent).toHaveProperty('type');
      expect(data.agent).toHaveProperty('status');
      expect(data.agent).toHaveProperty('session');
      expect(data.agent.session).toHaveProperty('prompt'); // Prompt is nested in session
      expect(data.agent).toHaveProperty('createdAt');

      // Validate types
      expect(typeof data.agent.id).toBe('string');
      expect(typeof data.agent.type).toBe('string');
      expect(typeof data.agent.status).toBe('string');
      expect(typeof data.timestamp).toBe('string');

      done();
    });

    // Launch agent
    request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'claude-code',
        prompt: 'Test payload structure',
      })
      .expect(201)
      .catch((error) => {
        done(error);
      });
  }, 10000);
});
