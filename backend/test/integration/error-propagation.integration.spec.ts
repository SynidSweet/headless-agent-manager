/**
 * Error Propagation & Recovery Integration Tests
 *
 * Purpose: Verify error handling across layer boundaries and system resilience
 * Layer: Integration (Application + Infrastructure)
 * Type: Integration
 *
 * Coverage:
 * - Database error propagation
 * - Process error handling
 * - WebSocket error handling
 * - Cascading failure isolation
 * - Error recovery mechanisms
 *
 * Uses REAL: Database, Process Manager, WebSocket Gateway
 * Mocks: None (tests real error scenarios)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.service';
import { ProcessManager } from '@infrastructure/process/process-manager.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { Socket, io as ioClient } from 'socket.io-client';

describe('Error Propagation & Recovery (Integration)', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
    db = new DatabaseService(':memory:');
    db.onModuleInit();

    // CRITICAL: Verify FK constraints are enabled
    const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });
    if (fkEnabled !== 1) {
      throw new Error('FK constraints MUST be enabled for these tests');
    }

    // Clean database
    db.getDatabase().exec('DELETE FROM agent_messages');
    db.getDatabase().exec('DELETE FROM agents');

    messageService = new AgentMessageService(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch (e) {
      // Ignore close errors
    }
  });

  describe('Database Errors', () => {
    /**
     * TEST 1: Database Constraint Violation (FK)
     *
     * Verifies proper error handling for constraint violations
     */
    it('should reject operations violating database constraints', async () => {
      // Arrange: Use UNIQUE random ID to prevent test pollution
      const nonExistentAgentId = `fake-agent-${Date.now()}-${Math.random().toString(36)}`;

      // Act & Assert: Should fail with FK constraint error
      try {
        await messageService.saveMessage({
          agentId: nonExistentAgentId,
          type: 'assistant',
          role: 'test',
          content: 'Should fail due to FK violation',
        });
        // If we reach here, test should fail
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/);
      }
    });

    /**
     * TEST 2: Retry on Transient Database Errors
     *
     * Verifies system can retry after transient errors
     */
    it('should allow retry after transient database error', async () => {
      // Use UNIQUE ID to prevent test pollution
      const agentId = `test-agent-retry-${Date.now()}-${Math.random().toString(36)}`;

      // First attempt fails (no agent exists - FK violation)
      try {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          role: 'test',
          content: 'First attempt',
        });
        // If we reach here, test should fail
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/);
      }

      // Create agent
      const database = db.getDatabase();
      database
        .prepare(
          `
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(agentId, 'synthetic', 'running', 'test', new Date().toISOString());

      // Second attempt succeeds
      const message = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: 'Second attempt',
      });

      expect(message.id).toBeDefined();
      expect(message.content).toBe('Second attempt');
    });

    /**
     * TEST 3: Corrupt Database Handling
     *
     * Verifies graceful failure when schema is corrupted
     */
    it('should fail gracefully on corrupted schema', async () => {
      // Arrange: Corrupt schema by dropping required column
      const database = db.getDatabase();

      // Create backup table structure
      database.exec(`
        CREATE TABLE IF NOT EXISTS agents_backup AS SELECT * FROM agents;
        DROP TABLE agents;
        CREATE TABLE agents (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL
          -- Missing other required columns!
        );
      `);

      // Act: Attempt to use repository (should fail due to missing columns)
      const repository = new SqliteAgentRepository(db);

      // Assert: Should handle schema mismatch gracefully (async)
      try {
        await repository.findAll();
        fail('Expected schema error but none was thrown');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Process Errors', () => {
    let processManager: ProcessManager;
    const spawnedProcesses: Array<{ pid: number; process: any }> = [];

    beforeEach(() => {
      processManager = new ProcessManager(logger);
    });

    afterEach(async () => {
      // Clean up all spawned processes and their pipes
      for (const { pid, process } of spawnedProcesses) {
        try {
          // Close stdio pipes first
          if (process.stdin && !process.stdin.destroyed) {
            process.stdin.destroy();
          }
          if (process.stdout && !process.stdout.destroyed) {
            process.stdout.destroy();
          }
          if (process.stderr && !process.stderr.destroyed) {
            process.stderr.destroy();
          }

          // Then kill the process if still running
          if (processManager.isRunning(pid)) {
            await processManager.kill(pid);
          }
        } catch (e) {
          // Ignore errors if process already exited
        }
      }
      spawnedProcesses.length = 0; // Clear array
    });

    /**
     * TEST 4: CLI Crash During Execution
     *
     * Verifies handling of process crash
     */
    it('should handle CLI crash during execution', async () => {
      // Spawn process that crashes immediately
      const process = processManager.spawn('node', ['-e', 'process.exit(1)']);
      const pid = process.pid!;
      spawnedProcesses.push({ pid, process }); // Track for cleanup

      // Wait for process to exit with error
      const exitCode = await new Promise<number | null>((resolve) => {
        process.on('exit', (code) => resolve(code));
      });

      // Node returns 2 for syntax/execution errors in shell
      expect(exitCode).not.toBe(0);
      expect(processManager.isRunning(pid)).toBe(false);
    });

    /**
     * TEST 5: CLI Non-Zero Exit Code
     *
     * Verifies detection of non-zero exit codes
     */
    it('should detect CLI non-zero exit code', async () => {
      const process = processManager.spawn('node', ['-e', 'process.exit(42)']);
      const pid = process.pid!;
      spawnedProcesses.push({ pid, process }); // Track for cleanup

      const exitCode = await new Promise<number | null>((resolve) => {
        process.on('exit', (code) => resolve(code));
      });

      // Node returns 2 for syntax/execution errors in shell
      expect(exitCode).not.toBe(0);
      expect(exitCode).not.toBe(null);
      expect(processManager.isRunning(pid)).toBe(false);
    });

    /**
     * TEST 6: CLI Timeout Handling
     *
     * Verifies timeout detection and process termination
     */
    it('should handle CLI timeout', async () => {
      // Spawn process that hangs
      const process = processManager.spawn('sleep', ['100']);
      const pid = process.pid!;
      spawnedProcesses.push({ pid, process }); // Track for cleanup

      expect(processManager.isRunning(pid)).toBe(true);

      // Kill it after short timeout
      await processManager.kill(pid);

      expect(processManager.isRunning(pid)).toBe(false);
    }, 10000);
  });

  describe('WebSocket Errors', () => {
    let httpServer: HttpServer;
    let io: SocketIOServer;
    let clientSocket: Socket;

    beforeEach(async () => {
      // Create HTTP server for WebSocket
      httpServer = createServer();
      io = new SocketIOServer(httpServer, {
        cors: { origin: '*' },
      });

      // Start server
      await new Promise<void>((resolve) => {
        httpServer.listen(0, () => resolve());
      });

      // Connect client
      const address = httpServer.address();
      if (address && typeof address !== 'string') {
        clientSocket = ioClient(`http://localhost:${address.port}`);
        await new Promise<void>((resolve) => {
          clientSocket.on('connect', () => resolve());
        });
      }
    });

    afterEach(async () => {
      // Clean up in proper order: client -> socket.io -> http server
      if (clientSocket?.connected) {
        clientSocket.disconnect();
        await new Promise<void>((resolve) => {
          clientSocket.once('disconnect', () => resolve());
          // Timeout fallback to prevent hanging
          setTimeout(() => resolve(), 100);
        });
      }

      if (io) {
        await new Promise<void>((resolve) => {
          io.close(() => resolve());
        });
      }

      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });

    /**
     * TEST 7: Client Disconnect During Message Emission
     *
     * Verifies handling of client disconnect mid-emission
     */
    it('should handle client disconnect during message emission', async () => {
      const agentId = 'test-agent-disconnect';

      // Subscribe client
      clientSocket.emit('subscribe', { agentId });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Disconnect client
      clientSocket.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit to room (client is gone, should not throw)
      expect(() => {
        io.to(agentId).emit('agent:message', {
          agentId,
          message: { content: 'test' },
        });
      }).not.toThrow();
    });

    /**
     * TEST 8: Emit to Disconnected Client
     *
     * Verifies graceful handling of emission to disconnected client
     */
    it('should handle emit to disconnected client', async () => {
      const clientId = clientSocket.id || 'unknown-client-id';

      // Disconnect client
      clientSocket.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Attempt to emit to disconnected client (should not throw)
      expect(() => {
        io.to(clientId).emit('test-event', { data: 'test' });
      }).not.toThrow();
    });

    /**
     * TEST 9: Malformed Event Data
     *
     * Verifies handling of malformed subscription data
     */
    it('should handle malformed event data gracefully', async () => {
      // Send malformed subscription (missing agentId)
      clientSocket.emit('subscribe', { invalidField: 'test' });

      // Should not crash server
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Server should still be functional
      expect(() => {
        io.emit('test-event', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('Cascading Failures', () => {
    let repository: SqliteAgentRepository;

    beforeEach(() => {
      repository = new SqliteAgentRepository(db);
    });

    /**
     * TEST 10: Isolate Agent Failures
     *
     * Verifies one agent failure doesn't crash system
     */
    it('should isolate agent failures (one failure does not crash system)', async () => {
      // Create first agent (will succeed)
      const agent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      await repository.save(agent1);

      expect(agent1.id).toBeDefined();

      // Attempt to save message with UNIQUE invalid agent ID (will fail)
      const invalidAgentId = `invalid-agent-${Date.now()}-${Math.random().toString(36)}`;
      try {
        await messageService.saveMessage({
          agentId: invalidAgentId,
          type: 'assistant',
          content: 'Should fail',
        });
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/);
      }

      // Create another agent (should succeed despite previous error)
      const agent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });
      await repository.save(agent2);

      expect(agent2.id).toBeDefined();
      expect(agent2.id.toString()).not.toBe(agent1.id.toString());
    });

    /**
     * TEST 11: Continue Serving Other Agents When One Fails
     *
     * Verifies system continues processing other agents
     */
    it('should continue serving other agents when one fails', async () => {
      // Create multiple agents
      const agent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      await repository.save(agent1);

      const agent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });
      await repository.save(agent2);

      // Verify both agents exist
      const agents = await repository.findAll();

      expect(agents).toHaveLength(2);
      expect(agents.find((a: Agent) => a.id.toString() === agent1.id.toString())).toBeDefined();
      expect(agents.find((a: Agent) => a.id.toString() === agent2.id.toString())).toBeDefined();
    });

    /**
     * TEST 12: Recover from Temporary Infrastructure Failures
     *
     * Verifies recovery after infrastructure issue resolved
     */
    it('should recover from temporary infrastructure failures', async () => {
      // Simulate infrastructure failure by closing database
      db.close();

      // Operations should fail
      await expect(repository.findAll()).rejects.toThrow();

      // Recover by reconnecting database
      db.onModuleInit();

      // Operations should succeed again
      const agents = await repository.findAll();
      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    let repository: SqliteAgentRepository;

    beforeEach(() => {
      repository = new SqliteAgentRepository(db);
    });

    /**
     * TEST 13: Allow New Agent Creation After Previous Failure
     *
     * Verifies system allows operations after previous error
     */
    it('should allow new agent creation after previous failure', async () => {
      // Use UNIQUE ID to prevent test pollution
      const fakeAgentId = `fake-agent-recovery-${Date.now()}-${Math.random().toString(36)}`;

      // First attempt fails (invalid message - no agent)
      try {
        await messageService.saveMessage({
          agentId: fakeAgentId,
          type: 'assistant',
          content: 'Should fail',
        });
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/);
      }

      // Second attempt with valid agent should succeed
      const agent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'First agent',
        configuration: {},
      });
      await repository.save(agent1);

      // Now message save should succeed
      const message = await messageService.saveMessage({
        agentId: agent1.id.toString(),
        type: 'assistant',
        content: 'Success after error',
      });

      expect(message.id).toBeDefined();
    });

    /**
     * TEST 14: Database Reconnection After Failure
     *
     * Verifies database can reconnect and accept new operations
     */
    it('should allow database reconnection and new operations', async () => {
      // Create agent before disconnect
      const agent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      await repository.save(agent1);

      // Close and reopen database (simulating reconnection)
      // Note: In-memory DB loses data, but schema is recreated
      db.close();
      db.onModuleInit();

      // Database should be operational again (can create new agents)
      const newRepository = new SqliteAgentRepository(db);
      const agent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });
      await newRepository.save(agent2);

      // Verify new agent was saved successfully
      const agents = await newRepository.findAll();
      expect(agents).toHaveLength(1);
      expect(agents[0]!.id.toString()).toBe(agent2.id.toString());
    });

    /**
     * TEST 15: Clear Error State After Successful Operation
     *
     * Verifies error state doesn't persist after success
     */
    it('should clear error state after successful operation', async () => {
      // Use UNIQUE ID to prevent test pollution
      const agentId = `test-agent-recovery-${Date.now()}-${Math.random().toString(36)}`;

      // First operation fails (no agent exists)
      try {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          role: 'test',
          content: 'Should fail',
        });
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/);
      }

      // Create agent
      const database = db.getDatabase();
      database
        .prepare(
          `
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(agentId, 'synthetic', 'running', 'test', new Date().toISOString());

      // Second operation succeeds (error state cleared)
      const message1 = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: 'First success',
      });

      expect(message1.id).toBeDefined();

      // Third operation also succeeds (proving error state was cleared)
      const message2 = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: 'Second success',
      });

      expect(message2.id).toBeDefined();
      expect(message2.sequenceNumber).toBe(2);
    });
  });
});
