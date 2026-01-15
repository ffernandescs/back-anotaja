import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class BranchesService {
  async create(createBranchDto: CreateBranchDto, userId: string) {
    // Buscar usuário com sua empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.companyId)
      throw new ForbiddenException('Usuário não está associado a uma empresa');

    // Verificar se subdomain já existe (se fornecido)
    if (createBranchDto.subdomain) {
      const existingBranch = await prisma.branch.findUnique({
        where: { subdomain: createBranchDto.subdomain },
      });
      if (existingBranch)
        throw new ConflictException('Subdomínio já está em uso');
    }

    // Extrair dados de endereço do DTO
    const {
      address,
      city,
      state,
      zipCode,
      complement,
      neighborhood,
      reference,
      latitude,
      longitude,
      ...branchData
    } = createBranchDto;

    // Criar branch e endereço em transação
    const branch = await prisma.$transaction(async (prisma) => {
      if (!user.companyId)
        throw new ForbiddenException(
          'Usuário não está associado a uma empresa',
        );
      if (!address) throw new BadRequestException('Endereço é obrigatório');

      const createAddress = await prisma.companyAddress.create({
        data: {
          street: address,
          number: createBranchDto.number ?? '',
          complement,
          neighborhood,
          city,
          state,
          zipCode,
          isDefault: true,
          reference,
          lat: latitude,
          lng: longitude,
          companyId: user.companyId,
        },
      });
      // 1️⃣ Criar branch
      const createdBranch = await prisma.branch.create({
        data: {
          ...branchData,
          document: createBranchDto.document ?? '',
          phone: createBranchDto.phone,
          companyId: user.companyId,
          addressId: createAddress.id,
          paymentMethods: {
            connect: createBranchDto.paymentMethods?.map((pm) => ({
              id: pm.id,
            })),
          },
        },
      });

      // 2️⃣ Criar endereço da branch
      await prisma.branchAddress.create({
        data: {
          street: address,
          city,
          state,
          zipCode,
          number: createBranchDto.number ?? '',
          complement,
          neighborhood,
          reference,
          lat: latitude,
          lng: longitude,
          branchId: createdBranch.id,
          isDefault: true,
        },
      });

      // Retornar branch criada com endereço
      return prisma.branch.findUnique({
        where: { id: createdBranch.id },
        include: {
          address: true,
          company: { select: { id: true, name: true } },
        },
      });
    });

    return branch;
  }
  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    return prisma.branch.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: 'asc' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findCurrent(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true, branch: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: user.branchId,
        companyId: user.companyId,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    return branch;
  }

  async updateCurrent(userId: string, updateBranchDto: UpdateBranchDto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    // Verificar se subdomain já existe (se fornecido e diferente do atual)
    if (updateBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findFirst({
        where: {
          subdomain: updateBranchDto.subdomain,
          NOT: { id: user.branchId },
        },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    return prisma.branch.update({
      where: { id: user.branchId },
      data: {
        ...updateBranchDto,
        document: updateBranchDto.document ?? '',
        phone: updateBranchDto.phone,
        address: {
          update: {
            street: updateBranchDto.address ?? '',
            city: updateBranchDto.city ?? '',
            state: updateBranchDto.state ?? '',
            zipCode: updateBranchDto.zipCode ?? '',
          },
        },
        paymentMethods: {
          set: updateBranchDto.paymentMethods?.map((paymentMethod) => ({
            id: paymentMethod.id,
          })),
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true, orders: true },
    });

    if (!user || !user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Filia não encontrada');
    }

    return branch;
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, userId: string) {
    // Verificar se a branch pertence à empresa do usuário
    await this.findOne(id, userId);

    // Verificar se subdomain já existe (se fornecido e diferente do atual)
    if (updateBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findFirst({
        where: {
          subdomain: updateBranchDto.subdomain,
          NOT: { id },
        },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    return prisma.branch.update({
      where: { id },
      data: {
        ...updateBranchDto,
        document: updateBranchDto.document ?? '',
        phone: updateBranchDto.phone,
        address: {
          update: {
            street: updateBranchDto.address ?? '',
            city: updateBranchDto.city ?? '',
            state: updateBranchDto.state ?? '',
            zipCode: updateBranchDto.zipCode ?? '',
          },
        },
        paymentMethods: {
          set: updateBranchDto.paymentMethods?.map((paymentMethod) => ({
            id: paymentMethod.id,
          })),
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Verificar se a branch pertence à empresa do usuário
    await this.findOne(id, userId);

    return prisma.branch.delete({
      where: { id },
    });
  }
}
