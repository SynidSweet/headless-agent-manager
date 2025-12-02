import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessManager } from './process/process-manager.service';
import { ClaudeSDKAdapter } from './adapters/claude-sdk.adapter';
import { ClaudePythonProxyAdapter } from './adapters/claude-python-proxy.adapter';
import { SyntheticAgentAdapter } from './adapters/synthetic-agent.adapter';
import { AgentFactoryAdapter } from './adapters/agent-factory.adapter';
import { InMemoryAgentRepository } from './repositories/in-memory-agent.repository';
import { SqliteAgentRepository } from './repositories/sqlite-agent.repository';
import { DatabaseService } from './database/database.service';
import { ConsoleLogger } from './logging/console-logger.service';
import { FileSystemService } from './filesystem/filesystem.service';
import { ProcessUtils } from './process/process.utils';
import { PidFileProcessManager } from './process/pid-file-process-manager.adapter';
import { InMemoryAgentLaunchQueue } from './queue/in-memory-agent-launch-queue.adapter';
import { ClaudeInstructionHandler } from './instruction-handlers/claude-instruction-handler.adapter';

/**
 * Infrastructure Module
 * Provides implementations for all infrastructure concerns
 *
 * NOTE: Circular dependency with ApplicationModule
 * - InfrastructureModule provides queue adapter
 * - Queue needs AgentOrchestrationService from ApplicationModule
 * - Resolved using forwardRef()
 */
@Module({
  imports: [
    ConfigModule.forRoot(),
    forwardRef(() => {
      // Lazy import to avoid circular dependency at module initialization
      const { ApplicationModule } = require('../application/application.module');
      return ApplicationModule;
    }),
  ],
  providers: [
    // Logging
    {
      provide: 'ILogger',
      useClass: ConsoleLogger,
    },
    ConsoleLogger,

    // Process Management
    {
      provide: 'IProcessManager',
      useClass: ProcessManager,
    },
    ProcessManager,

    // File system abstraction
    FileSystemService,
    { provide: 'IFileSystem', useClass: FileSystemService },

    // Process utilities
    ProcessUtils,

    // Instance lock manager
    PidFileProcessManager,
    {
      provide: 'IInstanceLockManager',
      useClass: PidFileProcessManager,
    },

    // PID file path configuration
    {
      provide: 'PID_FILE_PATH',
      useFactory: (config: ConfigService) => {
        return config.get<string>('PID_FILE_PATH') || './data/backend.pid';
      },
      inject: [ConfigService],
    },

    // Claude SDK Adapter (requires API key)
    {
      provide: ClaudeSDKAdapter,
      useFactory: (logger: ConsoleLogger, configService: ConfigService) => {
        const apiKey = configService.get<string>('ANTHROPIC_API_KEY') || '';
        return new ClaudeSDKAdapter(apiKey, logger);
      },
      inject: [ConsoleLogger, ConfigService],
    },

    // Claude Python Proxy Adapter (uses Max subscription)
    {
      provide: ClaudePythonProxyAdapter,
      useFactory: (logger: ConsoleLogger, configService: ConfigService) => {
        const proxyUrl = configService.get<string>('CLAUDE_PROXY_URL') || 'http://localhost:8000';
        return new ClaudePythonProxyAdapter(proxyUrl, logger);
      },
      inject: [ConsoleLogger, ConfigService],
    },

    // Agent Factory (configurable via CLAUDE_ADAPTER env var)
    {
      provide: 'IAgentFactory',
      useFactory: (
        sdkAdapter: ClaudeSDKAdapter,
        proxyAdapter: ClaudePythonProxyAdapter,
        config: ConfigService,
        logger: ConsoleLogger
      ) => {
        const adapterType = config.get<string>('CLAUDE_ADAPTER') || 'python-proxy';

        logger.info('Configuring AgentFactory', { adapterType });

        switch (adapterType) {
          case 'sdk':
            logger.info('Using ClaudeSDKAdapter (requires API key)');
            return new AgentFactoryAdapter(sdkAdapter);

          case 'python-proxy':
            logger.info('Using ClaudePythonProxyAdapter (uses Max subscription)');
            return new AgentFactoryAdapter(proxyAdapter);

          default:
            logger.warn(`Unknown adapter type: ${adapterType}, defaulting to python-proxy`);
            return new AgentFactoryAdapter(proxyAdapter);
        }
      },
      inject: [ClaudeSDKAdapter, ClaudePythonProxyAdapter, ConfigService, ConsoleLogger],
    },
    AgentFactoryAdapter,

    // PHASE 4: Synthetic Agent Adapter (for testing)
    SyntheticAgentAdapter,

    // Database Service - SINGLETON SCOPE (critical for data consistency)
    // NOTE: No scope specified = DEFAULT scope = singleton
    {
      provide: DatabaseService,
      useFactory: (config: ConfigService, logger: ConsoleLogger) => {
        const repositoryType = config.get<string>('REPOSITORY_TYPE') || 'memory';

        logger.warn('[FACTORY] DatabaseService factory called - creating new instance');

        if (repositoryType === 'sqlite') {
          const dbPath = config.get<string>('DATABASE_PATH') || './data/agents.db';
          logger.info('Initializing SQLite database', { dbPath });
          return new DatabaseService(dbPath);
        }

        // Return a dummy service for in-memory mode
        logger.warn('Using in-memory database');
        return new DatabaseService(':memory:');
      },
      inject: [ConfigService, ConsoleLogger],
    },

    // Repository (configurable via REPOSITORY_TYPE env var)
    {
      provide: 'IAgentRepository',
      useFactory: (config: ConfigService, logger: ConsoleLogger, dbService: DatabaseService) => {
        const repositoryType = config.get<string>('REPOSITORY_TYPE') || 'memory';

        logger.info('Configuring AgentRepository', { repositoryType });

        switch (repositoryType) {
          case 'sqlite':
            logger.info('Using SqliteAgentRepository (persistent storage)');
            return new SqliteAgentRepository(dbService);

          case 'memory':
          default:
            logger.info('Using InMemoryAgentRepository (not persistent)');
            return new InMemoryAgentRepository();
        }
      },
      inject: [ConfigService, ConsoleLogger, DatabaseService],
    },
    // NOTE: InMemoryAgentRepository and SqliteAgentRepository are NOT registered as standalone providers
    // They are only created via the IAgentRepository factory above
    // Registering them here would cause NestJS to inject DatabaseService into them,
    // creating multiple DatabaseService instances and breaking data consistency!

    // Instruction Handler (for custom instructions feature)
    ClaudeInstructionHandler,
    {
      provide: 'IInstructionHandler',
      useClass: ClaudeInstructionHandler,
    },

    // Agent Launch Queue (for serialized agent launches)
    // NOTE: Circular dependency with AgentOrchestrationService
    // Queue needs orchestration service to call launchAgentDirect
    // Orchestration service needs queue to enqueue requests
    // This is resolved by NestJS's dependency injection at runtime
    InMemoryAgentLaunchQueue,
    {
      provide: 'IAgentLaunchQueue',
      useClass: InMemoryAgentLaunchQueue,
    },
  ],
  exports: [
    'ILogger',
    'IProcessManager',
    'IAgentFactory',
    'IAgentRepository',
    'IFileSystem',
    'IInstanceLockManager',
    'IInstructionHandler',
    'IAgentLaunchQueue',
    ClaudeSDKAdapter,
    ClaudePythonProxyAdapter,
    SyntheticAgentAdapter,
    ProcessManager,
    DatabaseService,
  ],
})
export class InfrastructureModule {}
