import { Injectable } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

export interface UpdatePaymentGatewayDto {
  enabled?: boolean;
  apiKey?: string;
  secretKey?: string;
  merchantId?: string;
  config?: string;
}

@Injectable()
export class PaymentGatewaysService {
  async getGatewaysByBranch(branchId: string): Promise<any[]> {
    return prisma.paymentGatewayConfig.findMany({
      where: { branchId },
    });
  }

  async getGatewayByType(branchId: string, gatewayType: string): Promise<any | null> {
    return prisma.paymentGatewayConfig.findUnique({
      where: {
        branchId_gatewayType: {
          branchId,
          gatewayType,
        },
      },
    });
  }

  async getOrCreateGateway(branchId: string, gatewayType: string): Promise<any> {
    let gateway = await this.getGatewayByType(branchId, gatewayType);

    if (!gateway) {
      gateway = await prisma.paymentGatewayConfig.create({
        data: { branchId, gatewayType },
      });
    }

    return gateway;
  }

  async updateGateway(
    branchId: string,
    gatewayType: string,
    data: UpdatePaymentGatewayDto,
  ): Promise<any> {
    const gateway = await this.getOrCreateGateway(branchId, gatewayType);

    return prisma.paymentGatewayConfig.update({
      where: { id: gateway.id },
      data,
    });
  }
}
