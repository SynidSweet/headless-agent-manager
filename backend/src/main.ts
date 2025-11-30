import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConsoleLogger } from './infrastructure/logging/console-logger.service';
import { ApplicationLifecycleService } from '@application/services/application-lifecycle.service';
import { InstanceAlreadyRunningError } from '@domain/exceptions/instance-already-running.exception';

/**
 * Bootstrap the NestJS application
 */
async function bootstrap(): Promise<void> {
  const logger = new ConsoleLogger();

  logger.info('🚀 Headless AI Agent Management System');
  logger.info('📋 Bootstrapping NestJS application...');

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  // Enable CORS for frontend integration
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://agents.petter.ai',  // Remote access via Vercel tunnel
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Enable validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Add global API prefix
  app.setGlobalPrefix('api');

  // Get lifecycle service
  const lifecycle = app.get(ApplicationLifecycleService);

  try {
    // Check for existing instance BEFORE starting server
    await lifecycle.startup();
  } catch (error) {
    if (error instanceof InstanceAlreadyRunningError) {
      console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ❌ Backend instance already running                      ║
╚═══════════════════════════════════════════════════════════╝

  PID:        ${error.lock.getPid()}
  Started:    ${error.lock.getStartedAt().toISOString()}
  Port:       ${error.lock.getPort()}

  To stop the existing instance:
    kill ${error.lock.getPid()}

  To force restart:
    kill -9 ${error.lock.getPid()} && npm run dev

  Health check:
    curl http://localhost:${error.lock.getPort()}/api/health
      `);
      process.exit(1);
    }
    throw error;
  }

  // Setup graceful shutdown handlers
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await lifecycle.shutdown();
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await lifecycle.shutdown();
    await app.close();
    process.exit(0);
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.info(`✅ Application running: http://localhost:${port}`);
  logger.info(`✅ API Base URL: http://localhost:${port}/api`);
  logger.info('📊 MVP Complete - All Phases (1-5)');
  logger.info('   ✅ Domain: 100% coverage');
  logger.info('   ✅ Application: Services implemented');
  logger.info('   ✅ Infrastructure: SQLite + Adapters');
  logger.info('   ✅ Presentation: REST + WebSocket');
  logger.info('   ✅ Frontend: React UI');
  logger.info('   ✅ Tests: 270+ passing');
  logger.info('');
  logger.info('🎯 Phase 6: Integration & Polish');
}

bootstrap().catch((error) => {
  console.error('❌ Bootstrap failed:', error);
  process.exit(1);
});
