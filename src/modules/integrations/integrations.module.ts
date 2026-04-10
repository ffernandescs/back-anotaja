import { Module } from '@nestjs/common';
import { MarketingIntegrationsService } from './marketing-integrations.service';
import { MarketingIntegrationsController } from './marketing-integrations.controller';
import { PaymentGatewaysService } from './payment-gateways.service';
import { PaymentGatewaysController } from './payment-gateways.controller';

@Module({
  controllers: [MarketingIntegrationsController, PaymentGatewaysController],
  providers: [MarketingIntegrationsService, PaymentGatewaysService],
  exports: [MarketingIntegrationsService, PaymentGatewaysService],
})
export class IntegrationsModule {}
