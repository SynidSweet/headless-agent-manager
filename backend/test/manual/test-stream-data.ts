#!/usr/bin/env ts-node
/**
 * Test stream reading with data events
 */

import { spawn } from 'child_process';

async function testDataEvents(): Promise<void> {
  console.log('Testing data events with Claude CLI...\n');

  const process = spawn('claude', [
    '-p',
    'What is 2+2? Just say the number',
    '--output-format',
    'stream-json',
    '--verbose',
  ]);

  console.log('Process spawned, PID:', process.pid);

  let output = '';

  process.stdout?.setEncoding('utf8');
  process.stderr?.setEncoding('utf8');

  process.stdout?.on('data', (chunk) => {
    console.log('[STDOUT DATA]:', chunk.substring(0, 100));
    output += chunk;
  });

  process.stderr?.on('data', (chunk) => {
    console.log('[STDERR DATA]:', chunk.substring(0, 100));
  });

  process.on('close', (code) => {
    console.log('\nProcess closed with code:', code);
    console.log('\nTotal output length:', output.length);
    console.log('\nLines:', output.split('\n').length);

    if (output) {
      console.log('\nFirst line:', output.split('\n')[0]?.substring(0, 100));
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('\nTimeout - killing process');
    process.kill();
  }, 10000);
}

testDataEvents().catch(console.error);
