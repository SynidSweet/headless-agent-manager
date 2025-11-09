import { Module } from '@nestjs/common';
import { AgentController } from './controllers/agent.controller';
import { ApplicationModule } from '@application/application.module';

/**
 * Presentation Module
 * Provides REST API controllers
 * Depends on Application module for services
 * Note: AgentGateway is in InfrastructureModule to avoid circular dependencies
 */
@Module({
  imports: [ApplicationModule],
  controllers: [AgentController],
})
export class PresentationModule {}
