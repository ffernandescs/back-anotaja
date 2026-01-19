import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { UpdateProductAdvancedOptionsDto } from './dto/update-product-advanced-options.dto';

@Injectable()
export class ProductsService {
  async create(createProductDto: CreateProductDto, userId: string) {
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

    // Verificar se a categoria existe e pertence à mesma filial
    const category = await prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    if (category.branchId !== user.branchId) {
      throw new ForbiddenException('A categoria não pertence à sua filial');
    }

    // Criar o produto
    const product = await prisma.product.create({
      data: {
        ...createProductDto,
        branchId: user.branchId, // Sempre usar branchId do usuário logado
        active: createProductDto.active ?? true,
        featured: createProductDto.featured ?? false,
        stockControlEnabled: createProductDto.stockControlEnabled ?? false,
        promotionalStartDate: createProductDto.promotionalStartDate
          ? new Date(createProductDto.promotionalStartDate)
          : null,
        promotionalEndDate: createProductDto.promotionalEndDate
          ? new Date(createProductDto.promotionalEndDate)
          : null,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        complements: {
          include: {
            options: true,
          },
        },
      },
    });

    return product;
  }

  async findAll(
    userId: string,
    categoryId?: string,
    active?: boolean | string,
    featured?: boolean | string,
  ) {
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

    // Usar tipo correto do Prisma
    const where: Prisma.ProductWhereInput = {
      branchId: user.branchId,
    };

    // Filtro por categoria
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filtro por produtos ativos
    if (active !== undefined) {
      const isActive = typeof active === 'boolean' ? active : active === 'true';
      where.active = isActive;
    }

    // Filtro por produtos em destaque
    if (featured !== undefined) {
      const isFeatured =
        typeof featured === 'boolean' ? featured : featured === 'true';
      where.featured = isFeatured;
    }

    return prisma.product.findMany({
      where,
      orderBy: [
        { displayOrder: 'asc' },
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        complements: {
          include: {
            options: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
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

    const product = await prisma.product.findUnique({
      where: {
        id,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        additions: {
          where: {
            active: true,
          },
          select: {
            id: true,
            name: true,
            price: true,
            minQuantity: true,
          },
        },
        complements: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, userId: string) {
    // Verificar se o produto existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Verificar categoria
    if (updateProductDto.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: updateProductDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('Categoria não encontrada');
      }

      if (category.branchId !== user.branchId) {
        throw new ForbiddenException('A categoria não pertence à sua filial');
      }
    }

    // Tipar corretamente o objeto de atualização

    return prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        complements: {
          include: {
            options: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async updateAdvancedOptions(
    productId: string,
    data: UpdateProductAdvancedOptionsDto,
    userId: string,
  ) {
    // Garantir que o produto existe e pertence à branch
    await this.findOne(productId, userId);

    // Preparar dados para o Prisma
    const updateData: Prisma.ProductUpdateInput = {
      ...data,
      promotionalStartDate: data.promotionalStartDate
        ? new Date(data.promotionalStartDate)
        : null,
      promotionalEndDate: data.promotionalEndDate
        ? new Date(data.promotionalEndDate)
        : null,
      promotionalDays: data.promotionalDays
        ? JSON.stringify(data.promotionalDays)
        : null,
    };

    return prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Verifica se produto existe e se o usuário tem permissão
    await this.findOne(id, userId);

    // Verifica se há pedidos associados
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderItemsCount > 0) {
      // Apenas desativa
      return prisma.product.update({
        where: { id },
        data: { active: false },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      });
    }

    // Deleta produto sem tocar em complementos
    return prisma.product.delete({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async findFeatured(userId: string) {
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

    return prisma.product.findMany({
      where: {
        branchId: user.branchId,
        active: true,
        featured: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async findByCategory(categoryId: string, userId: string) {
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

    // Verificar se a categoria existe e pertence à mesma filial
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    if (category.branchId !== user.branchId) {
      throw new ForbiddenException('A categoria não pertence à sua filial');
    }

    return prisma.product.findMany({
      where: {
        branchId: user.branchId,
        categoryId,
        active: true,
      },
      orderBy: [
        { displayOrder: 'asc' },
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }
}
