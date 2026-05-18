import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingPeriod } from '@prisma/client';
import { calculateStripeAmount } from '../../../utils/calculateStripeAmount';
import type { AsaasPaymentConfig } from '../../maste-brands/subscription-payment.types';
import type { BrandCheckoutInput, BrandCheckoutResult } from './checkout.types';

/** PNG 1x1 transparente mínimo exigido pela API Asaas em items.imageBase64 */
const PLACEHOLDER_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function asaasBaseUrl(environment?: string): string {
  return environment === 'production'
    ? 'https://api.asaas.com'
    : 'https://api-sandbox.asaas.com';
}

function mapBillingPeriodToAsaasCycle(
  period: BillingPeriod,
): 'MONTHLY' | 'SEMIANNUALLY' | 'YEARLY' {
  if (period === BillingPeriod.ANNUAL) return 'YEARLY';
  if (period === BillingPeriod.SEMESTRAL) return 'SEMIANNUALLY';
  return 'MONTHLY';
}

@Injectable()
export class AsaasBrandCheckoutService {
  async createCheckout(input: BrandCheckoutInput): Promise<BrandCheckoutResult> {
    const config = input.brandContext.config as AsaasPaymentConfig | null;
    const apiKey = config?.apiKey?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        'API Key Asaas não configurada para esta marca no Master.',
      );
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const amountReais =
      calculateStripeAmount(input.plan.price, input.plan.discount) / 100;

    const nextDue = input.trialEndsAt && input.trialEndsAt > new Date()
      ? input.trialEndsAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const body = {
      billingTypes: ['CREDIT_CARD', 'PIX'],
      chargeTypes: ['RECURRENT'],
      externalReference: input.company.id,
      callback: {
        successUrl: `${frontendUrl}/billing/success/asaas?companyId=${input.company.id}`,
        cancelUrl: `${frontendUrl}/billing/error/asaas?companyId=${input.company.id}`,
        expiredUrl: `${frontendUrl}/billing/error/asaas?companyId=${input.company.id}`,
      },
      items: [
        {
          name: input.plan.name.slice(0, 30),
          description: input.plan.description?.slice(0, 150) || input.plan.name,
          quantity: 1,
          value: amountReais,
          imageBase64: PLACEHOLDER_IMAGE_BASE64,
          externalReference: input.plan.id,
        },
      ],
      customerData: {
        name: input.company.name,
        email: input.company.email,
        cpfCnpj: input.company.document,
        phone: input.company.phone,
      },
      subscription: {
        cycle: mapBillingPeriodToAsaasCycle(input.billingPeriod),
        nextDueDate: nextDue,
      },
    };

    const baseUrl = asaasBaseUrl(config?.environment);
    const response = await fetch(`${baseUrl}/v3/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        'User-Agent': 'AnotaJa/1.0',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as { link?: string; id?: string; errors?: Array<{ description: string }> };

    if (!response.ok) {
      const msg =
        data?.errors?.[0]?.description ||
        `Erro Asaas (${response.status}) ao criar checkout`;
      throw new BadRequestException(msg);
    }

    if (!data.link) {
      throw new BadRequestException('Asaas não retornou link de checkout');
    }

    return {
      checkoutUrl: data.link,
      externalCheckoutId: data.id,
      paymentProvider: 'ASAAS',
    };
  }
}
