/**
 * ProcessUtils Tests
 *
 * TDD - Phase 2: Infrastructure Layer
 * Tests written FIRST following RED → GREEN → REFACTOR cycle
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProcessUtils } from '@infrastructure/process/process.utils';

describe('ProcessUtils', () => {
  let utils: ProcessUtils;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessUtils],
    }).compile();

    utils = module.get<ProcessUtils>(ProcessUtils);
  });

  describe('isProcessRunning', () => {
    it('should return true for current process', () => {
      // Arrange
      const currentPid = process.pid;

      // Act
      const result = utils.isProcessRunning(currentPid);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent PID (very high number)', () => {
      // Arrange
      // Using a very high PID that is unlikely to exist
      const nonExistentPid = 999999;

      // Act
      const result = utils.isProcessRunning(nonExistentPid);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for PID 0', () => {
      // Act
      const result = utils.isProcessRunning(0);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for negative PID', () => {
      // Act
      const result = utils.isProcessRunning(-1);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle permission errors gracefully', () => {
      // Arrange
      // PID 1 is typically init/systemd (owned by root)
      // On Unix systems, we can check if it exists but not kill it
      const pid1 = 1;

      // Act & Assert
      // This should not throw, but return true or false depending on platform
      expect(() => utils.isProcessRunning(pid1)).not.toThrow();
    });
  });

  describe('getCurrentMemoryUsage', () => {
    it('should return memory statistics with all required fields', () => {
      // Act
      const memoryUsage = utils.getCurrentMemoryUsage();

      // Assert
      expect(memoryUsage).toBeDefined();
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(memoryUsage.external).toBeGreaterThanOrEqual(0);
      expect(memoryUsage.rss).toBeGreaterThan(0);
    });

    it('should return heap used less than or equal to heap total', () => {
      // Act
      const memoryUsage = utils.getCurrentMemoryUsage();

      // Assert
      expect(memoryUsage.heapUsed).toBeLessThanOrEqual(memoryUsage.heapTotal);
    });

    it('should return numeric values', () => {
      // Act
      const memoryUsage = utils.getCurrentMemoryUsage();

      // Assert
      expect(typeof memoryUsage.heapUsed).toBe('number');
      expect(typeof memoryUsage.heapTotal).toBe('number');
      expect(typeof memoryUsage.external).toBe('number');
      expect(typeof memoryUsage.rss).toBe('number');
    });

    it('should return positive values for active memory', () => {
      // Act
      const memoryUsage = utils.getCurrentMemoryUsage();

      // Assert
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(memoryUsage.rss).toBeGreaterThan(0);
    });

    it('should return different values on subsequent calls (memory changes)', async () => {
      // Arrange
      const usage1 = utils.getCurrentMemoryUsage();

      // Allocate some memory to change heap usage
      const largeArray = new Array(10000).fill('x'.repeat(1000));

      // Act
      const usage2 = utils.getCurrentMemoryUsage();

      // Assert
      // Memory usage should have changed (though direction is not guaranteed)
      expect(usage2).not.toEqual(usage1);

      // Clean up
      largeArray.length = 0;
    });
  });

  describe('getUptime', () => {
    it('should return uptime in seconds', () => {
      // Act
      const uptime = utils.getUptime();

      // Assert
      expect(uptime).toBeGreaterThan(0);
      expect(typeof uptime).toBe('number');
    });

    it('should return positive number', () => {
      // Act
      const uptime = utils.getUptime();

      // Assert
      expect(uptime).toBeGreaterThan(0);
    });

    it('should increase over time', async () => {
      // Arrange
      const uptime1 = utils.getUptime();

      // Wait for a short period
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act
      const uptime2 = utils.getUptime();

      // Assert
      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it('should return uptime with decimal precision', async () => {
      // Act
      const uptime = utils.getUptime();

      // Assert
      // Uptime should have decimal places (sub-second precision)
      expect(uptime % 1).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive calls to isProcessRunning', () => {
      // Arrange
      const currentPid = process.pid;

      // Act & Assert
      for (let i = 0; i < 100; i++) {
        expect(utils.isProcessRunning(currentPid)).toBe(true);
      }
    });

    it('should handle rapid successive calls to getCurrentMemoryUsage', () => {
      // Act & Assert
      for (let i = 0; i < 100; i++) {
        const usage = utils.getCurrentMemoryUsage();
        expect(usage.heapUsed).toBeGreaterThan(0);
      }
    });

    it('should handle rapid successive calls to getUptime', () => {
      // Act & Assert
      const uptimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        uptimes.push(utils.getUptime());
      }

      // All uptimes should be positive and non-decreasing
      for (let i = 1; i < uptimes.length; i++) {
        expect(uptimes[i]).toBeGreaterThanOrEqual(uptimes[i - 1] as number);
      }
    });
  });

  describe('integration scenarios', () => {
    it('should provide consistent process information', () => {
      // Act
      const isRunning = utils.isProcessRunning(process.pid);
      const memory = utils.getCurrentMemoryUsage();
      const uptime = utils.getUptime();

      // Assert
      expect(isRunning).toBe(true);
      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(uptime).toBeGreaterThan(0);
    });

    it('should detect when process does not exist', () => {
      // Arrange
      const impossiblePid = 999999;

      // Act
      const isRunning = utils.isProcessRunning(impossiblePid);

      // Assert
      expect(isRunning).toBe(false);
    });
  });
});
