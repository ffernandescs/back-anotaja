import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../lib/prisma';
import { CreateStockMovementDto, StockItemType, StockMovementType } from './dto/create-stock-movement.dto';

@Injectable()
export class StockService {
  async createMovement(dto: CreateStockMovementDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    // Validar que apenas um ID foi fornecido
    const ids = [dto.productId, dto.optionId, dto.ingredientId].filter(Boolean);
    if (ids.length !== 1) {
      throw new BadRequestException('Deve ser fornecido exatamente um ID (produto, opção ou ingrediente)');
    }

    // Validar existência do item
    if (dto.itemType === StockItemType.PRODUCT && dto.productId) {
      const product = await prisma.product.findFirst({
        where: { id: dto.productId, branchId: user.branchId },
      });
      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }
    } else if (dto.itemType === StockItemType.OPTION && dto.optionId) {
      const option = await prisma.complementOption.findFirst({
        where: { id: dto.optionId, branchId: user.branchId },
      });
      if (!option) {
        throw new NotFoundException('Opção não encontrada');
      }
    } else if (dto.itemType === StockItemType.INGREDIENT && dto.ingredientId) {
      const ingredient = await prisma.ingredient.findFirst({
        where: { id: dto.ingredientId, branchId: user.branchId },
      });
      if (!ingredient) {
        throw new NotFoundException('Ingrediente não encontrado');
      }
    }

    const movement = await prisma.stockMovement.create({
      data: {
        type: dto.type,
        productId: dto.productId,
        optionId: dto.optionId,
        ingredientId: dto.ingredientId,
        variation: dto.variation,
        quantity: Math.abs(dto.variation),
        description: dto.reason,
        branchId: user.branchId,
      },
      include: {
        product: { select: { name: true } },
        option: { select: { name: true } },
        ingredient: { select: { name: true } },
      },
    });

    // Adicionar itemType calculado na resposta
    return {
      ...movement,
      itemType: dto.itemType,
    };
  }

  async findAll(userId: string, itemType?: StockItemType, itemId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const where: any = { branchId: user.branchId };

    // Filtrar por itemId se fornecido
    if (itemId) {
      if (itemType === StockItemType.PRODUCT) {
        where.productId = itemId;
      } else if (itemType === StockItemType.OPTION) {
        where.optionId = itemId;
      } else if (itemType === StockItemType.INGREDIENT) {
        where.ingredientId = itemId;
      } else {
        // Se itemId fornecido sem itemType, buscar em todos
        where.OR = [
          { productId: itemId },
          { optionId: itemId },
          { ingredientId: itemId },
        ];
      }
    } else if (itemType) {
      // Filtrar apenas por tipo (retornar apenas movimentações desse tipo)
      if (itemType === StockItemType.PRODUCT) {
        where.productId = { not: null };
      } else if (itemType === StockItemType.OPTION) {
        where.optionId = { not: null };
      } else if (itemType === StockItemType.INGREDIENT) {
        where.ingredientId = { not: null };
      }
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { name: true } },
        option: { select: { name: true } },
        ingredient: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Adicionar itemType calculado em cada movimento
    const movementsWithType = movements.map((m) => ({
      ...m,
      itemType: m.productId ? 'PRODUCT' : m.optionId ? 'OPTION' : 'INGREDIENT',
    }));

    return { movements: movementsWithType };
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const movement = await prisma.stockMovement.findFirst({
      where: { id, branchId: user.branchId },
      include: {
        product: { select: { name: true } },
        option: { select: { name: true } },
        ingredient: { select: { name: true } },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimentação não encontrada');
    }

    // Adicionar itemType calculado
    return {
      ...movement,
      itemType: movement.productId ? 'PRODUCT' : movement.optionId ? 'OPTION' : 'INGREDIENT',
    };
  }

  async delete(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const movement = await prisma.stockMovement.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!movement) {
      throw new NotFoundException('Movimentação não encontrada');
    }

    await prisma.stockMovement.delete({ where: { id } });

    return { message: 'Movimentação excluída com sucesso' };
  }
}
