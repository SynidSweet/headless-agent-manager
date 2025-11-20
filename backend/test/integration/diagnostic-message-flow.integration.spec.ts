import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@infrastructure/infrastructure.module';

/**
 * DIAGNOSTIC TEST: End-to-end message flow
 * Tests the complete path: Agent → Adapter → StreamingService → WebSocket → Client
 * This should FAIL until the FK constraint issue is fixed
 */
describe('Message Flow Diagnostic (Integration)', () => {
  let app: INestApplication;
  let wsClient: Socket;
  const messages: any[] = [];
  const errors: any[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(3001); // Use different port for test
  });

  afterAll(async () => {
    if (wsClient) wsClient.disconnect();
    await app.close();
  });

  it('DIAGNOSTIC: should show where message flow breaks', async () => {
    console.log('\n═══════ DIAGNOSTIC TEST START ═══════');

    // 1. Connect WebSocket
    wsClient = io('http://localhost:3001');

    await new Promise<void>((resolve) => {
      wsClient.on('connected', (data) => {
        console.log('✓ WebSocket connected:', data.clientId);
        resolve();
      });
    });

    // 2. Set up message listener
    wsClient.on('agent:message', (data) => {
      console.log('✓ Received agent:message event:', data);
      messages.push(data);
    });

    wsClient.on('agent:error', (data) => {
      console.log('⚠ Received agent:error event:', data);
      errors.push(data);
    });

    // 3. Launch agent
    const launchResp = await request(app.getHttpServer())
      .post('/api/agents')
      .send({
        type: 'claude-code',
        prompt: 'Say "DIAGNOSTIC_TEST" and nothing else. No tools.',
        configuration: {},
      });

    const agentId = launchResp.body.agentId;
    console.log('✓ Agent launched:', agentId);

    // 4. Subscribe to agent
    wsClient.emit('subscribe', { agentId });

    await new Promise<void>((resolve) => {
      wsClient.on('subscribed', (data) => {
        console.log('✓ Subscribed to agent:', data.agentId);
        resolve();
      });
    });

    // 5. Wait for messages (or timeout)
    console.log('⏳ Waiting for messages...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 6. Report findings
    console.log('\n═══════ DIAGNOSTIC RESULTS ═══════');
    console.log('Messages received:', messages.length);
    console.log('Errors received:', errors.length);

    if (messages.length > 0) {
      console.log('✓ MESSAGES ARRIVING AT WEBSOCKET');
      messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. Type: ${msg.message?.type}, Content: ${msg.message?.content?.substring(0, 50)}`);
      });
    } else {
      console.log('❌ NO MESSAGES RECEIVED AT WEBSOCKET');
    }

    if (errors.length > 0) {
      console.log('⚠ ERRORS RECEIVED:');
      errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.error?.message}`);
      });
    }

    console.log('═══════ END DIAGNOSTIC ═══════\n');

    // ASSERTION: This should PASS if fix is working
    expect(messages.length).toBeGreaterThan(0);
  }, 60000); // 60 second timeout
});
