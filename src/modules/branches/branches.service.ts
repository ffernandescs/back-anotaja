import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { prisma } from 'lib/prisma';

@Injectable()
export class BranchesService {
  async create(createBranchDto: CreateBranchDto, userId: string) {
    // Buscar usuário com sua empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    // Verificar se subdomain já existe (se fornecido)
    if (createBranchDto.subdomain) {
      const existingBranch = (await prisma.branch.findUnique({
        where: { subdomain: createBranchDto.subdomain },
      })) as { id: string } | null;

      if (existingBranch) {
        throw new ConflictException('Subdomínio já está em uso');
      }
    }

    // Criar a branch
    const branch = await prisma.branch.create({
      data: {
        ...createBranchDto,
        document: createBranchDto.document || '',
        companyId: user.companyId,
        paymentMethods: {
          connect: createBranchDto.paymentMethods?.map((paymentMethod) => ({
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
