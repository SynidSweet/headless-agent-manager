#!/usr/bin/env ts-node
/**
 * Test spawning Claude with shell: true
 */

import { spawn } from 'child_process';

async function testWithShell(): Promise<void> {
  console.log('Testing with shell: true...\n');

  const process = spawn(
    'claude',
    ['-p', 'What is 2+2? Just say the number', '--output-format', 'stream-json', '--verbose'],
    { shell: true }
  );

  console.log('Process spawned with shell, PID:', process.pid);

  let output = '';

  process.stdout?.setEncoding('utf8');
  process.stderr?.setEncoding('utf8');

  process.stdout?.on('data', (chunk) => {
    console.log('[STDOUT]:', chunk.substring(0, 150));
    output += chunk;
  });

  process.stderr?.on('data', (chunk) => {
    console.log('[STDERR]:', chunk.substring(0, 150));
  });

  process.on('close', (code) => {
    console.log('\nClosed with code:', code);
    console.log('Output length:', output.length);
    if (output) {
      const lines = output.trim().split('\n');
      console.log('Lines received:', lines.length);
      console.log('\nFirst line:', lines[0]);
    }
  });

  setTimeout(() => {
    process.kill();
  }, 10000);
}

testWithShell().catch(console.error);
