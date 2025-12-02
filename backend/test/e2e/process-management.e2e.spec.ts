import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '@/app.module';
import { ApplicationLifecycleService } from '@application/services/application-lifecycle.service';
import { InstanceAlreadyRunningError } from '@domain/exceptions/instance-already-running.exception';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { IInstanceLockManager } from '@application/ports/instance-lock-manager.port';

/**
 * Process Management E2E Tests
 *
 * Tests full application lifecycle from startup to shutdown
 * Uses real HTTP server and tests actual endpoints
 *
 * Key Scenarios:
 * - Startup: PID file creation, port binding, duplicate instance detection
 * - Health: Endpoint response, metadata, database status
 * - Shutdown: Graceful cleanup, PID file removal, restart capability
 * - Stale Lock Recovery: Detection and cleanup of crashed instances
 * - Error Handling: Helpful error messages for common issues
 */
describe('Process Management E2E', () => {
  let app: INestApplication;
  const testPort = 3001; // Use different port for E2E tests
  const testPidPath = path.join(process.cwd(), 'data/e2e-test.pid');
  let lifecycle: ApplicationLifecycleService;
  let lockManager: IInstanceLockManager;

  /**
   * Setup before each test
   * Creates a fresh NestJS application instance
   */
  beforeEach(async () => {
    // Clean up any leftover PID file
    if (fs.existsSync(testPidPath)) {
      fs.unlinkSync(testPidPath);
    }

    // Set environment to use in-memory repository for faster tests
    process.env.REPOSITORY_TYPE = 'memory';

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('PID_FILE_PATH')
      .useValue(testPidPath)
      .compile();

    app = module.createNestApplication();

    // Apply same configuration as main.ts
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    app.setGlobalPrefix('api');

    lifecycle = app.get(ApplicationLifecycleService);
    lockManager = app.get('IInstanceLockManager');
  });

  /**
   * Cleanup after each test
   * Ensures proper shutdown and file cleanup
   */
  afterEach(async () => {
    // Attempt graceful shutdown
    try {
      if (lifecycle) {
        await lifecycle.shutdown();
      }
    } catch (e) {
      // Ignore shutdown errors during cleanup
    }

    // Close the app if it's running
    if (app) {
      try {
        await app.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Clean up test files
    if (fs.existsSync(testPidPath)) {
      fs.unlinkSync(testPidPath);
    }
  });

  /**
   * Application Startup Tests
   */
  describe('Application startup', () => {
    it('should start successfully on first launch', async () => {
      // Verify PID file doesn't exist yet
      expect(fs.existsSync(testPidPath)).toBe(false);

      // Start the application
      await lifecycle.startup();
      await app.listen(testPort);

      // Verify server is listening
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.pid).toBe(process.pid);
      // Note: Port is hardcoded to 3000 in PidFileProcessManager (known limitation)
      expect(response.body.port).toBe(3000);
    });

    it('should create PID file before binding port', async () => {
      // Verify file doesn't exist
      expect(fs.existsSync(testPidPath)).toBe(false);

      // Run startup (creates PID file)
      await lifecycle.startup();

      // PID file should exist BEFORE we bind the port
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Now bind the port
      await app.listen(testPort);

      // Verify PID file content
      const content = fs.readFileSync(testPidPath, 'utf-8');
      const lock = JSON.parse(content);
      expect(lock.pid).toBe(process.pid);
    });

    it('should fail if instance already running', async () => {
      // Start the first instance
      await lifecycle.startup();

      // Try to start again - should throw error
      await expect(lifecycle.startup()).rejects.toThrow(InstanceAlreadyRunningError);
    });

    it('should contain instance metadata in PID file', async () => {
      await lifecycle.startup();

      // Read PID file
      const content = fs.readFileSync(testPidPath, 'utf-8');
      const lock = JSON.parse(content);

      // Verify all required fields
      expect(lock).toHaveProperty('pid');
      expect(lock).toHaveProperty('startedAt');
      expect(lock).toHaveProperty('port');
      expect(lock).toHaveProperty('nodeVersion');
      expect(lock).toHaveProperty('instanceId');

      expect(lock.pid).toBe(process.pid);
      expect(lock.nodeVersion).toBe(process.version);
    });
  });

  /**
   * Health Endpoint Tests
   */
  describe('Health endpoint', () => {
    it('should respond with instance metadata', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      // Verify response structure matches HealthCheckDto
      expect(response.body).toMatchObject({
        status: 'ok',
        pid: expect.any(Number),
        uptime: expect.any(Number),
        memoryUsage: {
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          external: expect.any(Number),
          rss: expect.any(Number),
        },
        activeAgents: expect.any(Number),
        totalAgents: expect.any(Number),
        databaseStatus: expect.stringMatching(/^(connected|disconnected)$/),
        startedAt: expect.any(String),
        timestamp: expect.any(String),
        port: expect.any(Number),
        nodeVersion: expect.any(String),
        instanceId: expect.any(String),
      });
    });

    it('should show increasing uptime', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      // First health check
      const response1 = await request(app.getHttpServer()).get('/api/health');
      const uptime1 = response1.body.uptime;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second health check
      const response2 = await request(app.getHttpServer()).get('/api/health');
      const uptime2 = response2.body.uptime;

      // Uptime should have increased
      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it('should reflect database status', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      // Database should be connected (in-memory by default)
      expect(response.body.databaseStatus).toBe('connected');
    });

    it('should return current PID', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.body.pid).toBe(process.pid);
    });

    it('should return memory usage metrics', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      const { memoryUsage } = response.body;
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(memoryUsage.external).toBeGreaterThan(0);
      expect(memoryUsage.rss).toBeGreaterThan(0);
    });
  });

  /**
   * Graceful Shutdown Tests
   */
  describe('Graceful shutdown', () => {
    it('should remove PID file on shutdown', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      // Verify PID file exists
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Shutdown
      await lifecycle.shutdown();

      // PID file should be removed
      expect(fs.existsSync(testPidPath)).toBe(false);
    });

    it('should close database connections on shutdown', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      // Verify server responds and database is connected
      const beforeResponse = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(beforeResponse.body.databaseStatus).toBe('connected');

      // Shutdown
      await lifecycle.shutdown();

      // Database should be disconnected after shutdown
      const afterResponse = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(afterResponse.body.databaseStatus).toBe('disconnected');

      // Now close the app
      await app.close();
    });

    it('should allow restart after shutdown', async () => {
      // Start and shutdown first instance
      await lifecycle.startup();
      await app.listen(testPort);
      await lifecycle.shutdown();
      await app.close();

      // Clean up for second instance
      if (fs.existsSync(testPidPath)) {
        fs.unlinkSync(testPidPath);
      }

      // Create a new instance
      const module2: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider('PID_FILE_PATH')
        .useValue(testPidPath)
        .compile();

      const app2 = module2.createNestApplication();
      const lifecycle2 = app2.get(ApplicationLifecycleService);

      // Should be able to start new instance
      await expect(lifecycle2.startup()).resolves.not.toThrow();

      // Cleanup second instance
      await lifecycle2.shutdown();
      await app2.close();
    });

    it('should clean up gracefully even if shutdown called multiple times', async () => {
      await lifecycle.startup();
      await app.listen(testPort);

      // First shutdown
      await lifecycle.shutdown();

      // Second shutdown - should not throw
      await expect(lifecycle.shutdown()).resolves.not.toThrow();
    });
  });

  /**
   * Stale Lock Recovery Tests
   */
  describe('Stale lock recovery', () => {
    it('should detect and clean stale PID file', async () => {
      // Create stale PID file with non-existent PID
      const staleLock = ProcessLock.create({
        pid: 99999, // Non-existent process
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'stale-instance',
      });

      fs.writeFileSync(testPidPath, staleLock.toJSON());

      // Verify stale file exists
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Startup should clean up stale lock and proceed
      await lifecycle.startup();

      // Get current lock - should be for THIS process, not stale one
      const currentLock = await lockManager.getCurrentLock();
      expect(currentLock).not.toBeNull();
      expect(currentLock!.getPid()).toBe(process.pid);
      expect(currentLock!.getPid()).not.toBe(99999);
    });

    it('should differentiate between stale and active locks', async () => {
      // Create lock with current process PID
      const activeLock = ProcessLock.create({
        pid: process.pid,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'active-instance',
      });

      fs.writeFileSync(testPidPath, activeLock.toJSON());

      // Startup should detect active instance
      await expect(lifecycle.startup()).rejects.toThrow(InstanceAlreadyRunningError);
    });
  });

  /**
   * Error Handling Tests
   */
  describe('Error handling', () => {
    it('should provide helpful error message for duplicate instance', async () => {
      await lifecycle.startup();

      // Try to start again
      try {
        await lifecycle.startup();
        fail('Should have thrown InstanceAlreadyRunningError');
      } catch (error) {
        const err = error as InstanceAlreadyRunningError;
        expect(err).toBeInstanceOf(InstanceAlreadyRunningError);
        expect(err.message).toContain('Backend instance already running');
        expect(err.message).toContain(String(process.pid));
      }
    });

    it('should include lock details in duplicate instance error', async () => {
      await lifecycle.startup();

      try {
        await lifecycle.startup();
        fail('Should have thrown InstanceAlreadyRunningError');
      } catch (error) {
        const err = error as InstanceAlreadyRunningError;
        expect(err.lock).toBeDefined();
        expect(err.lock.getPid()).toBe(process.pid);
      }
    });

    it('should throw error if getInstanceMetadata called before startup', () => {
      // Don't call startup()

      expect(() => lifecycle.getInstanceMetadata()).toThrow(
        'Instance not started. Call startup() first.'
      );
    });
  });
});
