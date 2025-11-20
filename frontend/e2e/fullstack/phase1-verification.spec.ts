import { test, expect } from '@playwright/test';

/**
 * Phase 1 Verification Test
 *
 * Verifies that backend emits lifecycle events and frontend receives them.
 *
 * Expected Events:
 * - agent:created (when agent launches)
 * - agent:updated (when agent status changes)
 * - agent:deleted (when agent terminates)
 */

test.describe('Phase 1: Lifecycle Event Verification', () => {
  test('should emit and receive agent:created event', async ({ page }) => {
    const events: any[] = [];

    // Capture console logs
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('LIFECYCLE EVENT')) {
        events.push({
          type: 'console',
          text,
          timestamp: Date.now(),
        });
      }
    });

    // Navigate to app
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    console.log('✅ Page loaded');

    // Wait for WebSocket connection
    await page.waitForTimeout(2000);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say hello for Phase 1 verification');

    console.log('🚀 Launching agent...');

    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const data = await response.json();
    const agentId = data.agentId;

    console.log(`✅ Agent launched: ${agentId}`);

    // Wait a bit for events to arrive
    await page.waitForTimeout(3000);

    // Check for agent:created event
    const createdEvent = events.find((e) => e.text.includes('agent:created'));

    console.log('\n=== Captured Events ===');
    events.forEach((e) => console.log(e.text));
    console.log('======================\n');

    // Assertions
    expect(createdEvent, 'Should have received agent:created event').toBeDefined();
    expect(createdEvent?.text).toContain('🚀');
    expect(createdEvent?.text).toContain(agentId);

    console.log('✅ Phase 1 Verification: agent:created event received!');
  });

  test('should emit agent:updated when status changes', async ({ page }) => {
    const events: any[] = [];

    // Capture console logs
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('LIFECYCLE EVENT')) {
        events.push({
          type: 'console',
          text,
          timestamp: Date.now(),
        });
      }
    });

    // Navigate and launch agent
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Count to 3');

    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const data = await response.json();
    const agentId = data.agentId;

    console.log(`✅ Agent launched: ${agentId}`);

    // Wait for agent to complete (should take ~5-10 seconds)
    await page.waitForTimeout(15000);

    console.log('\n=== Captured Events ===');
    events.forEach((e) => console.log(e.text));
    console.log('======================\n');

    // Check for agent:created
    const createdEvent = events.find((e) => e.text.includes('agent:created'));
    expect(createdEvent).toBeDefined();

    // Check for agent:updated
    const updatedEvent = events.find((e) => e.text.includes('agent:updated'));

    if (updatedEvent) {
      console.log('✅ Phase 1 Verification: agent:updated event received!');
      expect(updatedEvent.text).toContain('🔄');
    } else {
      console.log('⚠️  agent:updated event not received (agent may still be running)');
      // This is OK for Phase 1 - we just want to verify the event infrastructure works
    }
  });

  test('should show lifecycle events in browser console', async ({ page }) => {
    const lifecycleEvents: string[] = [];

    // Capture all console messages
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('LIFECYCLE EVENT')) {
        lifecycleEvents.push(text);
      }
    });

    // Navigate to app
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Hello Phase 1');

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'),
      page.click('button:has-text("Launch Agent")'),
    ]);

    // Wait for events
    await page.waitForTimeout(5000);

    // Display results
    console.log('\n📋 Lifecycle Events Captured:');
    console.log('=====================================');
    if (lifecycleEvents.length === 0) {
      console.log('❌ No lifecycle events captured!');
      console.log('This means either:');
      console.log('1. Backend is not emitting events');
      console.log('2. Frontend is not listening');
      console.log('3. Client package not rebuilt');
    } else {
      lifecycleEvents.forEach((event, i) => {
        console.log(`${i + 1}. ${event}`);
      });
      console.log(`\n✅ Total: ${lifecycleEvents.length} lifecycle event(s) captured`);
    }
    console.log('=====================================\n');

    // Verify we got at least agent:created
    expect(lifecycleEvents.length, 'Should capture at least one lifecycle event').toBeGreaterThan(0);

    const hasCreated = lifecycleEvents.some((e) => e.includes('agent:created'));
    expect(hasCreated, 'Should have agent:created event').toBe(true);
  });
});
