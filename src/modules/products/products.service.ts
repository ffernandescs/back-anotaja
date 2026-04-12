import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import { UpdateProductAdvancedOptionsDto } from './dto/update-product-advanced-options.dto';
import { UpsertRelatedProductsDto } from './dto/upsert-related-products.dto';

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

    if (!user.companyId) {
      throw new ForbiddenException('A categoria não pertence à sua empresa');
    }

    if (category.branchId !== user.branchId) {
      throw new ForbiddenException('A categoria não pertence à sua filial');
    }

    // Criar o produto
    const product = await prisma.product.create({
      data: {
        ...createProductDto,
        branchId: user.branchId, // Sempre usar branchId do usuário logado
        companyId: user.companyId, // Sempre usar companyId do usuário logado
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
            branchName: true,
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
        relatedProducts:true,
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
            branchName: true,
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
        relatedProducts:true,
        stockMovements: true
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Calcular estoque atual baseado nos movimentos
    const currentStock = product.stockMovements.reduce((total, movement) => {
      if (movement.type === 'ENTRADA') {
        return total + movement.quantity;
      } else if (movement.type === 'SAIDA') {
        return total - movement.quantity;
      }
      return total;
    }, 0);

    return {
      ...product,
      currentStock,
    };
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

    const product = await prisma.product.update({
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
            branchName: true,
          },
        },
        stockMovements:true
      },
    });

    const currentStock = product.stockMovements.reduce((total, movement) => {
      if (movement.type === 'ENTRADA') {
        return total + movement.quantity;
      } else if (movement.type === 'SAIDA') {
        return total - movement.quantity;
      }
      return total;
    }, 0);

    return {
      ...product,
      currentStock,
    };
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
        branch: { select: { id: true, branchName: true } },
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

  async importCatalog(sourceBranchId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    if (!user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    // Verificar se a filial de origem existe e pertence à mesma empresa
    const sourceBranch = await prisma.branch.findUnique({
      where: { id: sourceBranchId },
    });

    if (!sourceBranch) {
      throw new NotFoundException('Filial de origem não encontrada');
    }

    if (sourceBranch.companyId !== user.companyId) {
      throw new ForbiddenException('A filial de origem não pertence à sua empresa');
    }

    if (sourceBranch.id === user.branchId) {
      throw new ForbiddenException('Não é possível importar da mesma filial');
    }

    // Buscar categorias e produtos da filial de origem
    const sourceCategories = await prisma.category.findMany({
      where: { 
        branchId: sourceBranchId,
        active: true 
      },
      orderBy: { createdAt: 'asc' },
    });

    const sourceProducts = await prisma.product.findMany({
      where: { 
        branchId: sourceBranchId,
        active: true 
      },
      include: {
        complements: {
          include: {
            options: true,
          },
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const result = await prisma.$transaction(async (prisma) => {
      let importedCategories = 0;
      let importedProducts = 0;
      const categoryMapping = new Map<string, string>(); // sourceId -> targetId

      // Importar categorias
      for (const sourceCategory of sourceCategories) {
        // Verificar se já existe uma categoria com o mesmo nome na filial de destino
        const existingCategory = await prisma.category.findFirst({
          where: {
            branchId: user.branchId!,
            name: sourceCategory.name,
          },
        });

        if (!existingCategory) {
          const newCategory = await prisma.category.create({
            data: {
              name: sourceCategory.name,
              slug: sourceCategory.slug,
              description: sourceCategory.description || null,
              image: sourceCategory.image || null,
              active: sourceCategory.active,
              featured: sourceCategory.featured,
              branchId: user.branchId!,
            },
          });
          categoryMapping.set(sourceCategory.id, newCategory.id);
          importedCategories++;
        } else {
          categoryMapping.set(sourceCategory.id, existingCategory.id);
        }
      }

      // Importar produtos
      for (const sourceProduct of sourceProducts) {
        const targetCategoryId = categoryMapping.get(sourceProduct.categoryId);
        
        if (!targetCategoryId) {
          console.warn(`Categoria não encontrada para o produto ${sourceProduct.name}, pulando...`);
          continue;
        }

        // Verificar se já existe um produto com o mesmo nome na categoria de destino
        const existingProduct = await prisma.product.findFirst({
          where: {
            branchId: user.branchId!,
            categoryId: targetCategoryId,
            name: sourceProduct.name,
          },
        });

        if (!existingProduct) {
          const newProduct = await prisma.product.create({
            data: {
              name: sourceProduct.name,
              description: sourceProduct.description,
              price: sourceProduct.price,
              image: sourceProduct.image,
              active: sourceProduct.active,
              featured: sourceProduct.featured,
              hasPromotion: sourceProduct.hasPromotion,
              promotionalPrice: sourceProduct.promotionalPrice,
              promotionalType: sourceProduct.promotionalType,
              promotionalPeriodType: sourceProduct.promotionalPeriodType,
              promotionalStartDate: sourceProduct.promotionalStartDate,
              promotionalEndDate: sourceProduct.promotionalEndDate,
              promotionalDays: sourceProduct.promotionalDays,
              weight: sourceProduct.weight,
              preparationTime: sourceProduct.preparationTime,
              stockControlEnabled: sourceProduct.stockControlEnabled,
              minStock: sourceProduct.minStock,
              tags: sourceProduct.tags,
              filterMetadata: sourceProduct.filterMetadata,
              displayOrder: sourceProduct.displayOrder,
              installmentEnabled: sourceProduct.installmentEnabled,
              maxInstallments: sourceProduct.maxInstallments,
              minInstallmentValue: sourceProduct.minInstallmentValue,
              installmentInterestRate: sourceProduct.installmentInterestRate,
              installmentOnPromotionalPrice: sourceProduct.installmentOnPromotionalPrice,
              categoryId: targetCategoryId,
              branchId: user.branchId!,
              companyId: user.companyId!,
            },
          });

          // Importar complementos se existirem
          if (sourceProduct.complements && sourceProduct.complements.length > 0) {
            for (const sourceComplement of sourceProduct.complements) {
              // Criar o complemento na filial de destino
              const newComplement = await prisma.productComplement.create({
                data: {
                  name: sourceComplement.name,
                  minOptions: sourceComplement.minOptions,
                  maxOptions: sourceComplement.maxOptions,
                  required: sourceComplement.required,
                  allowRepeat: sourceComplement.allowRepeat,
                  active: sourceComplement.active,
                  displayOrder: sourceComplement.displayOrder,
                  selectionType: sourceComplement.selectionType,
                  productId: newProduct.id,
                  branchId: user.branchId!,
                },
              });

              // Importar opções do complemento
              if (sourceComplement.options && sourceComplement.options.length > 0) {
                for (const sourceOption of sourceComplement.options) {
                  await prisma.complementOption.create({
                    data: {
                      name: sourceOption.name,
                      price: sourceOption.price,
                      active: sourceOption.active,
                      stockControlEnabled: sourceOption.stockControlEnabled,
                      minStock: sourceOption.minStock,
                      displayOrder: sourceOption.displayOrder,
                      branchId: user.branchId!,
                    },
                  });
                }
              }
            }
          }

          importedProducts++;
        }
      }

      return {
        importedCategories,
        importedProducts,
        totalCategories: sourceCategories.length,
        totalProducts: sourceProducts.length,
      };
    });

    return result;
  }

  async getRelatedProducts(productId: string, userId: string) {
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

    // Validar que o produto pertence à filial do usuário
    const product = await prisma.product.findUnique({
      where: {
        id: productId,
        branchId: user.branchId,
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Buscar produtos relacionados com dados do produto relacionado
    const relatedProducts = await prisma.productRelated.findMany({
      where: { productId },
      orderBy: { priority: 'asc' },
      include: {
        relatedProduct: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            active: true,
          },
        },
      },
    });

    return relatedProducts;
  }

  async upsertRelatedProducts(
    productId: string,
    dto: UpsertRelatedProductsDto,
    userId: string,
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

    // Validar que o produto existe e pertence à filial do usuário
    const product = await prisma.product.findUnique({
      where: {
        id: productId,
        branchId: user.branchId,
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Validar que nenhum produto relacionado é o mesmo que o produto principal
    for (const item of dto.relatedProducts) {
      if (item.relatedProductId === productId) {
        throw new BadRequestException(
          'Um produto não pode ser relacionado a si mesmo',
        );
      }
    }

    // Validar que todos os produtos relacionados existem e pertencem à mesma filial
    if (dto.relatedProducts.length > 0) {
      const relatedProductIds = dto.relatedProducts.map(
        (item) => item.relatedProductId,
      );

      const foundProducts = await prisma.product.findMany({
        where: {
          id: { in: relatedProductIds },
          branchId: user.branchId,
        },
      });

      if (foundProducts.length !== relatedProductIds.length) {
        throw new BadRequestException(
          'Um ou mais produtos relacionados não encontrados ou não pertencem à sua filial',
        );
      }
    }

    // Executar em transação: deletar todos os relacionados antigos e criar os novos
    const result = await prisma.$transaction(async (tx) => {
      // Deletar todos os relacionamentos anteriores
      await tx.productRelated.deleteMany({
        where: { productId },
      });

      // Criar novos relacionamentos com priority reindexada
      if (dto.relatedProducts.length > 0) {
        const newRelatedProducts = dto.relatedProducts.map((item, index) => ({
          productId,
          relatedProductId: item.relatedProductId,
          priority: index,
        }));

        await tx.productRelated.createMany({
          data: newRelatedProducts,
        });
      }

      // Retornar a lista atualizada
      return await tx.productRelated.findMany({
        where: { productId },
        orderBy: { priority: 'asc' },
        include: {
          relatedProduct: {
            select: {
              id: true,
              name: true,
              price: true,
              image: true,
              active: true,
            },
          },
        },
      });
    });

    return result;
  }
}
