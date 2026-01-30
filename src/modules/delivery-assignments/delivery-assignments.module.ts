import { Module } from '@nestjs/common';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { DeliveryAssignmentsController } from './delivery-assignments.controller';

@Module({
  controllers: [DeliveryAssignmentsController],
  providers: [DeliveryAssignmentsService],
})
export class DeliveryAssignmentsModule {}
