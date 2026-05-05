import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';
import { JwtPartnerStrategy } from './strategies/jwt.strategy.partner';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PartnerController],
  providers: [PartnerService, JwtPartnerStrategy],
  exports: [PartnerService],
})
export class PartnerModule {}
