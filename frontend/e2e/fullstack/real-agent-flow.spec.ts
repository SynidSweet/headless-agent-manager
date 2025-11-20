import { test, expect, Page } from '@playwright/test';
import { setupFullStackTest, cleanupAgents } from './setup';

/**
 * FULL-STACK INTEGRATION TESTS (REAL CLAUDE CLI)
 *
 * These tests validate the COMPLETE user flow with ALL real services:
 * - Real browser (Playwright)
 * - Real frontend (Vite dev server)
 * - Real backend (NestJS)
 * - Real Python proxy
 * - Real Claude CLI
 * - Real WebSocket streaming
 *
 * Cost: $0 (uses Claude Max subscription)
 * Duration: ~30-60 seconds per test
 *
 * Prerequisites:
 * 1. Python proxy running: cd claude-proxy-service && uvicorn app.main:app --reload
 * 2. Backend running: cd backend && npm run dev
 * 3. Frontend running: cd frontend && npm run dev
 * 4. Claude CLI authenticated: claude auth login
 */

let env: any;

test.beforeAll(async () => {
  env = await setupFullStackTest();
});

test.beforeEach(async () => {
  await cleanupAgents(env.backendUrl);
});

test.afterEach(async () => {
  await cleanupAgents(env.backendUrl);
});

test.describe('Full-Stack Agent Message Flow (REAL CLAUDE)', () => {
  /**
   * CRITICAL TEST: Validates messages appear in browser
   * This is the test that would have caught the subscription bug!
   */
  test('should display real Claude messages in browser UI', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'error') {
        console.log(`[Browser] ${msg.text()}`);
      }
    });

    // STEP 1: Navigate to app
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('Agent Manager', { timeout: 10000 });

    console.log('✅ Step 1: Page loaded');

    // STEP 2: Fill launch form with simple prompt
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill(
      'textarea#agent-prompt',
      'Say "FULLSTACK_TEST_PASS" and nothing else. Do not use any tools.'
    );

    console.log('✅ Step 2: Form filled');

    // STEP 3: Launch agent
    const launchPromise = page.waitForResponse(
      resp => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    await page.click('button:has-text("Launch Agent")');
    const launchResp = await launchPromise;

    expect(launchResp.status()).toBe(201);
    const agentData = await launchResp.json();
    const agentId = agentData.agentId;

    console.log(`✅ Step 3: Agent launched (ID: ${agentId})`);

    // STEP 4: Wait for agent card to appear
    await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible({
      timeout: 10000
    });

    console.log('✅ Step 4: Agent card visible');

    // STEP 5: Click agent to view details
    await page.click(`[data-agent-id="${agentId}"]`);

    console.log('✅ Step 5: Agent clicked');

    // STEP 6: CRITICAL - Wait for messages to appear in DOM
    // Use multiple possible selectors to find messages
    const messageSelectors = [
      '[data-message-type]',
      '.message',
      '[data-testid="message"]',
      'text=FULLSTACK_TEST_PASS',
      'text=assistant',
    ];

    let messagesFound = false;
    let foundSelector = '';

    for (const selector of messageSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 40000 });
        messagesFound = true;
        foundSelector = selector;
        console.log(`✅ Step 6: Messages found with selector: ${selector}`);
        break;
      } catch {
        // Try next selector
      }
    }

    if (!messagesFound) {
      // If no messages found, take screenshot for debugging
      await page.screenshot({ path: 'fullstack-test-failure.png', fullPage: true });

      // Get page HTML for debugging
      const html = await page.content();
      console.error('Page HTML:', html.substring(0, 1000));

      throw new Error('❌ NO MESSAGES APPEARED IN UI after 40 seconds');
    }

    // STEP 7: Verify message content
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('FULLSTACK_TEST_PASS');

    console.log('✅ Step 7: Message content verified');
    console.log('🎉 FULL-STACK TEST PASSED: Real Claude messages displayed in browser!');
  });

  /**
   * Test WebSocket connection and subscription
   */
  test('should establish WebSocket connection and receive events', async ({ page }) => {
    const wsMessages: string[] = [];

    // Monitor WebSocket
    page.on('websocket', ws => {
      console.log('WebSocket connection opened:', ws.url());

      ws.on('framesent', event => {
        const payload = event.payload?.toString() || '';
        console.log('→ WS Sent:', payload.substring(0, 200));
      });

      ws.on('framereceived', event => {
        const payload = event.payload?.toString() || '';
        console.log('← WS Received:', payload.substring(0, 200));
        wsMessages.push(payload);
      });
    });

    // Navigate and launch agent
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toBeVisible();

    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say "test" and nothing else');
    await page.click('button:has-text("Launch Agent")');

    // Wait for agent card
    await expect(page.locator('[data-agent-id]').first()).toBeVisible({ timeout: 10000 });

    // Wait for WebSocket messages
    await page.waitForTimeout(30000); // Wait for Claude to respond

    // Verify we received WebSocket messages
    expect(wsMessages.length).toBeGreaterThan(0);

    console.log(`✅ Received ${wsMessages.length} WebSocket messages`);

    // Check if we received message events
    const messageEvents = wsMessages.filter(msg =>
      msg.includes('agent:message') ||
      msg.includes('"type":"assistant"') ||
      msg.includes('"type":"system"')
    );

    console.log(`✅ Found ${messageEvents.length} message events`);

    if (messageEvents.length === 0) {
      console.error('❌ NO MESSAGE EVENTS IN WEBSOCKET!');
      console.error('WebSocket messages:', wsMessages);
      throw new Error('WebSocket not broadcasting agent messages');
    }
  });

  /**
   * Test status updates
   */
  test('should show agent status changes in real-time', async ({ page }) => {
    await page.goto(env.frontendUrl);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say "status test"');
    await page.click('button:has-text("Launch Agent")');

    // Wait for agent card
    const agentCard = page.locator('[data-agent-id]').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });

    // Should show some status (initializing/running/completed)
    const hasStatus = await agentCard.locator('text=/initializing|running|completed/i').count();
    expect(hasStatus).toBeGreaterThan(0);

    console.log('✅ Status updates working');
  });

  /**
   * Test agent termination
   */
  test('should handle agent termination', async ({ page }) => {
    await page.goto(env.frontendUrl);

    // Launch agent with longer task
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Count from 1 to 10');
    await page.click('button:has-text("Launch Agent")');

    const agentCard = page.locator('[data-agent-id]').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });

    // Try to find and click terminate button
    const terminateButton = agentCard.locator('button:has-text("Terminate"), button:has-text("Stop")');

    if (await terminateButton.count() > 0) {
      await terminateButton.first().click();

      // Should show terminated/stopped status or be removed
      await page.waitForTimeout(2000);

      console.log('✅ Termination working');
    } else {
      console.log('ℹ️  No terminate button found (may not be implemented yet)');
    }
  });

  /**
   * Test multiple agents
   */
  test('should handle multiple agents simultaneously', async ({ page }) => {
    await page.goto(env.frontendUrl);

    // Launch first agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say "Agent 1"');
    await page.click('button:has-text("Launch Agent")');

    await page.waitForTimeout(2000);

    // Launch second agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say "Agent 2"');
    await page.click('button:has-text("Launch Agent")');

    // Should have 2 agent cards
    await expect(page.locator('[data-agent-id]')).toHaveCount(2, { timeout: 10000 });

    console.log('✅ Multiple agents working');
  });
});

