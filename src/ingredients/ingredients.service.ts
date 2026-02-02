import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../lib/prisma';

@Injectable()
export class IngredientsService {
  async create(createIngredientDto: any, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        ...createIngredientDto,
        branchId: user.branchId,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return { ingredient };
  }

  async findAll(userId: string, categoryId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const where: any = { branchId: user.branchId };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const ingredients = await prisma.ingredient.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { ingredients };
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id, branchId: user.branchId },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingrediente não encontrado');
    }

    return { ingredient };
  }

  async update(id: string, updateIngredientDto: any, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingrediente não encontrado');
    }

    const updated = await prisma.ingredient.update({
      where: { id },
      data: updateIngredientDto,
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return { ingredient: updated };
  }

  async remove(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingrediente não encontrado');
    }

    await prisma.ingredient.delete({ where: { id } });

    return { message: 'Ingrediente excluído com sucesso' };
  }
}
