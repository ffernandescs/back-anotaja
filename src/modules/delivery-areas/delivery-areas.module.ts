import { Module } from '@nestjs/common';
import { DeliveryAreasService } from './delivery-areas.service';
import { DeliveryAreasController } from './delivery-areas.controller';

@Module({
  controllers: [DeliveryAreasController],
  providers: [DeliveryAreasService],
})
export class DeliveryAreasModule {}
