import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateComplementOptionDto } from './dto/create-complement-option.dto';
import { UpdateComplementOptionDto } from './dto/update-complement-option.dto';
import { prisma } from '../../../lib/prisma';
import { ComplementOption, Prisma, ProductComplement } from '@prisma/client';
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
    const data: Prisma.ComplementOptionCreateInput = {
      name: dto.name,
      price: dto.price ?? 0,
      active: dto.active ?? true,
      stockControlEnabled: dto.stockControlEnabled ?? false,
      minStock: dto.minStock ?? null,
      displayOrder: dto.displayOrder ?? null,
      branch: {
        connect: { id: branchId },
      },
    };

    // 👇 só conecta se existir
    if (dto.complementId) {
      data.complement = {
        connect: [{ id: dto.complementId }], // array ✔️
      };
    }

    const option = await prisma.complementOption.create({
      data,
      include: {
        complement: true,
      },
    });

    // 4️⃣ Retorno FINAL alinhado com DTO
    return option;
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

    return options;
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<ComplementOption > {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    const option = await prisma.complementOption.findUnique({
      where: { id, branchId:user.branchId },
      include: {
        complement: {
          include: {
            product: true,
          },
        },
      },
    });

    console.log(option,'option')

    if (!option) throw new NotFoundException('Opção não encontrada');
    

    // mapear complement para o tipo correto
    return option;
  }

  async update(
    id: string,
    updateComplementOptionDto: UpdateComplementOptionDto & {
      complementIds?: string[];
    },
    userId: string,
  ): Promise<ComplementOption & { complements?: ProductComplement[] }> {
    // Verifica se a opção existe e se pertence ao usuário
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Se vier complementIds, verifica cada complemento
    if (updateComplementOptionDto.complementIds) {
      for (const complementId of updateComplementOptionDto.complementIds) {
        const complement = await prisma.productComplement.findUnique({
          where: { id: complementId },
        });
        if (!complement)
          throw new NotFoundException(
            `Complemento ${complementId} não encontrado`,
          );
        if (complement.branchId !== user.branchId)
          throw new ForbiddenException(
            `O complemento ${complementId} não pertence à sua filial`,
          );
      }
    }

    // Se for atualizar outras propriedades da opção
    const { complementIds, ...dataToUpdate } = updateComplementOptionDto;

    const updatedOption = await prisma.complementOption.update({
      where: { id },
      data: {
        ...dataToUpdate,
        // Atualiza as relações N:N
        complement: {
          connect: complementIds?.map((id) => ({ id })),
        },
      },
      include: {
        complement: {
          include: {
            product: true,
          },
        },
      },
    });

    return updatedOption;
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<ComplementOption & { complement?: { id: string; name: string } }> {
    await this.findOne(id, userId);

    const deletedOption = await prisma.complementOption.delete({
      where: { id },
    });

    return deletedOption;
  }
}
