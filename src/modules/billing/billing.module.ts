import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [BillingController],
  providers: [BillingService, StripeService, ConfigService],
})
export class BillingModule {}
