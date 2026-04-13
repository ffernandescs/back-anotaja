import { Controller, Get, Query } from '@nestjs/common';
import { StripeService } from './stripe.service';

@Controller('billing')
export class BillingPreviewController {
  constructor(private stripe: StripeService) {}

  @Get('preview')
  async preview(
    @Query('subscriptionId') subscriptionId: string,
    @Query('priceId') priceId: string,
  ) {
    const preview = await this.stripe.stripe.invoices.createPreview({
      subscription: subscriptionId,
      subscription_details: {
        items: [
          {
            price: priceId,
          },
        ],
      },
    });

    return {
      amountDue: preview.amount_due,
      amountTotal: preview.total,
      nextPaymentAttempt: preview.next_payment_attempt,
      currency: preview.currency,
      lines: preview.lines.data.map((line) => ({
        description: line.description,
        amount: line.amount,
      })),
    };
  }
}