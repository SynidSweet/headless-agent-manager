const io = require('socket.io-client');
const fetch = require('node-fetch');

console.log('🔍 WebSocket Event Emission Diagnostic Test\n');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected to backend');
  console.log('   Socket ID:', socket.id);
  console.log('   Listening for ALL events...\n');

  // Listen for ANY events
  socket.onAny((event, ...args) => {
    console.log(`📨 Event received: "${event}"`);
    console.log('   Data:', JSON.stringify(args, null, 2));
    console.log('');
  });

  // Wait 2 seconds for connection to stabilize
  setTimeout(() => {
    console.log('🚀 Launching test agent via HTTP POST...\n');

    // Launch a test agent via HTTP
    fetch('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'claude-code',
        prompt: 'Run: echo "WebSocket test"',
      }),
    })
      .then(r => {
        console.log(`   HTTP Response Status: ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        console.log('   Agent launched:', data.id);
        console.log('   Status:', data.status);
        console.log('\n⏳ Waiting for agent:created event...\n');
      })
      .catch(err => {
        console.error('❌ HTTP request failed:', err.message);
      });
  }, 2000);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from backend');
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection error:', err.message);
});

// Exit after 30 seconds
setTimeout(() => {
  console.log('\n⏰ 30 seconds passed - closing');
  socket.close();
  process.exit(0);
}, 30000);
