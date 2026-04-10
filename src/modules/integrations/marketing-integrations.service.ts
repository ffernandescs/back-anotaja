import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

export interface UpdateMarketingIntegrationDto {
  facebookPixelEnabled?: boolean;
  facebookPixelId?: string;
  gtmEnabled?: boolean;
  gtmContainerId?: string;
  googleAnalyticsEnabled?: boolean;
  googleAnalyticsTrackingId?: string;
}

@Injectable()
export class MarketingIntegrationsService {
  async getConfigByBranch(branchId: string): Promise<any | null> {
    return prisma.marketingIntegrationConfig.findUnique({
      where: { branchId },
    });
  }

  async getOrCreateConfig(branchId: string): Promise<any> {
    let config = await this.getConfigByBranch(branchId);

    if (!config) {
      config = await prisma.marketingIntegrationConfig.create({
        data: { branchId },
      });
    }

    return config;
  }

  async updateConfig(
    branchId: string,
    data: UpdateMarketingIntegrationDto,
  ): Promise<any> {
    const config = await this.getOrCreateConfig(branchId);

    return prisma.marketingIntegrationConfig.update({
      where: { id: config.id },
      data,
    });
  }
}
