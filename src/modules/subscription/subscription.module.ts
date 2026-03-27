import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { StripeService } from '../billing/stripe.service';
import { SubscriptionHistoryService } from './subscription-history.service';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, StripeService, SubscriptionHistoryService],
  exports: [SubscriptionService, SubscriptionHistoryService],
})
export class SubscriptionModule {}
