import { Controller, Get } from '@nestjs/common';
import { ProviderInfoService } from '@application/services/provider-info.service';
import { ProvidersResponseDto } from '@application/dto/provider-info.dto';

/**
 * Providers Controller
 * Provides information about available AI providers and their models
 * Base path: /api/providers (global prefix applied)
 */
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providerInfoService: ProviderInfoService) {}

  /**
   * Get all available providers
   * GET /providers
   *
   * Returns complete information about available AI providers,
   * their capabilities, and supported models.
   */
  @Get()
  async getProviders(): Promise<ProvidersResponseDto> {
    const providers = await this.providerInfoService.getAvailableProviders();
    return ProvidersResponseDto.fromDomain(providers);
  }
}