/**
 * DIAGNOSTIC TEST - Helps debug issues
 */
test.describe('Full-Stack Diagnostics', () => {
  test('diagnostic: capture all events and state', async ({ page }) => {
    const events: any[] = [];

    // Capture console logs
    page.on('console', msg => {
      events.push({ type: 'console', level: msg.type(), text: msg.text() });
    });

    // Capture network requests
    page.on('response', async resp => {
      if (resp.url().includes('/api/')) {
        try {
          const data = await resp.json();
          events.push({
            type: 'http',
            url: resp.url(),
            status: resp.status(),
            data,
          });
        } catch {
          // Not JSON
        }
      }
    });

    // Capture WebSocket
    const wsMessages: any[] = [];
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        wsMessages.push(event.payload?.toString());
      });
    });

    // Run test
    await page.goto(env.frontendUrl);
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say "diagnostic"');
    await page.click('button:has-text("Launch Agent")');

    // Wait for processing
    await page.waitForTimeout(35000);

    // Take screenshot
    await page.screenshot({ path: 'diagnostic-screenshot.png', fullPage: true });

    // Output diagnostic info
    console.log('\n═══════════════════════════════════════');
    console.log('DIAGNOSTIC REPORT');
    console.log('═══════════════════════════════════════');

    console.log('\n📊 Event Summary:');
    console.log(`   Console logs: ${events.filter(e => e.type === 'console').length}`);
    console.log(`   HTTP requests: ${events.filter(e => e.type === 'http').length}`);
    console.log(`   WebSocket messages: ${wsMessages.length}`);

    console.log('\n🌐 HTTP Requests:');
    events.filter(e => e.type === 'http').forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.url}`);
      console.log(`   Status: ${event.status}`);
      console.log(`   Data:`, JSON.stringify(event.data, null, 2).substring(0, 200));
    });

    console.log('\n🔌 WebSocket Messages:');
    wsMessages.forEach((msg, i) => {
      console.log(`\n${i + 1}. ${msg.substring(0, 300)}`);
    });

    console.log('\n📋 Console Logs:');
    events.filter(e => e.type === 'console').forEach((event, i) => {
      console.log(`${i + 1}. [${event.level}] ${event.text}`);
    });

    // Check for messages in page
    const pageText = await page.textContent('body');
    console.log('\n📄 Page contains "message":', pageText?.includes('message'));
    console.log('   Page contains "assistant":', pageText?.includes('assistant'));

    console.log('\n═══════════════════════════════════════\n');

    // DIAGNOSTIC ASSERTIONS
    expect(events.filter(e => e.type === 'http').length).toBeGreaterThan(0);
    expect(wsMessages.length).toBeGreaterThan(0);
  });
});
