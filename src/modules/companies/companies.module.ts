import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [GeocodingModule, MailModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
