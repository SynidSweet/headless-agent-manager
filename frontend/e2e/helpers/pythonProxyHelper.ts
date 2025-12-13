/**
 * Python Proxy Availability Helper
 *
 * Provides utilities to check if the Python proxy service is available
 * before running tests that require real Claude CLI integration.
 */

/**
 * Check if Python proxy service is available
 *
 * @param url - The Python proxy URL (default: http://localhost:8000)
 * @returns true if service is running and healthy
 *
 * @example
 * const available = await isPythonProxyAvailable();
 * if (!available) {
 *   console.log('Python proxy not available - skipping tests');
 * }
 */
export async function isPythonProxyAvailable(
  url: string = 'http://localhost:8000'
): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get a descriptive message about Python proxy availability
 *
 * @param available - Whether the proxy is available
 * @returns A user-friendly status message
 */
export function getPythonProxyMessage(available: boolean): string {
  if (available) {
    return '✅ Python proxy service is available';
  }

  return [
    '⚠️  Python proxy not available - skipping Python proxy tests',
    '',
    '   To run these tests, start the Python proxy service:',
    '   $ cd claude-proxy-service',
    '   $ source venv/bin/activate',
    '   $ uvicorn app.main:app --reload',
    '',
    '   These tests validate real Claude CLI integration and are optional.',
  ].join('\n');
}
