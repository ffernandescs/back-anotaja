import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { prisma } from '../../../lib/prisma';
import {
  caktoWebhookSecretMatches,
  findCaktoProductByIntegrationId,
  normalizeCaktoConfig,
} from '../maste-brands/cakto-payment-config.util';
import type {
  CaktoPaymentConfig,
  CaktoProductIntegration,
} from '../maste-brands/subscription-payment.types';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';

const ACTIVATE_EVENTS = new Set([
  'purchase_approved',
  'subscription_created',
  'subscription_renewed',
]);

/**
 * Webhooks Cakto — um endpoint por produto (secret próprio) ou global.
 *
 * Por produto: POST /api/cakto-billing/webhook/{integrationId}
 * Global:      POST /api/cakto-billing/webhook
 */
@Controller('cakto-billing')
export class CaktoWebhookController {
  private readonly logger = new Logger(CaktoWebhookController.name);

  constructor(
    private readonly billingOrchestrator: BillingOrchestratorService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleGlobal(@Body() payload: Record<string, unknown>) {
    return this.processWebhook(payload);
  }

  @Public()
  @Post('webhook/:integrationId')
  @HttpCode(HttpStatus.OK)
  async handleForProduct(
    @Param('integrationId') integrationId: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.processWebhook(payload, integrationId);
  }

  private async processWebhook(
    payload: Record<string, unknown>,
    integrationId?: string,
  ) {
    const event = String(payload.event ?? '');
    if (!ACTIVATE_EVENTS.has(event)) {
      return { received: true, skipped: event };
    }

    const data = (payload.data ?? {}) as Record<string, unknown>;
    const companyId = await this.resolveCompanyId(data, integrationId);

    if (!companyId) {
      this.logger.warn(
        `Cakto webhook sem companyId identificável (integration=${integrationId ?? 'global'}, event=${event})`,
      );
      return { received: true, skipped: 'no_company_id' };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return { received: true, skipped: 'no_subscription' };
    }

    const brandConfig = await this.loadBrandCaktoConfig(
      subscription.masterBrandId,
    );

    if (!brandConfig) {
      return { received: true, skipped: 'no_brand_config' };
    }

    const { config, normalized } = brandConfig;

    let product: CaktoProductIntegration | null = null;

    if (integrationId) {
      product = findCaktoProductByIntegrationId(normalized, integrationId);
      if (!product) {
        this.logger.warn(
          `Cakto webhook: integrationId ${integrationId} não encontrado na brand`,
        );
        return { received: true, skipped: 'unknown_integration' };
      }
    } else {
      const fromPayload =
        (data.cakto_integration_id as string) ||
        subscription.externalCheckoutId;
      if (fromPayload) {
        product = findCaktoProductByIntegrationId(normalized, fromPayload);
      }
    }

    if (
      !caktoWebhookSecretMatches(product, config, payload.secret)
    ) {
      this.logger.warn(
        `Cakto webhook: secret inválido (company ${companyId}, integration ${integrationId ?? 'global'})`,
      );
      return { received: false };
    }

    if (
      integrationId &&
      subscription.masterBrandId &&
      product &&
      subscription.externalCheckoutId &&
      subscription.externalCheckoutId !== integrationId
    ) {
      this.logger.warn(
        `Cakto webhook: integrationId ${integrationId} difere do checkout ${subscription.externalCheckoutId}`,
      );
    }

    const offer = data.offer as Record<string, unknown> | undefined;
    const productPayload = data.product as Record<string, unknown> | undefined;

    await prisma.subscription.update({
      where: { companyId },
      data: {
        paymentProvider: 'CAKTO',
        externalCheckoutId:
          product?.id ||
          integrationId ||
          (offer?.id as string) ||
          (productPayload?.short_id as string) ||
          subscription.externalCheckoutId,
      },
    });

    const result =
      await this.billingOrchestrator.commitPendingPlanAfterPayment(companyId);

    this.logger.log(
      `Cakto ${event}: company ${companyId} ativada (plano ${result?.planId}, produto ${product?.id ?? integrationId ?? 'n/a'})`,
    );

    return {
      received: true,
      activated: true,
      planId: result?.planId,
      integrationId: product?.id ?? integrationId,
    };
  }

  private async loadBrandCaktoConfig(masterBrandId: string | null) {
    if (!masterBrandId) return null;

    const row = await (prisma as any).masterBrandPaymentConfig.findUnique({
      where: { masterBrandId },
    });

    if (!row || row.provider !== 'CAKTO') return null;

    const config = (row.config ?? {}) as CaktoPaymentConfig;
    return { config, normalized: normalizeCaktoConfig(config) };
  }

  private async resolveCompanyId(
    data: Record<string, unknown>,
    integrationId?: string,
  ): Promise<string | null> {
    const urlParams = this.parseCheckoutUrlParams(data.checkoutUrl);

    const directCandidates = [
      data.external_reference,
      data.externalReference,
      data.companyId,
      data.sck,
      urlParams.external_reference,
      urlParams.companyId,
      urlParams.plan_id,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      const trimmed = candidate.trim();
      const company = await prisma.company.findUnique({
        where: { id: trimmed },
        select: { id: true },
      });
      if (company) return company.id;
    }

    const customer = data.customer as Record<string, unknown> | undefined;
    const subCustomer = (data.subscription as Record<string, unknown> | undefined)
      ?.customer as Record<string, unknown> | undefined;
    const email = this.normalizeEmail(customer?.email ?? subCustomer?.email);
    const phone = this.normalizePhone(
      customer?.phone ?? subCustomer?.phone,
    );

    if (email) {
      const company = await prisma.company.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (company) return company.id;
    }

    if (phone) {
      const company = await prisma.company.findFirst({
        where: {
          OR: [{ phone }, { phone: phone.replace(/^55/, '') }],
        },
        select: { id: true },
      });
      if (company) return company.id;
    }

    const integrationKey =
      integrationId ||
      (typeof data.cakto_integration_id === 'string'
        ? data.cakto_integration_id
        : urlParams.cakto_integration_id);

    if (integrationKey) {
      const fromPending = await this.resolveCompanyByPendingCheckout(
        integrationKey,
        email,
      );
      if (fromPending) return fromPending;
    }

    if (email) {
      const fromPendingEmail = await this.resolveCompanyByPendingCheckout(
        undefined,
        email,
      );
      if (fromPendingEmail) return fromPendingEmail;
    }

    return null;
  }

  /**
   * Checkout Cakto grava external_reference na URL, mas o webhook muitas vezes não devolve.
   * Buscamos assinatura PENDING criada ao clicar em "escolher plano" (externalCheckoutId / pendingPlanId).
   */
  private async resolveCompanyByPendingCheckout(
    integrationId?: string,
    email?: string | null,
  ): Promise<string | null> {
    const planId = integrationId
      ? this.planIdFromIntegration(integrationId)
      : null;

    const baseWhere = {
      paymentProvider: 'CAKTO' as const,
      status: 'PENDING' as const,
    };

    const orFilters: Array<Record<string, unknown>> = [];
    if (integrationId) {
      orFilters.push({ externalCheckoutId: integrationId });
    }
    if (planId) {
      orFilters.push({ pendingPlanId: planId });
    }
    if (orFilters.length === 0 && !email) {
      return null;
    }

    const where: Record<string, unknown> = {
      ...baseWhere,
      ...(orFilters.length > 0 ? { OR: orFilters } : {}),
    };

    if (email) {
      const byEmail = await prisma.subscription.findFirst({
        where: {
          ...where,
          company: { email: { equals: email, mode: 'insensitive' } },
        },
        orderBy: { updatedAt: 'desc' },
        select: { companyId: true },
      });
      if (byEmail) return byEmail.companyId;
    }

    const pending = await prisma.subscription.findMany({
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { companyId: true, updatedAt: true },
    });

    if (pending.length === 1) {
      return pending[0].companyId;
    }

    if (pending.length > 1) {
      this.logger.warn(
        `Cakto: ${pending.length} assinaturas PENDING para integration=${integrationId ?? 'email'}. ` +
          'Use o mesmo e-mail do cadastro no checkout ou aguarde conflito resolver.',
      );
      return pending[0].companyId;
    }

    return null;
  }

  private parseCheckoutUrlParams(
    checkoutUrl: unknown,
  ): Record<string, string> {
    if (typeof checkoutUrl !== 'string' || !checkoutUrl.trim()) {
      return {};
    }
    try {
      const url = new URL(checkoutUrl);
      const params: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    } catch {
      return {};
    }
  }

  private normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return email.includes('@') ? email : null;
  }

  private normalizePhone(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  private planIdFromIntegration(integrationId?: string): string | null {
    if (!integrationId?.startsWith('plan-')) return null;
    const planId = integrationId.slice(5).trim();
    return planId || null;
  }
}
