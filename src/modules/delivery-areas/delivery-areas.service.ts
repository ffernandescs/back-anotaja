import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateDeliveryAreaDto } from './dto/create-delivery-area.dto';
import { prisma } from '../../../lib/prisma';
import { CreateDeliveryAreaExclusionDto } from './dto/create-delivery-area-exclusion.dto';
import { UpdateDeliveryAreaExclusionDto } from './dto/update-delivery-area.dto';

@Injectable()
export class DeliveryAreasService {
  // ========== MÉTODOS AUXILIARES ==========
  private async getUserBranch(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    return user.branchId;
  }

  async create(userId: string, createDeliveryAreaDto: CreateDeliveryAreaDto) {
    const branchId = await this.getUserBranch(userId);

    // 🔹 Buscar o maior level da branch
    const lastArea = await prisma.deliveryArea.findFirst({
      where: { branchId },
      orderBy: { level: 'desc' },
      select: { level: true },
    });

    const nextLevel = lastArea ? lastArea.level + 1 : 1;

    try {
      const deliveryArea = await prisma.deliveryArea.create({
        data: {
          name: createDeliveryAreaDto.name,
          type: createDeliveryAreaDto.type,
          centerLat: createDeliveryAreaDto.centerLat ?? null,
          centerLng: createDeliveryAreaDto.centerLng ?? null,
          radius: createDeliveryAreaDto.radius ?? null,
          polygon: createDeliveryAreaDto.polygon ?? null,
          deliveryFee: createDeliveryAreaDto.deliveryFee,
          minOrderValue: createDeliveryAreaDto.minOrderValue ?? null,
          estimatedTime: createDeliveryAreaDto.estimatedTime ?? null,
          level: nextLevel, // 👈 sempre controlado pelo backend
          active: createDeliveryAreaDto.active,
          branchId,
        },
      });

      return deliveryArea;
    } catch (error) {
      console.error('Erro ao criar área de entrega:', error);
      throw new Error('Erro ao criar área de entrega');
    }
  }

  async findAll(userId: string) {
    const branchId = await this.getUserBranch(userId);

    const deliveryAreas = await prisma.deliveryArea.findMany({
      where: { branchId },
      orderBy: { level: 'asc' },
    });

    return deliveryAreas;
  }

  async findOne(userId: string, id: string) {
    const branchId = await this.getUserBranch(userId);

    const deliveryArea = await prisma.deliveryArea.findFirst({
      where: { id, branchId },
    });

    if (!deliveryArea) {
      throw new NotFoundException('Área de entrega não encontrada');
    }

    return deliveryArea;
  }

  async update(
    userId: string,
    id: string,
    updateDeliveryAreaDto: UpdateDeliveryAreaExclusionDto,
  ) {
    const branchId = await this.getUserBranch(userId);

    const existingArea = await prisma.deliveryArea.findFirst({
      where: { id, branchId },
    });

    if (!existingArea) {
      throw new NotFoundException('Área de entrega não encontrada');
    }

    // 🔹 Se não vier level no body, mantém o atual
    const level = existingArea.level;

    try {
      const deliveryArea = await prisma.deliveryArea.update({
        where: { id },
        data: {
          name: updateDeliveryAreaDto.name,
          type: updateDeliveryAreaDto.type,
          centerLat: updateDeliveryAreaDto.centerLat ?? null,
          centerLng: updateDeliveryAreaDto.centerLng ?? null,
          radius: updateDeliveryAreaDto.radius ?? null,
          polygon: updateDeliveryAreaDto.polygon ?? null,
          deliveryFee: updateDeliveryAreaDto.deliveryFee,
          minOrderValue: updateDeliveryAreaDto.minOrderValue ?? null,
          estimatedTime: updateDeliveryAreaDto.estimatedTime ?? null,
          level, // 👈 controlado com segurança
          active: updateDeliveryAreaDto.active,
        },
      });

      return deliveryArea;
    } catch (error) {
      console.error('Erro ao atualizar área de entrega:', error);
      throw new Error('Erro ao atualizar área de entrega');
    }
  }

