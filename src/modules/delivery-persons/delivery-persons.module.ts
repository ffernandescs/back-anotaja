import { Module } from '@nestjs/common';
import { DeliveryPersonsService } from './delivery-persons.service';
import { DeliveryPersonsController } from './delivery-persons.controller';

@Module({
  controllers: [DeliveryPersonsController],
  providers: [DeliveryPersonsService],
  exports: [DeliveryPersonsService],
})
export class DeliveryPersonsModule {}
