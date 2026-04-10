import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { MarketingIntegrationsService, UpdateMarketingIntegrationDto } from './marketing-integrations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('marketing-integrations')
@UseGuards(JwtAuthGuard)
export class MarketingIntegrationsController {
  constructor(private readonly marketingIntegrationsService: MarketingIntegrationsService) {}

  @Get(':branchId')
  async getConfig(@Param('branchId') branchId: string) {
    return this.marketingIntegrationsService.getConfigByBranch(branchId);
  }

  @Put(':branchId')
  async updateConfig(
    @Param('branchId') branchId: string,
    @Body() data: UpdateMarketingIntegrationDto,
  ) {
    return this.marketingIntegrationsService.updateConfig(branchId, data);
  }
}
