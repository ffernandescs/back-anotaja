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

      await prisma.subscription.update({
        where: { companyId },
        data: {
          status: 'ACTIVE',
          strapiSubscriptionId: subscriptionId,
          startDate: new Date(),
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
