import { Module } from '@nestjs/common';
import { PresentationModule } from './presentation/presentation.module';

/**
 * App Module
 * Root module for the application
 */
@Module({
  imports: [PresentationModule],
})
export class AppModule {}
