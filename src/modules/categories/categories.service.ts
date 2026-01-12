import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class CategoriesService {
  async create(createCategoryDto: CreateCategoryDto, userId: string) {
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

    const existingCategory = await prisma.category.findFirst({
      where: {
        slug: createCategoryDto.slug,
        branchId: user.branchId,
      },
    });

    if (existingCategory) {
      throw new ConflictException(
        'Já existe uma categoria com este slug nesta filial',
      );
    }

    // Criar a categoria
    const category = await prisma.category.create({
      data: {
        ...createCategoryDto,
        branchId: user.branchId, // Sempre usar branchId do usuário logado
        active: createCategoryDto.active ?? true,
        featured: createCategoryDto.featured ?? false,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    return category;
  }

  async findAll(userId: string, active?: boolean | string) {
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

    // Construir filtro where - sempre usar branchId do usuário logado
    const where: {
      branchId: string;
      active?: boolean;
    } = {
      branchId: user.branchId,
    };

    // Filtro por categorias ativas (aceita boolean ou string 'true'/'false')
    if (active !== undefined) {
      const isActive = typeof active === 'boolean' ? active : active === 'true';
      where.active = isActive;
    }

    return prisma.category.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        products: {
          include: {
            complements: {
              include: {
                options: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
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

    const category = await prisma.category.findUnique({
      where: {
        id,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        products: {
          where: {
            active: true,
          },
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            promotionalPrice: true,
          },
          take: 10, // Limitar a 10 produtos
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  async findBySlug(slug: string, userId: string) {
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

    const category = await prisma.category.findFirst({
      where: {
        slug,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        products: {
          where: {
            active: true,
          },
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            promotionalPrice: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    userId: string,
  ) {
    // Verificar se a categoria existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Se estiver atualizando o slug, verificar se não existe outro com o mesmo slug
    if (updateCategoryDto.slug) {
      const existingCategory = await prisma.category.findFirst({
        where: {
          slug: updateCategoryDto.slug,
          branchId: user.branchId,
          id: { not: id },
        },
      });

      if (existingCategory) {
        throw new ConflictException(
          'Já existe uma categoria com este slug nesta filial',
        );
      }
    }

    return prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Verificar se a categoria existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Verificar se há produtos associados
    const productsCount = await prisma.product.count({
      where: { categoryId: id },
    });

    // Usar transação para garantir atomicidade
    return prisma.$transaction(async (tx) => {
      let uncategorizedCategory: {
        id: string;
        name: string;
      } | null = null;

      // Se houver produtos, buscar ou criar a categoria "Sem Categoria"
      if (productsCount > 0 && user.branchId) {
        // Tentar encontrar a categoria "Sem Categoria" na mesma filial
        const existingCategory = await tx.category.findFirst({
          where: {
            slug: 'sem-categoria',
            branchId: user.branchId,
          },
        });

        // Se não existir, criar
        if (!existingCategory) {
          const newCategory = await tx.category.create({
            data: {
              name: 'Sem Categoria',
              slug: 'sem-categoria',
              description:
                'Categoria padrão para produtos sem categoria definida',
              active: true,
              featured: false,
              branchId: user.branchId,
            },
          });
          uncategorizedCategory = {
            id: newCategory.id,
            name: newCategory.name,
          };
        } else {
          uncategorizedCategory = {
            id: existingCategory.id,
            name: existingCategory.name,
          };
        }

        // Mover todos os produtos para a categoria "Sem Categoria"
        if (uncategorizedCategory) {
          await tx.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: uncategorizedCategory.id },
          });
        }
      }

      // Deletar a categoria
      const deletedCategory = await tx.category.delete({
        where: { id },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {
        ...deletedCategory,
        movedProductsCount: productsCount,
        targetCategory: uncategorizedCategory,
      };
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

    return prisma.category.findMany({
      where: {
        branchId: user.branchId,
        active: true,
        featured: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }
}
