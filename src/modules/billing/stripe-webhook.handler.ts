import { prisma } from '../../../lib/prisma';

export class StripeWebhookHandler {
  async handle(event: any) {
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { id: event.id },
    });

    if (existingEvent) {
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
    }

    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
      },
    });
  }

  private async handleInvoice(invoice: any) {
  }

  private async handleSubscription(subscription: any) {
  }
}