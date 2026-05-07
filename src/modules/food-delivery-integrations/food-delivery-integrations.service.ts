import { Injectable } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { UpdateFoodDeliveryConfigDto } from './dto/food-delivery.dto';

@Injectable()
export class FoodDeliveryIntegrationsService {
  async getOrCreateConfig(branchId: string) {
    let config = await prisma.foodDeliveryIntegrationConfig.findUnique({
      where: { branchId },
    });

    if (!config) {
      config = await prisma.foodDeliveryIntegrationConfig.create({
        data: { branchId },
      });
    }

    return config;
  }

  async getConfig(branchId: string) {
    return this.getOrCreateConfig(branchId);
  }

  async updateConfig(branchId: string, dto: UpdateFoodDeliveryConfigDto) {
    const config = await this.getOrCreateConfig(branchId);

    return prisma.foodDeliveryIntegrationConfig.update({
      where: { id: config.id },
      data: dto,
    });
  }
}
