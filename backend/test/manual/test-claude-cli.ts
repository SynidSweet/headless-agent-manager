#!/usr/bin/env ts-node

/**
 * Manual Test Script for Claude Code Integration
 *
 * This script demonstrates that the ClaudeCodeAdapter works with the real Claude CLI.
 * Run with: npx ts-node -r tsconfig-paths/register test/manual/test-claude-cli.ts
 */

import { ClaudeCodeAdapter } from '@infrastructure/adapters/claude-code.adapter';
import { ProcessManager } from '@infrastructure/process/process-manager.service';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';
import { Session } from '@domain/value-objects/session.vo';
import { IAgentObserver } from '@application/ports/agent-runner.port';

async function main(): Promise<void> {
  console.log('🧪 Manual Test: ClaudeCodeAdapter with Real Claude CLI\n');

  // Setup
  const logger = new ConsoleLogger();
  const processManager = new ProcessManager(logger);
  const parser = new ClaudeMessageParser();
  const adapter = new ClaudeCodeAdapter(processManager, parser, logger);

  // Create session
  const session = Session.create('What is 2 + 2? Answer with just the number.', {
    outputFormat: 'stream-json',
  });

  console.log('📋 Session created');
  console.log('   Prompt:', session.prompt);
  console.log('');

  let messageCount = 0;

  // Create observer
  const observer: IAgentObserver = {
    onMessage: async (message) => {
      messageCount++;
      console.log(`\n[Message ${messageCount}] Type: ${message.type}`);
      if (message.role) {
        console.log(`   Role: ${message.role}`);
      }
      if (typeof message.content === 'string' && message.content) {
        console.log(`   Content: ${message.content.substring(0, 100)}`);
      }
      if (message.metadata?.subtype) {
        console.log(`   Subtype: ${message.metadata.subtype}`);
      }
    },
    onStatusChange: async (status) => {
      console.log(`\n📊 Status Changed: ${status}`);
    },
    onError: async (error) => {
      console.error(`\n❌ Error: ${error.message}`);
    },
    onComplete: async (result) => {
      console.log(`\n✅ Completed!`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Messages: ${messageCount}`);
    },
  };

  try {
    // Start agent
    console.log('🚀 Starting Claude Code agent...\n');
    const agent = await adapter.start(session);
    console.log('✅ Agent started');
    console.log('   ID:', agent.id.toString());
    console.log('   Status:', agent.status);
    console.log('');

    // Subscribe to events
    adapter.subscribe(agent.id, observer);

    // Wait for execution (max 20 seconds)
    console.log('⏳ Waiting for Claude to respond...\n');
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // Stop agent
    console.log('\n🛑 Stopping agent...');
    await adapter.stop(agent.id);
    console.log('✅ Agent stopped');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }

  console.log('\n✅ Manual test completed successfully!');
  console.log(`   Total messages received: ${messageCount}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
