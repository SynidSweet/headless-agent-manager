import { test, expect } from '@playwright/test';
import { setupFullStackTest, cleanupAgents } from './setup';

let env: any;

test.beforeAll(async () => {
  env = await setupFullStackTest();
});

test.afterEach(async () => {
  await cleanupAgents(env.backendUrl);
});

test('Diagnostic: WebSocket subscription flow', async ({ page }) => {
  const consoleLogs: string[] = [];

  // Capture all console logs from browser
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
  });

  // Navigate
  await page.goto(env.frontendUrl);
  console.log('✅ Step 1: Navigated to frontend');

  // Wait for app to load
  await expect(page.locator('h1')).toContainText('Agent Manager', { timeout: 10000 });
  console.log('✅ Step 2: App loaded');

  // Launch agent
  await page.selectOption('select#agent-type', 'claude-code');
  await page.fill('textarea#agent-prompt', 'Say hello');
  await page.click('button:has-text("Launch Agent")');

  console.log('✅ Step 3: Agent launch button clicked');

  // Wait for agent to appear
  await page.waitForSelector('[data-agent-id]', { timeout: 10000 });
  console.log('✅ Step 4: Agent appeared in list');

  // Get agent ID
  const agentElement = page.locator('[data-agent-id]').first();
  const agentId = await agentElement.getAttribute('data-agent-id');
  console.log(`✅ Step 5: Agent ID: ${agentId}`);

  // Click to select agent (this should trigger subscription)
  await agentElement.click();
  console.log('✅ Step 6: Agent clicked (selected)');

  // Wait for Claude to respond (can take 5-10 seconds)
  console.log('⏳ Waiting 15 seconds for Claude CLI to respond...');
  await page.waitForTimeout(15000);

  // Print all console logs to see if subscription happened
  console.log('\n=== Browser Console Logs ===');
  const subscriptionLogs = consoleLogs.filter(log =>
    log.includes('subscribe') || log.includes('Subscribe') || log.includes('WebSocketMiddleware')
  );

  if (subscriptionLogs.length > 0) {
    console.log('✅ Subscription logs found:');
    subscriptionLogs.forEach(log => console.log('  ', log));
  } else {
    console.log('❌ No subscription logs found!');
    console.log('All logs:');
    consoleLogs.forEach(log => console.log('  ', log));
  }

  // Check Redux store state
  const storeState = await page.evaluate(() => {
    return (window as any).store?.getState();
  });

  if (storeState) {
    console.log('\n=== Redux Store State ===');
    console.log('Connection:', storeState.connection);
    console.log('Subscribed agents:', storeState.connection?.subscribedAgents);
    console.log('Selected agent:', storeState.agents?.selectedAgentId);
  } else {
    console.log('❌ Redux store not accessible from window');
  }

  // Query backend for messages
  const response = await fetch(`${env.backendUrl}/api/agents/${agentId}/messages`);
  const dbMessages = await response.json();
  console.log(`\n✅ Backend has ${dbMessages.length} messages for agent`);

  // Check if messages are in Redux store
  if (storeState) {
    const reduxMessages = storeState.messages?.byAgentId?.[agentId]?.messages || [];
    console.log(`Redux store has ${reduxMessages.length} messages`);
  }

  // Wait for messages to appear
  const messageElements = await page.locator('[data-message-type]').count();
  console.log(`UI shows ${messageElements} message elements`);

  // This test is for diagnosis - don't fail it
  expect(true).toBe(true);
});
