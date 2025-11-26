/**
 * ConsoleLogger Service Tests
 *
 * Purpose: Verify console logger outputs messages correctly with proper formatting
 * Layer: Infrastructure
 * Type: Unit
 *
 * Coverage:
 * - All log levels (debug, info, warn, error)
 * - Error handling (serialization failures, circular references)
 * - Output format (timestamps, log levels, JSON context)
 * - Edge cases (multi-line messages, null/undefined context)
 *
 * Dependencies: None (pure logging logic)
 * Mocks: console methods (to capture output)
 */

import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new ConsoleLogger();

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Log Levels', () => {
    it('should log info messages with timestamp', () => {
      // Arrange
      const message = 'Test info message';
      const context = { key: 'value' };

      // Act
      logger.info(message, context);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain(message);
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/); // ISO 8601
    });

    it('should log error messages with timestamp', () => {
      // Arrange
      const message = 'Test error message';
      const context = { error: 'details' };

      // Act
      logger.error(message, context);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[ERROR]');
      expect(output).toContain(message);
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should log warn messages with timestamp', () => {
      // Arrange
      const message = 'Test warning message';
      const context = { warning: 'type' };

      // Act
      logger.warn(message, context);

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('[WARN]');
      expect(output).toContain(message);
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should log debug messages with timestamp', () => {
      // Arrange
      const message = 'Test debug message';
      const context = { debug: 'info' };

      // Act
      logger.debug(message, context);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[DEBUG]');
      expect(output).toContain(message);
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should log context object as JSON', () => {
      // Arrange
      const message = 'Test message';
      const context = { userId: '123', action: 'login', success: true };

      // Act
      logger.info(message, context);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const contextOutput = consoleLogSpy.mock.calls[0][1];
      expect(contextOutput).toContain('userId');
      expect(contextOutput).toContain('123');
      expect(contextOutput).toContain('login');
    });
  });

  describe('Error Handling', () => {
    it('should not throw if context serialization fails', () => {
      // Arrange
      const message = 'Test message';
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj; // Create circular reference

      // Act & Assert - Should not throw
      expect(() => {
        logger.info(message, circularObj);
      }).not.toThrow();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle circular references in context', () => {
      // Arrange
      const message = 'Test message with circular ref';
      const circularObj: any = {};
      circularObj.self = circularObj;

      // Act
      logger.info(message, circularObj);

      // Assert - Logger should handle gracefully
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain(message);
    });

    it('should handle undefined/null context', () => {
      // Arrange
      const message = 'Test message';

      // Act - undefined context
      logger.info(message, undefined);
      logger.info(message); // No context at all

      // Assert - Should not throw
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[0][0]).toContain(message);
      expect(consoleLogSpy.mock.calls[0][1]).toBe(''); // Empty string for undefined
    });
  });

  describe('Output Format', () => {
    it('should include timestamp in ISO 8601 format', () => {
      // Arrange
      const message = 'Timestamp test';

      // Act
      logger.info(message);

      // Assert
      const output = consoleLogSpy.mock.calls[0][0];
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should include log level in message', () => {
      // Act
      logger.debug('Debug test');
      logger.info('Info test');
      logger.warn('Warn test');
      logger.error('Error test');

      // Assert
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleLogSpy.mock.calls[1][0]).toContain('[INFO]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should stringify context as JSON', () => {
      // Arrange
      const context = {
        nested: { object: { with: { deep: 'nesting' } } },
        array: [1, 2, 3],
        boolean: true,
        number: 42,
      };

      // Act
      logger.info('Test', context);

      // Assert
      const contextOutput = consoleLogSpy.mock.calls[0][1];
      expect(contextOutput).toContain('"nested"');
      expect(contextOutput).toContain('"deep"');
      expect(contextOutput).toContain('"nesting"');
      expect(contextOutput).toContain('[1,2,3]');
    });

    it('should handle multi-line messages', () => {
      // Arrange
      const multilineMessage = 'Line 1\nLine 2\nLine 3';

      // Act
      logger.info(multilineMessage);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Line 1');
      // Note: The logger may or may not preserve newlines - just verify it doesn't crash
    });
  });

  describe('NestJS Compatibility', () => {
    it('should support log() method for NestJS', () => {
      // Arrange
      const message = 'NestJS log';
      const context = 'TestContext';

      // Act
      logger.log(message, context);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain(message);
    });

    it('should support verbose() method for NestJS', () => {
      // Arrange
      const message = 'Verbose message';

      // Act
      logger.verbose(message);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[VERBOSE]');
      expect(output).toContain(message);
    });
  });
});
