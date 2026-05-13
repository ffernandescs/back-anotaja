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

  // Verifica se já existe outra branch usando as mesmas chaves
  const duplicatedConfig = await prisma.foodDeliveryIntegrationConfig.findFirst({
    where: {
      branchId: {
        not: branchId,
      },

      OR: [
        dto.ifoodMerchantId
          ? {
              ifoodMerchantId: dto.ifoodMerchantId,
            }
          : undefined,

        dto.ninetyNineFoodMerchantId
          ? {
              ninetyNineFoodMerchantId: dto.ninetyNineFoodMerchantId,
            }
          : undefined,
      ].filter(Boolean) as any,
    },
    include: {
      branch: true,
    },
  });

  if (duplicatedConfig) {
    // Remove as chaves da branch antiga
    await prisma.foodDeliveryIntegrationConfig.update({
      where: {
        id: duplicatedConfig.id,
      },
      data: {
        ifoodMerchantId :
          dto.ifoodMerchantId === duplicatedConfig.ifoodMerchantId
            ? null
            : duplicatedConfig.ifoodMerchantId,


        ninetyNineFoodMerchantId  :
          dto.ninetyNineFoodMerchantId ===
          duplicatedConfig.ninetyNineFoodMerchantId
            ? null
            : duplicatedConfig.ninetyNineFoodMerchantId,
      },
    });
  }

  const updated = await prisma.foodDeliveryIntegrationConfig.update({
    where: { id: config.id },
    data: dto,
  });

  return {
    message: duplicatedConfig
      ? `As chaves já estavam vinculadas à branch "${duplicatedConfig.branch?.branchName}". Elas foram removidas automaticamente da branch anterior.`
      : 'Configuração atualizada com sucesso.',
    data: updated,
  };
}
}
