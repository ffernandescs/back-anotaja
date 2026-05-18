import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import {
  normalizeCaktoConfig,
  validateCaktoProductsConfig,
} from './cakto-payment-config.util';
import {
  BrandPaymentIntegrationDto,
  BrandPaymentIntegrationResponse,
  CaktoPaymentConfig,
  SUBSCRIPTION_PAYMENT_PROVIDERS,
  SubscriptionPaymentProvider,
} from './subscription-payment.types';

/** Acesso ao delegate antes do `prisma generate` no ambiente local */
function paymentConfigDb() {
  return (prisma as unknown as {
    masterBrandPaymentConfig: {
      findUnique: (args: unknown) => Promise<{
        id: string;
        masterBrandId: string;
        provider: SubscriptionPaymentProvider;
        enabled: boolean;
        config: unknown;
      } | null>;
      upsert: (args: unknown) => Promise<{
        masterBrandId: string;
        provider: SubscriptionPaymentProvider;
        enabled: boolean;
        config: unknown;
      }>;
    };
  }).masterBrandPaymentConfig;
}

@Injectable()
export class MasterBrandPaymentService {
  async getIntegration(
    brandId: string,
    masterUserId: string,
  ): Promise<BrandPaymentIntegrationResponse> {
    await this.assertBrandOwnership(brandId, masterUserId);

    const row = await paymentConfigDb().findUnique({
      where: { masterBrandId: brandId },
    });

    if (!row) {
      return {
        masterBrandId: brandId,
        provider: 'STRIPE',
        enabled: false,
        config: null,
      };
    }

    return this.toResponse(row);
  }

  async upsertIntegration(
    brandId: string,
    masterUserId: string,
    dto: BrandPaymentIntegrationDto,
  ): Promise<BrandPaymentIntegrationResponse> {
    await this.assertBrandOwnership(brandId, masterUserId);
    this.assertValidProvider(dto.provider);

    const configToSave = this.prepareConfigForSave(dto);

    const row = await paymentConfigDb().upsert({
      where: { masterBrandId: brandId },
      create: {
        masterBrandId: brandId,
        provider: dto.provider,
        enabled: dto.enabled ?? false,
        config: configToSave,
      },
      update: {
        provider: dto.provider,
        enabled: dto.enabled ?? false,
        config: configToSave,
      },
    });

    return this.toResponse(row);
  }

  /** Resolve integração ativa por domínio do brand */
  async resolveByHost(host: string) {
    const normalized = host?.trim().toLowerCase().split(':')[0];
    if (!normalized) return null;

    const brand = await prisma.masterBrand.findFirst({
      where: { domain: normalized },
    });

    if (!brand) return null;

    const integration = await paymentConfigDb().findUnique({
      where: { masterBrandId: brand.id },
    });

    if (!integration?.enabled) return null;

    return {
      brandId: brand.id,
      brandName: brand.name,
      domain: brand.domain,
      ...this.toResponse(integration),
    };
  }

  /**
   * Resolve provedor de cobrança para checkout de assinatura.
   * 1) domínio do host → brand com integração habilitada
   * 2) brand padrão (isDefault) do master
   */
  async resolveForBilling(host?: string) {
    if (host?.trim()) {
      const byHost = await this.resolveByHost(host);
      if (byHost) return byHost;
    }

    const defaultBrand = await prisma.masterBrand.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultBrand) {
      const anyBrand = await prisma.masterBrand.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      if (!anyBrand) {
        throw new ServiceUnavailableException(
          'Nenhuma marca configurada no Master. Configure branding e pagamentos em /master/settings.',
        );
      }
      return this.resolveForBrandRecord(anyBrand);
    }

    return this.resolveForBrandRecord(defaultBrand);
  }

  private async resolveForBrandRecord(brand: {
    id: string;
    name: string;
    domain: string | null;
  }) {
    const integration = await paymentConfigDb().findUnique({
      where: { masterBrandId: brand.id },
    });

    if (!integration?.enabled) {
      throw new BadRequestException(
        `Integração de pagamento não habilitada para a marca "${brand.name}". ` +
          'Configure em Master → Configurações → Provedor de assinaturas.',
      );
    }

    return {
      brandId: brand.id,
      brandName: brand.name,
      domain: brand.domain,
      ...this.toResponse(integration),
    };
  }

  private async assertBrandOwnership(brandId: string, masterUserId: string) {
    const brand = await prisma.masterBrand.findFirst({
      where: { id: brandId, masterUserId },
    });
    if (!brand) {
      throw new NotFoundException('Brand não encontrado');
    }
  }

  private assertValidProvider(provider: string): asserts provider is SubscriptionPaymentProvider {
    if (!SUBSCRIPTION_PAYMENT_PROVIDERS.includes(provider as SubscriptionPaymentProvider)) {
      throw new BadRequestException(`Provedor inválido: ${provider}`);
    }
  }

  private async prepareConfigForSave(
    dto: BrandPaymentIntegrationDto,
  ): Promise<BrandPaymentIntegrationResponse['config'] | undefined> {
    if (!dto.config || typeof dto.config !== 'object') {
      return dto.config ?? undefined;
    }

    if (dto.provider === 'CAKTO') {
      const normalized = normalizeCaktoConfig(dto.config as CaktoPaymentConfig);
      if (dto.enabled) {
        try {
          const planRows = await prisma.plan.findMany({
            where: { isTrial: false, active: true },
            select: { id: true, name: true },
          });
          const requiredIds = new Set(planRows.map((p) => p.id));
          validateCaktoProductsConfig(normalized, {
            validPlanIds: requiredIds,
            requiredPlanIds: requiredIds,
            planNames: new Map(planRows.map((p) => [p.id, p.name])),
          });
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : 'Configuração Cakto inválida',
          );
        }
      }
      return normalized;
    }

    return dto.config as BrandPaymentIntegrationResponse['config'];
  }

  private toResponse(row: {
    masterBrandId: string;
    provider: SubscriptionPaymentProvider;
    enabled: boolean;
    config: unknown;
  }): BrandPaymentIntegrationResponse {
    let config =
      row.config && typeof row.config === 'object'
        ? (row.config as BrandPaymentIntegrationResponse['config'])
        : null;

    if (row.provider === 'CAKTO' && config) {
      config = normalizeCaktoConfig(config as CaktoPaymentConfig);
    }

    return {
      masterBrandId: row.masterBrandId,
      provider: row.provider,
      enabled: row.enabled,
      config,
    };
  }
}
