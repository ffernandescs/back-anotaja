import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../lib/prisma';

@Injectable()
export class IngredientCategoriesService {
  async create(createCategoryDto: any, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const category = await prisma.ingredientCategory.create({
      data: {
        ...createCategoryDto,
        branchId: user.branchId,
      },
    });

    return { category };
  }

  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const categories = await prisma.ingredientCategory.findMany({
      where: { branchId: user.branchId },
      orderBy: { name: 'asc' },
    });

    return { categories };
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const category = await prisma.ingredientCategory.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return { category };
  }

  async update(id: string, updateCategoryDto: any, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const category = await prisma.ingredientCategory.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    const updated = await prisma.ingredientCategory.update({
      where: { id },
      data: updateCategoryDto,
    });

    return { category: updated };
  }

  async remove(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user?.branchId) {
      throw new BadRequestException('Usuário não possui filial associada');
    }

    const category = await prisma.ingredientCategory.findFirst({
      where: { id, branchId: user.branchId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    await prisma.ingredientCategory.delete({ where: { id } });

    return { message: 'Categoria excluída com sucesso' };
  }
}
