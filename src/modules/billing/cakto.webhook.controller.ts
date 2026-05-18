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
    const companyId = await this.resolveCompanyId(data);

    if (!companyId) {
      this.logger.warn('Cakto webhook sem companyId identificável');
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
  ): Promise<string | null> {
    const direct =
      (data.external_reference as string) ||
      (data.externalReference as string) ||
      (data.companyId as string);

    if (direct && typeof direct === 'string') {
      return direct;
    }

    const customer = data.customer as Record<string, unknown> | undefined;
    const email =
      typeof customer?.email === 'string' ? customer.email.trim() : null;

    if (email) {
      const company = await prisma.company.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (company) return company.id;
    }

    return null;
  }
}
