#!/usr/bin/env ts-node
/**
 * Manual test to debug stream reading
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

async function testStreamReader(): Promise<void> {
  console.log('Testing stream reader with Claude CLI...\n');

  const process = spawn(
    'claude',
    ['-p', 'What is 2+2? Just say the number', '--output-format', 'stream-json', '--verbose'],
    {
      shell: true,
    }
  );

  console.log('Process spawned, PID:', process.pid);
  console.log('Waiting for output...\n');

  if (!process.stdout) {
    console.error('No stdout!');
    return;
  }

  // CRITICAL: Set encoding
  process.stdout.setEncoding('utf8');

  const readline = createInterface({
    input: process.stdout,
    crlfDelay: Infinity,
  });

  let lineCount = 0;

  for await (const line of readline) {
    lineCount++;
    console.log(`[Line ${lineCount}]:`, line.substring(0, 100));
  }

  console.log(`\nTotal lines: ${lineCount}`);

  process.kill();
}

testStreamReader().catch(console.error);
