import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingPeriod } from '@prisma/client';
import Stripe from 'stripe';
import { calculateStripeAmount } from '../../../utils/calculateStripeAmount';
import type { StripePaymentConfig } from '../../maste-brands/subscription-payment.types';
import type { BrandCheckoutInput, BrandCheckoutResult } from './checkout.types';

function mapBillingPeriodToStripeInterval(
  period: BillingPeriod,
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval {
  if (period === BillingPeriod.MONTHLY) return 'month';
  if (period === BillingPeriod.SEMESTRAL || period === BillingPeriod.ANNUAL) {
    return 'year';
  }
  return 'month';
}

@Injectable()
export class StripeBrandCheckoutService {
  private createClient(config?: StripePaymentConfig | null): Stripe {
    const secretKey =
      config?.secretKey?.trim() || process.env.STRIPE_SECRET_KEY || '';
    if (!secretKey) {
      throw new BadRequestException(
        'Stripe não configurado: defina secretKey na marca ou STRIPE_SECRET_KEY no servidor.',
      );
    }
    return new Stripe(secretKey, {
      apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
    });
  }

  async createCheckout(input: BrandCheckoutInput): Promise<BrandCheckoutResult> {
    const stripe = this.createClient(
      input.brandContext.config as StripePaymentConfig | null,
    );
    const { company, plan, billingPeriod, trialEndsAt } = input;

    let customerId = input.existingStripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        email: company.email,
        phone: company.phone,
        metadata: { companyId: company.id, masterBrandId: input.brandContext.brandId },
      });
      customerId = customer.id;
    }

    const trialEndSeconds = trialEndsAt
      ? Math.floor(new Date(trialEndsAt).getTime() / 1000)
      : null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const shouldApplyTrial =
      trialEndSeconds != null && trialEndSeconds > nowSeconds;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: plan.name,
              ...(plan.description && { description: plan.description }),
            },
            unit_amount: calculateStripeAmount(plan.price, plan.discount),
            recurring: {
              interval: mapBillingPeriodToStripeInterval(billingPeriod),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/billing/success/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing/error/{CHECKOUT_SESSION_ID}`,
      metadata: {
        companyId: company.id,
        planId: plan.id,
        masterBrandId: input.brandContext.brandId,
        paymentProvider: 'STRIPE',
      },
      subscription_data: shouldApplyTrial
        ? { trial_end: trialEndSeconds }
        : undefined,
    });

    if (!session.url) {
      throw new BadRequestException('Stripe não retornou URL de checkout');
    }

    return {
      checkoutUrl: session.url,
      externalCheckoutId: session.id,
      externalCustomerId: customerId,
      paymentProvider: 'STRIPE',
    };
  }

  getStripeInstance(config?: StripePaymentConfig | null): Stripe {
    return this.createClient(config);
  }
}
