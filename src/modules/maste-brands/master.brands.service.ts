import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateBrandDto {
  name: string;
  appName?: string;
  /** Host canônico (ex. app.revenda.com). Opcional; vazio remove vínculo em update */
  domain?: string | null;
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

  // ─── Resolução pública por host (white-label / multi-domínio) ───────────────

  async resolvePublicByHost(rawHost: string) {
    const host = this.normalizeLookupHost(rawHost);
    if (!host) {
      throw new BadRequestException('Informe o parâmetro host (ex.: app.revenda.com)');
    }

    const brand = await prisma.masterBrand.findFirst({
      where: { domain: host },
      select: {
        id: true,
        name: true,
        appName: true,
        domain: true,
        logoLightUrl: true,
        logoDarkUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        updatedAt: true,
      },
    });

    if (!brand) {
      throw new NotFoundException('Nenhuma marca configurada para este domínio');
    }

    return brand;
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(masterUserId: string, dto: CreateBrandDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Nome do brand é obrigatório');
    }

    if (dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    const count = await prisma.masterBrand.count({ where: { masterUserId } });
    const isDefault = dto.isDefault ?? count === 0;

    if (isDefault && !dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    const domain = this.resolveDomainValueForWrite(dto.domain);

    return this.withUniqueDomain(() =>
      prisma.masterBrand.create({
        data: {
          masterUserId,
          name: dto.name.trim(),
          appName: dto.appName ?? null,
          domain,
          logoLightUrl: dto.logoLightUrl ?? null,
          logoDarkUrl: dto.logoDarkUrl ?? null,
          faviconUrl: dto.faviconUrl ?? null,
          primaryColor: dto.primaryColor ?? null,
          secondaryColor: dto.secondaryColor ?? null,
          accentColor: dto.accentColor ?? null,
          isDefault,
        },
      }),
    );
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, masterUserId: string, dto: UpdateBrandDto) {
    await this.findOne(id, masterUserId);

    if (dto.isDefault) {
      await this.clearDefault(masterUserId);
    }

    const domainPatch = this.resolveDomainPatchForUpdate(dto.domain);

    return this.withUniqueDomain(() =>
      prisma.masterBrand.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.appName !== undefined && { appName: dto.appName }),
          ...(domainPatch !== undefined && { domain: domainPatch }),
          ...(dto.logoLightUrl !== undefined && { logoLightUrl: dto.logoLightUrl }),
          ...(dto.logoDarkUrl !== undefined && { logoDarkUrl: dto.logoDarkUrl }),
          ...(dto.faviconUrl !== undefined && { faviconUrl: dto.faviconUrl }),
          ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
          ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
          ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      }),
    );
  }

  // ─── Set Default ─────────────────────────────────────────────────────────────

  async setDefault(id: string, masterUserId: string) {
    await this.findOne(id, masterUserId);

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

  /** Lookup: normaliza host sem lançar (string vazia = inválido) */
  private normalizeLookupHost(raw: string): string {
    const s = raw?.trim();
    if (!s) return '';
    try {
      return this.normalizeDomainOrThrow(s);
    } catch {
      return '';
    }
  }

  /**
   * Converte entrada (URL ou hostname) em hostname canônico minúsculo.
   * @throws BadRequestException se inválido
   */
  private normalizeDomainOrThrow(raw: string): string {
    let s = raw.trim().toLowerCase();
    if (!s) {
      throw new BadRequestException('Domínio vazio');
    }
    s = s.replace(/\/+$/, '');
    if (s.includes('://') || s.startsWith('//')) {
      try {
        const u = new URL(s.includes('://') ? s : `https:${s}`);
        s = u.hostname.toLowerCase();
      } catch {
        throw new BadRequestException('Domínio inválido');
      }
    } else {
      s = s.split('/')[0];
      s = s.split(':')[0].toLowerCase();
    }
    this.assertValidHostname(s);
    return s;
  }

  private assertValidHostname(hostname: string) {
    if (!hostname || hostname.length > 253) {
      throw new BadRequestException('Domínio inválido');
    }
    if (hostname === 'localhost') {
      return;
    }
    const labels = hostname.split('.');
    if (labels.length < 2) {
      throw new BadRequestException(
        'Informe um hostname com TLD (ex.: app.revenda.com ou painel.cliente.com.br)',
      );
    }
    const labelOk = (label: string) =>
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    if (!labels.every(labelOk)) {
      throw new BadRequestException('Domínio inválido: use apenas letras, números, hífen e pontos');
    }
  }

  /** Create: null se omitido ou string vazia */
  private resolveDomainValueForWrite(
    domain: string | null | undefined,
  ): string | null {
    if (domain === undefined || domain === null) return null;
    const t = String(domain).trim();
    if (!t) return null;
    return this.normalizeDomainOrThrow(t);
  }

  /**
   * Update: undefined = não alterar; null ou "" = remover domínio
   */
  private resolveDomainPatchForUpdate(
    domain: string | null | undefined,
  ): string | null | undefined {
    if (domain === undefined) return undefined;
    if (domain === null) return null;
    const t = String(domain).trim();
    if (!t) return null;
    return this.normalizeDomainOrThrow(t);
  }

  private async withUniqueDomain<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        if (Array.isArray(target) && target.includes('domain')) {
          throw new BadRequestException('Este domínio já está vinculado a outro brand');
        }
        throw new BadRequestException('Dados em conflito com outro registro');
      }
      throw e;
    }
  }
}
