import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateComplementOptionDto } from './dto/create-complement-option.dto';
import { UpdateComplementOptionDto } from './dto/update-complement-option.dto';
import { prisma } from '../../../lib/prisma';
import { ComplementOption, Prisma, ProductComplement } from 'generated/prisma';
import { ComplementOptionResponseDto } from './dto/complement-option-response.dto';

@Injectable()
export class ComplementOptionsService {
  async create(
    userId: string,
    dto: CreateComplementOptionDto,
  ): Promise<ComplementOptionResponseDto> {
    // 1️⃣ Valida usuário + branch
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branch) {
      throw new NotFoundException('Usuário ou filial não encontrada');
    }

    const branchId = user.branch.id;

    // 2️⃣ Valida complemento (se informado)
    let complement: { id: string; name: string } | undefined;

    if (dto.complementId) {
      const complementExists = await prisma.productComplement.findFirst({
        where: {
          id: dto.complementId,
          branchId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!complementExists) {
        throw new BadRequestException(
          'Complemento não existe ou não pertence à filial',
        );
      }

      complement = complementExists;
    }

    // 3️⃣ Cria option
    const option = await prisma.complementOption.create({
      data: {
        name: dto.name,
        price: dto.price ?? 0,
        active: dto.active ?? true,
        stockControlEnabled: dto.stockControlEnabled ?? false,
        minStock: dto.minStock,
        displayOrder: dto.displayOrder,
        complementId: dto.complementId,
        branchId,
      },
    });

    // 4️⃣ Retorno FINAL alinhado com DTO
    return {
      id: option.id,
      name: option.name,
      price: option.price,
      active: option.active,
      displayOrder: option.displayOrder,
      branchId: option.branchId,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
      stockControlEnabled: option.stockControlEnabled,
      minStock: option.minStock,
      complementId: option.complementId,
      complement,
    };
  }

  async findAll(
    userId: string,
    complementId?: string,
    active?: boolean | string,
  ): Promise<ComplementOptionResponseDto[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const where: Prisma.ComplementOptionWhereInput = {
      branchId: user.branchId,
    };

    // 🔹 Filtra por complemento SOMENTE se vier no parâmetro
    if (complementId) {
      const complement = await prisma.productComplement.findFirst({
        where: {
          id: complementId,
          branchId: user.branchId,
        },
      });

      if (!complement)
        throw new NotFoundException('Complemento não encontrado');

      where.complementId = complementId;
    }

    // 🔹 Filtro active
    if (active !== undefined) {
      where.active = typeof active === 'boolean' ? active : active === 'true';
    }

    const options = await prisma.complementOption.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        complement: true,
      },
    });

    return options.map((opt) => ({
      ...opt,
      complement: opt.complement
        ? {
            id: opt.complement.id,
            name: opt.complement.name,
            active: opt.complement.active,
            displayOrder: opt.complement.displayOrder,
            createdAt: opt.complement.createdAt,
            updatedAt: opt.complement.updatedAt,
            minOptions: opt.complement.minOptions,
            maxOptions: opt.complement.maxOptions,
            required: opt.complement.required,
            allowRepeat: opt.complement.allowRepeat,
            productId: opt.complement.productId,
            branchId: opt.complement.branchId,
            selectionType: opt.complement.selectionType,
          }
        : undefined,
    }));
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<ComplementOption & { complement?: ProductComplement }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const option = await prisma.complementOption.findUnique({
      where: { id },
      include: {
        complement: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!option) throw new NotFoundException('Opção não encontrada');
    if (option.complement && option.complement.branchId !== user.branchId)
      throw new ForbiddenException('A opção não pertence à sua filial');

    // mapear complement para o tipo correto
    return {
      ...option,
      complement: option.complement
        ? {
            id: option.complement.id,
            name: option.complement.name,
            active: option.complement.active,
            displayOrder: option.complement.displayOrder,
            createdAt: option.complement.createdAt,
            updatedAt: option.complement.updatedAt,
            minOptions: option.complement.minOptions,
            maxOptions: option.complement.maxOptions,
            required: option.complement.required,
            allowRepeat: option.complement.allowRepeat,
            productId: option.complement.productId,
            branchId: option.complement.branchId,
            selectionType: option.complement.selectionType,
          }
        : undefined,
    };
  }

  async update(
    id: string,
    updateComplementOptionDto: UpdateComplementOptionDto,
    userId: string,
  ): Promise<ComplementOption & { complement?: ProductComplement }> {
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    if (updateComplementOptionDto.complementId) {
      const complement = await prisma.productComplement.findUnique({
        where: { id: updateComplementOptionDto.complementId },
      });
      if (!complement)
        throw new NotFoundException('Complemento não encontrado');
      if (complement.branchId !== user.branchId)
        throw new ForbiddenException('O complemento não pertence à sua filial');
    }

    const updatedOption = await prisma.complementOption.update({
      where: { id },
      data: updateComplementOptionDto,
      include: {
        complement: {
          include: {
            product: true,
          },
        },
      },
    });

    // mapear para o tipo esperado
    return {
      ...updatedOption,
      complement: updatedOption.complement
        ? { ...updatedOption.complement }
        : undefined,
    };
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<ComplementOption & { complement?: { id: string; name: string } }> {
    await this.findOne(id, userId);

    const deletedOption = await prisma.complementOption.delete({
      where: { id },
      include: {
        complement: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ...deletedOption,
      complement: deletedOption.complement ?? undefined,
    };
  }
}
