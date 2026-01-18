import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { prisma } from '../../../lib/prisma';

@Controller('billing/webhook')
export class StripeWebhookController {
  constructor(private stripeService: StripeService) {}

  @Post()
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    let event: Stripe.Event;

    try {
      event = this.stripeService.stripe.webhooks.constructEvent(
        req['rawBody'],
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
    } catch (err) {
      throw new BadRequestException('Invalid signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const companyId = session.metadata?.companyId;
      const subscriptionId = session.subscription as string;

      // Consulta o Strapi pela assinatura
      const strapiSubscription = await fetch(
        `${process.env.STRAPI_API_URL}/subscriptions/${subscriptionId}`,
        {
          headers: { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` },
        },
      ).then((res) => res.json());

      if (!strapiSubscription) {
        throw new BadRequestException('Subscription not found');
      }
      if (!companyId) {
        throw new BadRequestException('Empresa não encontrada');
      }

      await prisma.subscription.upsert({
        where: { companyId },
        update: {
          status: strapiSubscription.status, // ACTIVE, SUSPENDED etc
          strapiSubscriptionId: subscriptionId,
          planId: strapiSubscription.planId,
          billingPeriod: strapiSubscription.billingPeriod,
          startDate: new Date(strapiSubscription.startDate),
          nextBillingDate: new Date(strapiSubscription.nextBillingDate),
          lastBillingDate: new Date(strapiSubscription.lastBillingDate),
          lastBillingAmount: strapiSubscription.lastBillingAmount,
        },
        create: {
          companyId,
          status: strapiSubscription.status,
          strapiSubscriptionId: subscriptionId,
          planId: strapiSubscription.planId,
          billingPeriod: strapiSubscription.billingPeriod,
          startDate: new Date(strapiSubscription.startDate),
          nextBillingDate: new Date(strapiSubscription.nextBillingDate),
          lastBillingDate: new Date(strapiSubscription.lastBillingDate),
          lastBillingAmount: strapiSubscription.lastBillingAmount,
        },
      });
    }

    if (event.type === 'invoice.payment_failed') {
      const obj = event.data.object;

      // Só executa se tiver subscription
      if ('subscription' in obj && obj.subscription) {
        await prisma.subscription.updateMany({
          where: { strapiSubscriptionId: obj.subscription as string },
          data: { status: 'SUSPENDED' },
        });
      }
    }

    return { received: true };
  }
}
