import { prisma } from '../../../lib/prisma';

export class StripeWebhookHandler {
  async handle(event: any) {
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { id: event.id },
    });

    if (existingEvent) {
      console.log(`⚠️ Evento duplicado ignorado: ${event.id}`);
      return;
    }

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoice(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscription(event.data.object);
        break;

      default:
        console.log(`Evento não tratado: ${event.type}`);
    }

    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
      },
    });
  }

  private async handleInvoice(invoice: any) {
    console.log('💰 Invoice processada', invoice.id);
  }

  private async handleSubscription(subscription: any) {
    console.log('🔄 Subscription atualizada', subscription.id);
  }
}