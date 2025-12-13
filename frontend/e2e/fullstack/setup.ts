/**
 * Full-Stack Test Setup
 * Validates all services are running before tests
 */

import { isPythonProxyAvailable } from '../helpers/pythonProxyHelper';

export interface TestEnvironment {
  pythonProxyUrl: string;
  backendUrl: string;
  frontendUrl: string;
  pythonProxyAvailable: boolean;
}

export async function checkPythonProxy(url: string): Promise<boolean> {
  return isPythonProxyAvailable(url);
}

export async function checkBackend(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/agents`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkFrontend(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function setupFullStackTest(): Promise<TestEnvironment> {
  const env: TestEnvironment = {
    pythonProxyUrl: process.env.PYTHON_PROXY_URL || 'http://localhost:8000',
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3001', // DEV: port 3001 (prod uses 3000)
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5174', // DEV: port 5174 (prod uses 5173)
    pythonProxyAvailable: false,
  };

  // Check Python proxy (optional - tests will skip if not available)
  const proxyOk = await checkPythonProxy(env.pythonProxyUrl);
  env.pythonProxyAvailable = proxyOk;

  if (!proxyOk) {
    console.log(`⚠️  Python proxy not running at ${env.pythonProxyUrl}`);
    console.log('   Tests requiring Python proxy will be skipped');
    console.log('   Start it: cd claude-proxy-service && uvicorn app.main:app --reload');
  }

  // Check backend (required)
  const backendOk = await checkBackend(env.backendUrl);
  if (!backendOk) {
    throw new Error(
      `❌ Backend not running at ${env.backendUrl}\n` +
      '   Start it: cd backend && npm run dev'
    );
  }

  // Check frontend (required)
  const frontendOk = await checkFrontend(env.frontendUrl);
  if (!frontendOk) {
    throw new Error(
      `❌ Frontend not running at ${env.frontendUrl}\n` +
      '   Start it: cd frontend && npm run dev'
    );
  }

  console.log('✅ Required services running:');
  console.log(`   Backend:      ${env.backendUrl}`);
  console.log(`   Frontend:     ${env.frontendUrl}`);
  if (proxyOk) {
    console.log(`   Python Proxy: ${env.pythonProxyUrl} ✅`);
  } else {
    console.log(`   Python Proxy: ${env.pythonProxyUrl} ⚠️  (not available - tests will skip)`);
  }

  return env;
}

export async function cleanupAgents(backendUrl: string): Promise<void> {
  try {
    // Use test endpoint to reset database (fastest and most reliable)
    const response = await fetch(`${backendUrl}/api/test/reset-database`, {
      method: 'POST',
    });

    if (response.ok) {
      console.log('🧹 Database reset - all agents and messages cleared');
    } else {
      console.warn('Failed to reset database:', response.status);
    }

    // Wait for cleanup to propagate
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
}
