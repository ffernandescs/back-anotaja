import { Injectable } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../../lib/prisma';

export class UpsertProductMappingDto {
  @IsString()
  ifoodExternalCode!: string;

  @IsString()
  ifoodItemName!: string;

  @IsOptional()
  @IsString()
  localProductId?: string | null;

  @IsOptional()
  @IsString()
  localOptionId?: string | null;

  @IsBoolean()
  isOption!: boolean;
}

@Injectable()
export class IfoodProductMappingService {
  async listMappings(branchId: string) {
    return prisma.ifoodProductMapping.findMany({
      where: { branchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getUnmappedItems(branchId: string) {
    return prisma.ifoodProductMapping.findMany({
      where: { branchId, localProductId: null, isOption: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertMapping(branchId: string, dto: UpsertProductMappingDto) {
    return prisma.ifoodProductMapping.upsert({
      where: {
        branchId_ifoodExternalCode: {
          branchId,
          ifoodExternalCode: dto.ifoodExternalCode,
        },
      },
      create: {
        id: uuidv4(),
        branchId,
        ifoodExternalCode: dto.ifoodExternalCode,
        ifoodItemName: dto.ifoodItemName,
        localProductId: dto.localProductId ?? null,
        localOptionId: dto.localOptionId ?? null,
        isOption: dto.isOption,
      },
      update: {
        ifoodItemName: dto.ifoodItemName,
        localProductId: dto.localProductId ?? null,
        localOptionId: dto.localOptionId ?? null,
        isOption: dto.isOption,
      },
    });
  }

  async deleteMapping(branchId: string, ifoodExternalCode: string) {
    return prisma.ifoodProductMapping.deleteMany({
      where: { branchId, ifoodExternalCode },
    });
  }
}
