import { BadRequestException, Injectable } from '@nestjs/common';
import {
  formatCaktoConfiguredPlansHint,
  normalizeCaktoConfig,
  resolveCaktoProductForPlan,
} from '../../maste-brands/cakto-payment-config.util';
import type { CaktoPaymentConfig } from '../../maste-brands/subscription-payment.types';
import type { BrandCheckoutInput, BrandCheckoutResult } from './checkout.types';

const CAKTO_API_BASE = 'https://api.cakto.com.br';

@Injectable()
export class CaktoBrandCheckoutService {
  async createCheckout(input: BrandCheckoutInput): Promise<BrandCheckoutResult> {
    const raw = input.brandContext.config as CaktoPaymentConfig | null;
    const config = normalizeCaktoConfig(raw);
    const apiKey = config.apiKey?.trim();

    const product = resolveCaktoProductForPlan(config, {
      id: input.plan.id,
      type: input.plan.type != null ? String(input.plan.type) : null,
      billingPeriod: String(
        input.billingPeriod ?? input.plan.billingPeriod ?? '',
      ),
      name: input.plan.name,
    });

    if (!product) {
      const hint = formatCaktoConfiguredPlansHint(config);
      throw new BadRequestException(
        `Cakto: nenhum produto para o plano "${input.plan.name}" ` +
          `(id=${input.plan.id}, ${input.plan.type}/${input.billingPeriod ?? input.plan.billingPeriod}). ` +
          `Brand: ${input.brandContext.brandName ?? input.brandContext.brandId}. ` +
          `Integrados no Master: ${hint}. ` +
          'Em /master/settings, selecione o mesmo plano (mesmo id e periodicidade) e clique em Salvar.',
      );
    }

    let checkoutCode = product.checkoutCode?.trim();

    if (!checkoutCode && product.caktoProductId && apiKey) {
      checkoutCode = await this.resolveCheckoutCodeFromProduct(
        apiKey,
        product.caktoProductId,
      );
    }

    if (!checkoutCode) {
      throw new BadRequestException(
        `Cakto: produto "${product.label || product.id}" sem checkoutCode ou caktoProductId válido.`,
      );
    }

    const params = new URLSearchParams();
    params.set('email', input.company.email);
    params.set('name', input.company.name);
    if (input.company.document) {
      params.set('cpf', input.company.document);
    }
    if (input.company.phone) {
      const phone = input.company.phone.startsWith('55')
        ? input.company.phone
        : `55${input.company.phone}`;
      params.set('phone', phone);
    }
    params.set('external_reference', input.company.id);
    params.set('plan_id', input.plan.id);
    params.set('plan_name', input.plan.name);
    params.set('billing_period', input.billingPeriod);
    if (input.plan.type) {
      params.set('plan_type', String(input.plan.type));
    }
    params.set('cakto_integration_id', product.id);

    const checkoutUrl = `https://pay.cakto.com.br/${checkoutCode}?${params.toString()}`;

    return {
      checkoutUrl,
      externalCheckoutId: product.id,
      paymentProvider: 'CAKTO',
    };
  }

  private async resolveCheckoutCodeFromProduct(
    apiKey: string,
    productId: string,
  ): Promise<string | undefined> {
    const response = await fetch(
      `${CAKTO_API_BASE}/public_api/products/${productId}/`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) return undefined;

    const product = (await response.json()) as {
      offers?: Array<{ default?: boolean; checkout?: number; id?: string }>;
    };

    const offer =
      product.offers?.find((o) => o.default) ?? product.offers?.[0];

    if (offer?.id) return offer.id;
    if (offer?.checkout != null) return String(offer.checkout);

    return undefined;
  }
}
