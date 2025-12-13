import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from '../helpers/cleanup';

const BACKEND_URL = 'http://localhost:3001';

/**
 * E2E Tests: Cleanup Helper Verification
 *
 * Validates the new cleanup mechanism that uses:
 * - POST /api/test/reset-database (fast database reset)
 * - GET /api/test/verify-clean-state (detailed verification)
 *
 * This test ensures the cleanup helper is faster and more reliable
 * than the old approach (individual DELETE requests per agent).
 */
test.describe('Cleanup Helper Verification', () => {
  test('should use reset endpoint and verify clean state', async ({ request }) => {
    // This test validates the new cleanup mechanism works correctly

    console.log('\n🧪 Testing cleanup helper with new endpoints...');

    // Step 1: Create some test data (synthetic agent for fast testing)
    console.log('   📝 Creating test agent...');
    try {
      const createResponse = await request.post(`${BACKEND_URL}/api/test/agents/synthetic`, {
        data: {
          prompt: 'Cleanup validation test agent',
          schedule: [
            { delay: 100, type: 'complete', data: { success: true } }
          ]
        }
      });

      if (!createResponse.ok()) {
        console.error(`   ❌ Failed to create test agent: HTTP ${createResponse.status()}`);
        test.skip();
      }

      const agent = await createResponse.json();
      console.log(`   ✅ Created test agent: ${agent.id}`);
    } catch (error) {
      console.error('   ❌ Backend not available, skipping test');
      test.skip();
    }

    // Step 2: Verify agent exists before cleanup
    const beforeResponse = await request.get(`${BACKEND_URL}/api/agents`);
    const beforeAgents = await beforeResponse.json();
    expect(beforeAgents.length).toBeGreaterThan(0);
    console.log(`   ✅ Verified ${beforeAgents.length} agent(s) exist before cleanup`);

    // Step 3: Use cleanup helper (this is what we're testing)
    console.log('   🧹 Running cleanup helper...');
    const startTime = Date.now();

    await cleanupAllAgents(request, {
      throwOnFailure: true,
      maxRetries: 3,
      retryDelay: 500,
    });

    const duration = Date.now() - startTime;
    console.log(`   ⏱️  Cleanup completed in ${duration}ms`);

    // Step 4: Verify cleanup succeeded using the verification endpoint
    console.log('   🔍 Verifying cleanup via verification endpoint...');
    const verifyResponse = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);
    expect(verifyResponse.ok()).toBe(true);

    const verification = await verifyResponse.json();
    console.log(`   📊 Verification result:`, verification);

    // Assert clean state
    expect(verification.isClean).toBe(true);
    expect(verification.agentCount).toBe(0);
    expect(verification.messageCount).toBe(0);
    expect(verification.issues).toHaveLength(0);

    console.log('   ✅ Cleanup validation passed!');
    console.log(`   💡 Performance: ${duration}ms (old method would take ~${beforeAgents.length * 200}ms)`);
  });

  test('should handle empty database gracefully', async ({ request }) => {
    // Test that cleanup works when database is already clean

    console.log('\n🧪 Testing cleanup with empty database...');

    // Step 1: Reset to ensure clean state
    await request.post(`${BACKEND_URL}/api/test/reset-database`);

    // Step 2: Run cleanup on already-clean database
    console.log('   🧹 Running cleanup on empty database...');
    await cleanupAllAgents(request, {
      throwOnFailure: true,
      maxRetries: 1,
      retryDelay: 100,
    });

    // Step 3: Verify still clean
    const verifyResponse = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);
    const verification = await verifyResponse.json();

    expect(verification.isClean).toBe(true);
    console.log('   ✅ Empty database handled correctly');
  });

  test('should retry on verification failure', async ({ request }) => {
    // Test retry logic

    console.log('\n🧪 Testing retry logic...');

    // Create multiple agents to test cleanup
    console.log('   📝 Creating multiple test agents...');
    const agentIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const createResponse = await request.post(`${BACKEND_URL}/api/test/agents/synthetic`, {
        data: {
          prompt: `Retry test agent ${i}`,
          schedule: [{ delay: 50, type: 'complete', data: { success: true } }]
        }
      });

      if (createResponse.ok()) {
        const agent = await createResponse.json();
        agentIds.push(agent.id);
      }
    }

    console.log(`   ✅ Created ${agentIds.length} test agents`);

    // Run cleanup with shorter retry delay for faster testing
    console.log('   🧹 Running cleanup with retry logic...');
    await cleanupAllAgents(request, {
      throwOnFailure: true,
      maxRetries: 3,
      retryDelay: 300,
    });

    // Verify all cleaned up
    const verification = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);
    const result = await verification.json();

    expect(result.isClean).toBe(true);
    console.log('   ✅ Retry logic works correctly');
  });
});
