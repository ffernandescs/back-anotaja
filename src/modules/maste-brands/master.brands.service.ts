import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

export interface CreateBrandDto {
  name: string;
  appName?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  isDefault?: boolean;
}

export type UpdateBrandDto = Partial<CreateBrandDto>;

@Injectable()
export class MasterBrandService {
  // ─── List ────────────────────────────────────────────────────────────────────

  async findAll(masterUserId: string) {
    const brands = await prisma.masterBrand.findMany({
      where: { masterUserId },
      orderBy: [
        { isDefault: 'desc' }, // padrão sempre primeiro
        { createdAt: 'asc' },
      ],
    });
    return brands;
  }

  // ─── Single ──────────────────────────────────────────────────────────────────

  async findOne(id: string, masterUserId: string) {
    const brand = await prisma.masterBrand.findFirst({
      where: { id, masterUserId },
    });
    if (!brand) throw new NotFoundException('Brand não encontrado');
    return brand;
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(masterUserId: string, dto: CreateBrandDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Nome do brand é obrigatório');
    }

    // Se isDefault=true, remove o flag dos outros brands deste master
    if (dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    // Se for o primeiro brand, define como padrão automaticamente
    const count = await prisma.masterBrand.count({ where: { masterUserId } });
    const isDefault = dto.isDefault ?? count === 0;

    if (isDefault && !dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    const brand = await prisma.masterBrand.create({
      data: {
        masterUserId,
        name: dto.name.trim(),
        appName: dto.appName ?? null,
        logoLightUrl: dto.logoLightUrl ?? null,
        logoDarkUrl: dto.logoDarkUrl ?? null,
        faviconUrl: dto.faviconUrl ?? null,
        primaryColor: dto.primaryColor ?? null,
        secondaryColor: dto.secondaryColor ?? null,
        accentColor: dto.accentColor ?? null,
        isDefault,
      },
    });

    return brand;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, masterUserId: string, dto: UpdateBrandDto) {
    await this.findOne(id, masterUserId); // garante que existe e pertence ao master

    if (dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    const brand = await prisma.masterBrand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.appName !== undefined && { appName: dto.appName }),
        ...(dto.logoLightUrl !== undefined && { logoLightUrl: dto.logoLightUrl }),
        ...(dto.logoDarkUrl !== undefined && { logoDarkUrl: dto.logoDarkUrl }),
        ...(dto.faviconUrl !== undefined && { faviconUrl: dto.faviconUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
        ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });

    return brand;
  }

  // ─── Set Default ─────────────────────────────────────────────────────────────

  async setDefault(id: string, masterUserId: string) {
    await this.findOne(id, masterUserId);

    // Remove default de todos e aplica só neste
    await this.clearDefault(masterUserId);

    const brand = await prisma.masterBrand.update({
      where: { id },
      data: { isDefault: true },
    });

    return brand;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async remove(id: string, masterUserId: string) {
    const brand = await this.findOne(id, masterUserId);

    await prisma.masterBrand.delete({ where: { id } });

    // Se era o padrão, promove o mais antigo
    if (brand.isDefault) {
      const next = await prisma.masterBrand.findFirst({
        where: { masterUserId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.masterBrand.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return { deleted: true, id };
  }

  // ─── Default brand (public) ──────────────────────────────────────────────────

  async getDefaultBrand(masterUserId: string) {
    const brand = await prisma.masterBrand.findFirst({
      where: { masterUserId, isDefault: true },
    });

    if (!brand) {
      // Fallback: retorna o mais recente
      return prisma.masterBrand.findFirst({
        where: { masterUserId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return brand;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async clearDefault(masterUserId: string) {
    await prisma.masterBrand.updateMany({
      where: { masterUserId, isDefault: true },
      data: { isDefault: false },
    });
  }
}