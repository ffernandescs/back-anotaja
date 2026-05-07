import { Module } from '@nestjs/common';
import { FoodDeliveryIntegrationsController } from './food-delivery-integrations.controller';
import { FoodDeliveryIntegrationsService } from './food-delivery-integrations.service';
import { IfoodService } from './ifood.service';
import { IfoodOrderProcessorService } from './ifood-order-processor.service';
import { IfoodPollingService } from './ifood-polling.service';
import { IfoodProductMappingService } from './ifood-product-mapping.service';
import { NinetyNineFoodService } from './ninetynine-food.service';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [FoodDeliveryIntegrationsController],
  providers: [
    FoodDeliveryIntegrationsService,
    IfoodService,
    IfoodOrderProcessorService,
    IfoodPollingService,
    IfoodProductMappingService,
    NinetyNineFoodService,
  ],
  exports: [
    FoodDeliveryIntegrationsService,
    IfoodService,
    IfoodOrderProcessorService,
    IfoodPollingService,
    IfoodProductMappingService,
  ],
})
export class FoodDeliveryIntegrationsModule {}
