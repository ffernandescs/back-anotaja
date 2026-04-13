import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from './stripe.webhook.controller';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';
import { BullModule } from '@nestjs/bullmq';
import { StripeProcessor } from './stripe.processor';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'stripe-events', // ⚠️ TEM QUE SER IGUAL ao add()
    }),
    JwtModule,
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService, ConfigService, BillingOrchestratorService, StripeProcessor,OrdersWebSocketGateway],
})
export class BillingModule {}
