import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MailModule } from '../mail/mail.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [GeocodingModule, MailModule, SubscriptionModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
