import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderOrigin } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  buildOrderChannelCampaignLink,
  isValidOrderOriginCode,
  suggestOrderOriginCode as generateOrderOriginCode,
} from '../../utils/order-channel-campaign';
import { buildBranchStorefrontPublicUrl } from '../../utils/storefront-url';

@Injectable()
export class OrderOriginsService {
  async getOrderOrigins(): Promise<OrderOrigin[]> {
    return prisma.orderOrigin.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async suggestOrderOriginCode(name: string): Promise<{ code: string }> {
    const existing = await prisma.orderOrigin.findMany({
      select: { code: true },
    });
    const code = generateOrderOriginCode(
      name,
      existing.map((o) => o.code),
    );
    return { code };
  }

  async createOrderOrigin(dto: { name: string; code?: string }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nome da origem é obrigatório');

    const existingCodes = (
      await prisma.orderOrigin.findMany({
        select: { code: true },
      })
    ).map((o) => o.code);

    let code = (dto.code ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!code) {
      code = generateOrderOriginCode(name, existingCodes);
    }
    if (!isValidOrderOriginCode(code)) {
      throw new BadRequestException(
        'Código deve ter no mínimo 5 caracteres, apenas letras e números (a-z, 0-9), com ambos na mesma combinação.',
      );
    }
    if (existingCodes.some((c) => c.toLowerCase() === code)) {
      throw new BadRequestException('Já existe uma origem com este código');
    }

    return prisma.orderOrigin.create({
      data: { name, code },
    });
  }

  async updateOrderOrigin(
    id: string,
    dto: { name?: string; code?: string },
  ) {
    const existing = await prisma.orderOrigin.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Origem não encontrada');

    const name = dto.name?.trim() ?? existing.name;
    let code = existing.code;
    if (dto.code !== undefined) {
      code = dto.code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!isValidOrderOriginCode(code)) {
        throw new BadRequestException(
          'Código deve ter no mínimo 5 caracteres, apenas letras e números (a-z, 0-9), com ambos na mesma combinação.',
        );
      }
      const conflict = await prisma.orderOrigin.findFirst({
        where: { code, NOT: { id } },
      });
      if (conflict) throw new BadRequestException('Já existe uma origem com este código');
    }

    const updated = await prisma.orderOrigin.update({
      where: { id },
      data: { name, code },
    });

    await this.refreshCampaignLinksForOrigin(id);
    return updated;
  }

  async deleteOrderOrigin(id: string) {
    const existing = await prisma.orderOrigin.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Origem não encontrada');

    const inUse = await prisma.orderChannelCampaign.count({
      where: { orderOriginId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Origem em uso por campanhas. Exclua ou altere as campanhas antes.',
      );
    }

    return prisma.orderOrigin.delete({ where: { id } });
  }

  async requireOrderOrigin(orderOriginId: string) {
    const origin = await prisma.orderOrigin.findFirst({
      where: { id: orderOriginId },
    });
    if (!origin) throw new BadRequestException('Origem não encontrada');
    return origin;
  }

  private async refreshCampaignLinksForOrigin(orderOriginId: string) {
    const origin = await prisma.orderOrigin.findFirst({
      where: { id: orderOriginId },
    });
    if (!origin) return;

    const campaigns = await prisma.orderChannelCampaign.findMany({
      where: { orderOriginId },
      select: { id: true, branchId: true },
    });

    for (const campaign of campaigns) {
      const branch = await prisma.branch.findUnique({
        where: { id: campaign.branchId },
        select: { subdomain: true },
      });
      const menuBaseUrl = buildBranchStorefrontPublicUrl(branch?.subdomain ?? null);
      if (!menuBaseUrl) continue;

      const linkUrl = buildOrderChannelCampaignLink({
        menuBaseUrl,
        originCode: origin.code,
        campaignId: campaign.id,
      });
      await prisma.orderChannelCampaign.update({
        where: { id: campaign.id },
        data: { linkUrl, orderChannelCode: origin.code },
      });
    }
  }
}