  async updateLevel(userId: string, id: string, newLevel: number) {
    const branchId = await this.getUserBranch(userId);

    const currentArea = await prisma.deliveryArea.findFirst({
      where: { id, branchId },
    });

    if (!currentArea) {
      throw new NotFoundException('Área de entrega não encontrada');
    }

    if (currentArea.level === newLevel) {
      // mesmo assim retorna tudo para manter contrato consistente
      return prisma.deliveryArea.findMany({
        where: { branchId },
        orderBy: { level: 'asc' },
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1️⃣ move temporariamente para evitar conflito
      await tx.deliveryArea.update({
        where: { id },
        data: { level: -9999 },
      });

      if (newLevel > currentArea.level) {
        // 🔽 move para baixo
        await tx.deliveryArea.updateMany({
          where: {
            branchId,
            level: {
              gt: currentArea.level,
              lte: newLevel,
            },
          },
          data: {
            level: { decrement: 1 },
          },
        });
      } else {
        // 🔼 move para cima
        await tx.deliveryArea.updateMany({
          where: {
            branchId,
            level: {
              gte: newLevel,
              lt: currentArea.level,
            },
          },
          data: {
            level: { increment: 1 },
          },
        });
      }

      // 2️⃣ coloca no level correto
      await tx.deliveryArea.update({
        where: { id },
        data: { level: newLevel },
      });
    });

    // 🔥 RETORNA TUDO, JÁ ORDENADO
    return prisma.deliveryArea.findMany({
      where: { branchId },
      orderBy: { level: 'asc' },
    });
  }

  async remove(userId: string, id: string) {
    const branchId = await this.getUserBranch(userId);

    // Verificar se a área pertence à filial do usuário
    const existingArea = await prisma.deliveryArea.findFirst({
      where: { id, branchId },
    });

    if (!existingArea) {
      throw new NotFoundException('Área de entrega não encontrada');
    }

    try {
      await prisma.deliveryArea.delete({
        where: { id },
      });
      return { message: 'Área de entrega excluída com sucesso' };
    } catch (error) {
      console.error('Erro ao excluir área de entrega:', error);
      throw new Error('Erro ao excluir área de entrega');
    }
  }

  // ========== EXCLUSION AREAS ==========
  async createExclusion(
    userId: string,
    createDeliveryAreaExclusionDto: CreateDeliveryAreaExclusionDto,
  ) {
    const branchId = await this.getUserBranch(userId);

    try {
      const deliveryExclusionArea = await prisma.deliveryExclusionArea.create({
        data: {
          name: createDeliveryAreaExclusionDto.name,
          type: createDeliveryAreaExclusionDto.type,
          centerLat: createDeliveryAreaExclusionDto.centerLat ?? null,
          centerLng: createDeliveryAreaExclusionDto.centerLng ?? null,
          radius: createDeliveryAreaExclusionDto.radius ?? null,
          polygon: createDeliveryAreaExclusionDto.polygon ?? null,
          active: createDeliveryAreaExclusionDto.active,
          branchId,
        },
      });
      return deliveryExclusionArea;
    } catch (error) {
      console.error('Erro ao criar área de exclusão:', error);
      throw new Error('Erro ao criar área de exclusão');
    }
  }

  async findAllExclusion(userId: string) {
    const branchId = await this.getUserBranch(userId);

    const deliveryExclusionAreas = await prisma.deliveryExclusionArea.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });

    return deliveryExclusionAreas;
  }

  async findOneExclusion(userId: string, id: string) {
    const branchId = await this.getUserBranch(userId);

    const deliveryExclusionArea = await prisma.deliveryExclusionArea.findFirst({
      where: { id, branchId },
    });

    if (!deliveryExclusionArea) {
      throw new NotFoundException('Área de exclusão não encontrada');
    }

    return deliveryExclusionArea;
  }

  async updateExclusion(
    userId: string,
    id: string,
    updateDeliveryAreaExclusionDto: UpdateDeliveryAreaExclusionDto,
  ) {
    const branchId = await this.getUserBranch(userId);

    // Verificar se a área pertence à filial do usuário
    const existingArea = await prisma.deliveryExclusionArea.findFirst({
      where: { id, branchId },
    });

    if (!existingArea) {
      throw new NotFoundException('Área de exclusão não encontrada');
    }

    try {
      const deliveryExclusionArea = await prisma.deliveryExclusionArea.update({
        where: { id },
        data: {
          name: updateDeliveryAreaExclusionDto.name,
          type: updateDeliveryAreaExclusionDto.type,
          centerLat: updateDeliveryAreaExclusionDto.centerLat ?? null,
          centerLng: updateDeliveryAreaExclusionDto.centerLng ?? null,
          radius: updateDeliveryAreaExclusionDto.radius ?? null,
          polygon: updateDeliveryAreaExclusionDto.polygon ?? null,
          active: updateDeliveryAreaExclusionDto.active,
        },
      });
      return deliveryExclusionArea;
    } catch (error) {
      console.error('Erro ao atualizar área de exclusão:', error);
      throw new Error('Erro ao atualizar área de exclusão');
    }
  }

  async removeExclusion(userId: string, id: string) {
    const branchId = await this.getUserBranch(userId);

    // Verificar se a área pertence à filial do usuário
    const existingArea = await prisma.deliveryExclusionArea.findFirst({
      where: { id, branchId },
    });

    if (!existingArea) {
      throw new NotFoundException('Área de exclusão não encontrada');
    }

    try {
      await prisma.deliveryExclusionArea.delete({
        where: { id },
      });
      return { message: 'Área de exclusão excluída com sucesso' };
    } catch (error) {
      console.error('Erro ao excluir área de exclusão:', error);
      throw new Error('Erro ao excluir área de exclusão');
    }
  }
}
