import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateComplementDto,
  SelectionTypeDto,
} from './dto/create-complement.dto';
import { UpdateComplementDto } from './dto/update-complement.dto';
import { CreateComplementOptionDto } from './dto/create-complement-option.dto';
import { UpdateComplementOptionDto } from './dto/update-complement-option.dto';
import { AssociateComplementsDto } from './dto/associate-complements.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';

@Injectable()
export class ComplementsService {
  async create(createComplementDto: CreateComplementDto, userId: string) {
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

    // Verificar se o produto existe e pertence à mesma filial
    if (createComplementDto.productId) {
      const product = await prisma.product.findUnique({
        where: { id: createComplementDto.productId },
      });

      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }

      if (product.branchId !== user.branchId) {
        throw new ForbiddenException('O produto não pertence à sua filial');
      }
    }

    if (createComplementDto.options?.length) {
      const optionIds = createComplementDto.options.map((o) => o.id);

      const validOptions = await prisma.complementOption.findMany({
        where: {
          id: { in: optionIds },
          branchId: user.branchId,
          active: true,
        },
        select: { id: true },
      });

      if (validOptions.length !== optionIds.length) {
        throw new ForbiddenException(
          'Uma ou mais opções não pertencem à sua filial ou estão inativas',
        );
      }
    }

