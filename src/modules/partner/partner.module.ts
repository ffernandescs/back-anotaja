import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';
import { JwtPartnerStrategy } from './strategies/jwt.strategy.partner';
import { MailModule } from '../mail/mail.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [JwtModule.register({}), MailModule, SubscriptionModule, WhatsAppModule],
  controllers: [PartnerController],
  providers: [PartnerService, JwtPartnerStrategy],
  exports: [PartnerService],
})
export class PartnerModule {}
