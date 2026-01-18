import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { prisma } from '../../../lib/prisma';
import Stripe from 'stripe';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('stripe-billing/webhook')
@Public()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  constructor(private stripeService: StripeService) {}

  @Post()
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    let event;

    try {
      this.logger.log('Recebendo evento do Stripe...');
      event = this.stripeService.stripe.webhooks.constructEvent(
        req['rawBody'],
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
      this.logger.log(`Evento recebido: ${event.type}`);
    } catch (err) {
      this.logger.error(`Erro ao processar evento: `);
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Checkout completado - nova assinatura
    if (event.type === 'checkout.session.completed') {
      this.logger.log('Checkout completado - nova assinatura');
      const session = event.data.object;

      const companyId = session.metadata?.companyId;
      const subscriptionId = session.subscription as string;
      this.logger.log(
        `checkout.session.completed recebido para companyId=${companyId}, subscriptionId=${subscriptionId}`,
      );
      if (!companyId || !subscriptionId) {
        this.logger.error(
          `checkout.session.completed recebido para companyId=${companyId}, subscriptionId=${subscriptionId}`,
        );
        throw new BadRequestException('Dados da assinatura incompletos');
      }

      // ✅ Buscar assinatura completa via API do Stripe
      const subscriptionResponse =
        await this.stripeService.stripe.subscriptions.retrieve(
          session.subscription as string,
          { expand: ['items.data.price'] },
        );

      const subscription = subscriptionResponse as any;

      // Pega o preço do item
      const unitAmount = subscription.items.data[0].price.unit_amount;
      this.logger.log(
        `checkout.session.completed recebido para ${subscription}`,
      );
      // ✅ Datas corretas da subscription
      const startDate = new Date(subscription.created * 1000); // Data que começou
      const nextBillingDate = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null;
      this.logger.log(
        `nextBillingDate calculada: ${nextBillingDate?.toLocaleString()} (current_period_end=${subscription.current_period_end})`,
      );

      const endDate = subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null;

      const planId =
        session.metadata?.planId || subscription.items.data[0]?.price.id;

      // Salvar no banco
      await prisma.subscription.upsert({
        where: { companyId },
        update: {
          status: 'ACTIVE',
          stripeSubscriptionId: subscriptionId,
          planId,
          startDate, // Data que a assinatura foi criada
          nextBillingDate, // Próxima data de cobrança
          endDate,
          lastBillingAmount: unitAmount || 0,
        },
        create: {
          companyId,
          status: 'ACTIVE',
          stripeSubscriptionId: subscriptionId,
          planId,
          startDate,
          nextBillingDate,
          endDate,
          lastBillingAmount: unitAmount || 0,
        },
      });
      this.logger.log(
        `Assinatura criada/atualizada no banco para companyId=${companyId}`,
      );
    }

    // ✅ Atualizar próxima data de cobrança quando invoice é gerado
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      this.logger.log(
        `invoice.payment_succeeded recebido para subscriptionId=${invoice.subscription}`,
      );

      if (invoice.subscription) {
        const subscriptionResponse =
          await this.stripeService.stripe.subscriptions.retrieve(
            invoice.subscription,
          );
        const subscription = subscriptionResponse as any;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: {
            status: 'ACTIVE',
            nextBillingDate: new Date(subscription.current_period_end * 1000),
            lastBillingAmount: invoice.amount_paid || 0,
          },
        });
        this.logger.log(
          `Próxima data de cobrança atualizada para subscriptionId=${invoice.subscription}`,
        );
      }
    }

    // Pagamento falhado
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;

      if (invoice.subscription) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: { status: 'SUSPENDED' },
        });
      }
    }

    // ✅ Assinatura cancelada
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: 'CANCELLED',
          endDate: new Date(subscription.canceled_at * 1000),
        },
      });
    }

    // ✅ Assinatura atualizada (mudança de plano, etc)
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      this.logger.log(
        `customer.subscription.updated recebido para subscriptionId=${subscription.id}`,
      );

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: subscription.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
          nextBillingDate: new Date(subscription.current_period_end * 1000),
          endDate: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000)
            : null,
        },
      });
      this.logger.log(
        `Assinatura atualizada no banco, subscriptionId=${subscription.id}`,
      );
    }

    return { received: true };
  }
}
