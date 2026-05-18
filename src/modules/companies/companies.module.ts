import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MailModule } from '../mail/mail.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyOwnerService } from './owner.service';

@Module({
  imports: [GeocodingModule, MailModule, SubscriptionModule, AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyOwnerService],
  exports: [CompanyOwnerService],
})
export class CompaniesModule {}
