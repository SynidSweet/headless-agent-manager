import { Module } from '@nestjs/common';
import { AgentOrchestrationService } from './services/agent-orchestration.service';
import { StreamingService } from './services/streaming.service';
import { AgentGateway } from './gateways/agent.gateway';
import { InfrastructureModule } from '@infrastructure/infrastructure.module';

/**
 * Application Module
 * Provides application layer services (use cases)
 * These services depend on domain and infrastructure ports
 * AgentGateway is here to avoid circular dependencies
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    AgentOrchestrationService,
    StreamingService,
    AgentGateway,
    {
      provide: 'IWebSocketGateway',
      useExisting: AgentGateway,
    },
  ],
  exports: [AgentOrchestrationService, StreamingService, AgentGateway],
})
export class ApplicationModule {}
