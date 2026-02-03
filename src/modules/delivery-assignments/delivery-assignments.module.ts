import { Module } from '@nestjs/common';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { DeliveryAssignmentsController } from './delivery-assignments.controller';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [DeliveryAssignmentsController],
  providers: [DeliveryAssignmentsService],
})
export class DeliveryAssignmentsModule {}