    // Criar o complemento com suas opções
    const complement = await prisma.productComplement.create({
      data: {
        name: createComplementDto.name,
        selectionType:
          createComplementDto.selectionType ?? SelectionTypeDto.SINGLE,
        minOptions: createComplementDto.minOptions ?? 0,
        maxOptions: createComplementDto.maxOptions ?? 1,
        required: createComplementDto.required ?? false,
        allowRepeat: createComplementDto.allowRepeat ?? false,
        active: createComplementDto.active ?? true,
        displayOrder: createComplementDto.displayOrder ?? null,
        productId: createComplementDto.productId ?? null,
        branchId: user.branchId, // Sempre usar branchId do usuário logado
        options: createComplementDto.options
          ? {
              connect: createComplementDto.options.map((option) => ({
                id: option.id, // 👈 SOMENTE ISSO
              })),
            }
          : undefined,
      },

      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        options: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return complement;
  }

  async findAll(userId: string, productId?: string, active?: boolean | string) {
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

    // Tipar corretamente o filtro usando Prisma.ProductComplementWhereInput
    const where: Prisma.ProductComplementWhereInput = {
      branchId: user.branchId,
    };

    // Filtro por produto
    if (productId) {
      where.productId = productId;
    }

    // Filtro por complementos ativos
    if (active !== undefined) {
      const isActive = typeof active === 'boolean' ? active : active === 'true';
      where.active = isActive;
    }

    return prisma.productComplement.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        options: {
          where: {
            active: true,
          },
          orderBy: { displayOrder: 'asc' },
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

    const complement = await prisma.productComplement.findUnique({
      where: {
        id,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        options: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!complement) {
      throw new NotFoundException('Complemento não encontrado');
    }

    return complement;
  }

  async update(
    id: string,
    updateComplementDto: UpdateComplementDto,
    userId: string,
  ) {
    // Verificar se o complemento existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Se estiver atualizando o produto, verificar se pertence à mesma filial
    if (updateComplementDto.productId) {
      const product = await prisma.product.findUnique({
        where: { id: updateComplementDto.productId },
      });

      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }

      if (product.branchId !== user.branchId) {
        throw new ForbiddenException('O produto não pertence à sua filial');
      }
    }

    // Remover options do update (opções são gerenciadas separadamente)

    const { options, ...updateData } = updateComplementDto;

    return prisma.productComplement.update({
      where: { id },
      data: updateData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        options: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Verificar se o complemento existe e se o usuário tem permissão
    await this.findOne(id, userId);

    return prisma.productComplement.delete({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // Métodos para gerenciar opções do complemento
  async addOption(
    complementId: string,
    createOptionDto: CreateComplementOptionDto,
    userId: string,
  ) {
    // Verificar se o complemento existe e se o usuário tem permissão
    await this.findOne(complementId, userId);

    return prisma.complementOption.create({
      data: {
        ...createOptionDto,
        branchId: userId,
        complementId,
        price: createOptionDto.price ?? 0,
        active: createOptionDto.active ?? true,
        stockControlEnabled: createOptionDto.stockControlEnabled ?? false,
      },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async updateOption(
    complementId: string,
    optionId: string,
    updateOptionDto: UpdateComplementOptionDto,
    userId: string,
  ) {
    // Verificar se o complemento existe e se o usuário tem permissão
    await this.findOne(complementId, userId);

    // Verificar se a opção existe e pertence ao complemento
    const option = await prisma.complementOption.findUnique({
      where: { id: optionId },
    });

    if (!option || option.complementId !== complementId) {
      throw new NotFoundException('Opção não encontrada');
    }

    return prisma.complementOption.update({
      where: { id: optionId },
      data: updateOptionDto,
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async associateComplementsToProduct(
    productId: string,
    associateDto: AssociateComplementsDto,
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

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    if (product.branchId !== user.branchId) {
      throw new ForbiddenException(
        'Você não tem permissão para associar complementos a este produto',
      );
    }

    // 🔹 Verifica complementos enviados
    const complements = await prisma.productComplement.findMany({
      where: {
        id: { in: associateDto.complementIds },
        branchId: user.branchId,
      },
    });

    if (complements.length !== associateDto.complementIds.length) {
      throw new BadRequestException(
        'Um ou mais complementos não foram encontrados ou não pertencem à sua filial',
      );
    }

    // 🔥 TRANSAÇÃO = consistência garantida
    await prisma.$transaction([
      // 1️⃣ Remove TODOS os complementos atuais do produto
      prisma.productComplement.updateMany({
        where: {
          productId: productId,
        },
        data: {
          productId: null,
          active: false,
        },
      }),

      // 2️⃣ Associa apenas os novos
      prisma.productComplement.updateMany({
        where: {
          id: { in: associateDto.complementIds },
        },
        data: {
          productId: productId,
          active: true,
        },
      }),
    ]);

    // 3️⃣ Retorna somente os complementos finais
    return prisma.productComplement.findMany({
      where: {
        id: { in: associateDto.complementIds },
      },
      include: {
        options: {
          where: { active: true },
        },
      },
    });
  }

  async removeOption(complementId: string, optionId: string, userId: string) {
    // Verificar se o complemento existe e se o usuário tem permissão
    await this.findOne(complementId, userId);

    // Verificar se a opção existe e pertence ao complemento
    const option = await prisma.complementOption.findUnique({
      where: { id: optionId },
    });

    if (!option || option.complementId !== complementId) {
      throw new NotFoundException('Opção não encontrada');
    }

    return prisma.complementOption.delete({
      where: { id: optionId },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // Métodos para gerenciar opções diretamente (sem precisar do complementId)
  async createOption(
    createOptionDto: CreateComplementOptionDto,
    userId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar se o complemento existe e pertence à filial do usuário
    const complement = await prisma.productComplement.findUnique({
      where: { id: createOptionDto.complementId },
    });

    if (!complement) {
      throw new NotFoundException('Complemento não encontrado');
    }

    if (complement.branchId !== user.branchId) {
      throw new ForbiddenException('Complemento não pertence à sua filial');
    }

    return prisma.complementOption.create({
      data: {
        ...createOptionDto,
        branchId: user.branchId,
        price: createOptionDto.price ?? 0,
        active: createOptionDto.active ?? true,
        stockControlEnabled: createOptionDto.stockControlEnabled ?? false,
      },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAllOptions(
    userId: string,
    complementId?: string,
    active?: boolean,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      return { options: [] };
    }

    // Tipando corretamente o filtro
    const where: Prisma.ComplementOptionWhereInput = {};

    if (complementId) {
      where.complement = {
        is: {
          id: complementId,
          branchId: user.branchId,
        },
      };
    } else {
      where.complement = {
        is: {
          branchId: user.branchId,
        },
      };
    }

    if (active !== undefined) {
      where.active = active;
    }

    const options = await prisma.complementOption.findMany({
      where,
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    return { options };
  }

  async findOneOption(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const option = await prisma.complementOption.findUnique({
      where: { id },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
            branchId: true,
          },
        },
      },
    });

    if (!option) {
      throw new NotFoundException('Opção não encontrada');
    }

    if (!option.complement || option.complement.branchId !== user.branchId) {
      throw new ForbiddenException('Opção não pertence à sua filial');
    }

    return { option };
  }

  async updateOptionById(
    id: string,
    updateOptionDto: UpdateComplementOptionDto,
    userId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const option = await prisma.complementOption.findUnique({
      where: { id },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
            branchId: true,
          },
        },
      },
    });

    if (!option) {
      throw new NotFoundException('Opção não encontrada');
    }

    if (!option.complement || option.complement.branchId !== user.branchId) {
      throw new ForbiddenException('Opção não pertence à sua filial');
    }

    const updated = await prisma.complementOption.update({
      where: { id },
      data: updateOptionDto,
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { option: updated };
  }

  async removeOptionById(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const option = await prisma.complementOption.findUnique({
      where: { id },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
            branchId: true,
          },
        },
      },
    });

    if (!option) {
      throw new NotFoundException('Opção não encontrada');
    }

    if (!option.complement || option.complement.branchId !== user.branchId) {
      throw new ForbiddenException('Opção não pertence à sua filial');
    }

    await prisma.complementOption.delete({
      where: { id },
    });

    return { message: 'Opção deletada com sucesso' };
  }
}
