import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from './stripe.webhook.controller';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';
import { BullModule } from '@nestjs/bullmq';
import { StripeProcessor } from './stripe.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'stripe-events', // ⚠️ TEM QUE SER IGUAL ao add()
    }),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService, ConfigService, BillingOrchestratorService, StripeProcessor],
})
export class BillingModule {}
