#!/usr/bin/env ts-node
/**
 * Test claude-code-js SDK with Claude Max subscription
 */

import { ClaudeCode } from 'claude-code-js';

async function testClaudeCodeJS(): Promise<void> {
  console.log('🧪 Testing claude-code-js SDK with Max subscription\n');

  try {
    // Create client (should use existing Claude Code auth)
    const claude = new ClaudeCode({
      // No API key - should use logged-in Claude Code credentials
      workingDirectory: process.cwd(),
    });

    console.log('✅ ClaudeCode client created');
    console.log('📋 Sending prompt...\n');

    const response = await claude.chat('What is 2 + 2? Answer with just the number.');

    console.log('\n✅ Response received!');
    console.log('Success:', response.success);
    console.log('Result:', response.message?.result);
    console.log('Session ID:', response.message?.session_id);
    console.log('Cost:', response.message?.cost_usd);
    console.log('Duration:', response.message?.duration_ms, 'ms');
    console.log('\nFull response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

testClaudeCodeJS().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
