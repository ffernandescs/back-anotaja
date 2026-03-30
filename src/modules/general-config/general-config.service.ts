import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateGeneralConfigDto, UpdateGeneralConfigDto } from './dto/general-config.dto';

@Injectable()
export class GeneralConfigService {
  async findByBranchId(branchId: string) {
    return prisma.generalConfig.findUnique({
      where: { branchId },
    });
  }

  async create(branchId: string, data: CreateGeneralConfigDto) {
    // Verificar se já existe configuração para esta filial
    const existing = await this.findByBranchId(branchId);
    if (existing) {
      throw new Error('General config already exists for this branch');
    }

    return prisma.generalConfig.create({
      data: {
        ...data,
        branchId,
      },
    });
  }

  async update(branchId: string, data: UpdateGeneralConfigDto) {
    // Verificar se existe configuração para esta filial
    const existing = await this.findByBranchId(branchId);
    if (!existing) {
      // Se não existe, criar uma nova
      return this.create(branchId, data);
    }

    return prisma.generalConfig.update({
      where: { branchId },
      data,
    });
  }

  async upsert(branchId: string, data: UpdateGeneralConfigDto) {
    return prisma.generalConfig.upsert({
      where: { branchId },
      update: data,
      create: {
        ...data,
        branchId,
      },
    });
  }

  async delete(branchId: string) {
    const existing = await this.findByBranchId(branchId);
    if (!existing) {
      throw new NotFoundException('General config not found for this branch');
    }

    return prisma.generalConfig.delete({
      where: { branchId },
    });
  }
}
