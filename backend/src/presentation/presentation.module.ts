import { Module } from '@nestjs/common';
import { AgentController } from './controllers/agent.controller';
import { TestController } from './controllers/test.controller';
import { HealthController } from './controllers/health.controller';
import { ApplicationModule } from '@application/application.module';
import { InfrastructureModule } from '@infrastructure/infrastructure.module';

/**
 * Presentation Module
 * Provides REST API controllers
 * Depends on Application module for services
 * Note: AgentGateway is in InfrastructureModule to avoid circular dependencies
 */
@Module({
  imports: [ApplicationModule, InfrastructureModule],
  controllers: [AgentController, TestController, HealthController],
})
export class PresentationModule {}
