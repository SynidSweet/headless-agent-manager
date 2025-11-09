import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessManager } from './process/process-manager.service';
import { ClaudeSDKAdapter } from './adapters/claude-sdk.adapter';
import { ClaudePythonProxyAdapter } from './adapters/claude-python-proxy.adapter';
import { AgentFactoryAdapter } from './adapters/agent-factory.adapter';
import { InMemoryAgentRepository } from './repositories/in-memory-agent.repository';
import { SqliteAgentRepository } from './repositories/sqlite-agent.repository';
import { DatabaseService } from './database/database.service';
import { ConsoleLogger } from './logging/console-logger.service';

/**
 * Infrastructure Module
 * Provides implementations for all infrastructure concerns
 */
@Module({
  imports: [ConfigModule.forRoot()],
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

    // Database Service
    {
      provide: DatabaseService,
      useFactory: (config: ConfigService, logger: ConsoleLogger) => {
        const repositoryType = config.get<string>('REPOSITORY_TYPE') || 'memory';

        if (repositoryType === 'sqlite') {
          const dbPath = config.get<string>('DATABASE_PATH') || './data/agents.db';
          logger.info('Initializing SQLite database', { dbPath });
          return new DatabaseService(dbPath);
        }

        // Return a dummy service for in-memory mode
        return new DatabaseService(':memory:');
      },
      inject: [ConfigService, ConsoleLogger],
    },

    // Repository (configurable via REPOSITORY_TYPE env var)
    {
      provide: 'IAgentRepository',
      useFactory: (
        config: ConfigService,
        logger: ConsoleLogger,
        dbService: DatabaseService
      ) => {
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
    InMemoryAgentRepository,
    SqliteAgentRepository,
  ],
  exports: [
    'ILogger',
    'IProcessManager',
    'IAgentFactory',
    'IAgentRepository',
    ClaudeSDKAdapter,
    ClaudePythonProxyAdapter,
    ProcessManager,
  ],
})
export class InfrastructureModule {}
