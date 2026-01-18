import { Injectable, NotFoundException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { prisma } from '../../../lib/prisma';
import { BillingPeriod as BillingPeriodDto } from '../plans/dto/choose-plan.dto';
import Stripe from 'stripe';
import { BillingPeriod } from 'generated/prisma';
import { calculateStripeAmount } from '../../utils/calculateStripeAmount';

function mapBillingPeriodToStripeInterval(
  period: BillingPeriod,
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval {
  if (period === BillingPeriod.MONTHLY) {
    return 'month';
  }
  if (period === BillingPeriod.SEMESTRAL || period === BillingPeriod.ANNUAL) {
    return 'year';
  }
  return 'month';
}

@Injectable()
export class BillingService {
  constructor(private stripeService: StripeService) {}

  async createCheckout(planId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.companyId) {
      throw new NotFoundException('Usuário não está associado a uma empresa');
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      include: { subscription: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.active) {
      throw new NotFoundException('Plano inválido');
    }

    /** 1️⃣ Criar ou reutilizar customer */
    let customerId = company.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripeService.stripe.customers.create({
        name: company.name,
        email: company.email,
        phone: company.phone,
        metadata: {
          companyId: company.id,
        },
      });

      customerId = customer.id;
    }

    /** 2️⃣ Criar Checkout Session */
    const session = await this.stripeService.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: plan.name,
              description: plan.description ?? '',
            },
            unit_amount: calculateStripeAmount(plan.price, plan.discount),
            recurring: {
              interval: mapBillingPeriodToStripeInterval(plan.billingPeriod),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/admin/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/admin/billing/cancel`,
      metadata: {
        companyId: company.id,
        planId: plan.id,
      },
    });

    /** 3️⃣ Criar subscription PENDING */
    await prisma.subscription.upsert({
      where: { companyId: company.id },
      update: {
        status: 'PENDING',
        planId: plan.id,
        stripeCustomerId: customerId,
      },
      create: {
        companyId: company.id,
        planId: plan.id,
        status: 'PENDING',
        stripeCustomerId: customerId,
      },
    });

    return { checkoutUrl: session.url };
  }
}
