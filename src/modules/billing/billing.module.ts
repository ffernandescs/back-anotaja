import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from './stripe.webhook.controller';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService, ConfigService],
})
export class BillingModule {}
