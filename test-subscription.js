/**
 * Minimal test to verify WebSocket subscription flow
 * Tests that backend emits 'subscribed' event when client subscribes
 */

const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3001';

console.log('🔌 Connecting to backend:', BACKEND_URL);

const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  reconnection: false,
});

socket.on('connect', async () => {
  console.log('✅ Connected with socket ID:', socket.id);

  // Set up listener for 'subscribed' event
  const subscriptionPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for subscribed event (10s)'));
    }, 10000);

    socket.on('subscribed', (data) => {
      console.log('✅ Received subscribed event:', data);
      clearTimeout(timeout);
      resolve(data);
    });

    socket.on('error', (error) => {
      console.error('❌ Received error event:', error);
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Emit subscribe message
  const testAgentId = 'test-agent-' + Date.now();
  console.log('📤 Emitting subscribe for agent:', testAgentId);
  socket.emit('subscribe', { agentId: testAgentId });

  try {
    const result = await subscriptionPromise;
    console.log('🎉 SUCCESS! Subscription flow works correctly');
    console.log('   Received:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('💥 FAILED! Subscription flow is broken');
    console.error('   Error:', error.message);
    process.exit(1);
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected');
});

// Auto-exit after 15 seconds
setTimeout(() => {
  console.error('⏱️  Test timed out after 15s');
  process.exit(1);
}, 15000);
