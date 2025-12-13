/**
 * Jest Global Setup
 * Runs before all tests
 */

// Load environment variables from .env for smoke tests
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Extend Jest matchers if needed
// import 'jest-extended';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce test output noise (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };
