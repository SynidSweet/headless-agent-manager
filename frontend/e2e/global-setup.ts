/**
 * Playwright Global Setup
 * Validates that required servers are running before E2E tests begin
 *
 * IMPORTANT: This file must not import anything from src/ or test/
 * to avoid conflicts with Vitest
 */

async function globalSetup() {
  const http = await import('http');

  console.log('🔍 Checking backend server health...');

  const port = 3001; // Dev backend port

  return new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/api/agents',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          console.log('✅ Backend is running and healthy\n');
          console.log('🚀 Starting E2E tests with real backend integration\n');
          resolve();
        } else {
          reject(new Error(`Backend returned status ${res.statusCode}`));
        }
      }
    );

    req.on('error', (error: any) => {
      console.error('\n❌ BACKEND SERVER NOT RUNNING\n');
      console.error(`The E2E tests require the backend server to be running on port ${port}.`);
      console.error('\n📝 To start the development environment:');
      console.error('  ./scripts/start-dev.sh');
      console.error('\n📝 Or start backend manually:');
      console.error('  cd backend');
      console.error('  NODE_ENV=development PORT=3001 npm run dev');
      console.error('\n▶️  Then re-run E2E tests:');
      console.error('  npm run test:e2e\n');
      reject(new Error(`Backend not accessible: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('\n❌ BACKEND TIMEOUT\n');
      console.error('Backend did not respond within 5 seconds.');
      reject(new Error('Backend health check timeout'));
    });

    req.end();
  });
}

export default globalSetup;
