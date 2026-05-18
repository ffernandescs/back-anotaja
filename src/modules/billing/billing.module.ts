import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from './stripe.webhook.controller';
import { AsaasWebhookController } from './asaas.webhook.controller';
import { CaktoWebhookController } from './cakto.webhook.controller';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';
import { BullModule } from '@nestjs/bullmq';
import { StripeProcessor } from './stripe.processor';
import { JwtModule } from '@nestjs/jwt';
import { WebSocketModule } from '../websocket/websocket.module';
import { MasterBrandModule } from '../maste-brands/master.brands.module';
import { BrandCheckoutService } from './brand-payment/brand-checkout.service';
import { StripeBrandCheckoutService } from './brand-payment/stripe-brand-checkout.service';
import { AsaasBrandCheckoutService } from './brand-payment/asaas-brand-checkout.service';
import { CaktoBrandCheckoutService } from './brand-payment/cakto-brand-checkout.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'stripe-events',
    }),
    JwtModule,
    WebSocketModule,
    MasterBrandModule,
  ],
  controllers: [
    BillingController,
    StripeWebhookController,
    AsaasWebhookController,
    CaktoWebhookController,
  ],
  providers: [
    BillingService,
    StripeService,
    ConfigService,
    BillingOrchestratorService,
    StripeProcessor,
    BrandCheckoutService,
    StripeBrandCheckoutService,
    AsaasBrandCheckoutService,
    CaktoBrandCheckoutService,
  ],
  exports: [BrandCheckoutService, StripeBrandCheckoutService],
})
export class BillingModule {}
