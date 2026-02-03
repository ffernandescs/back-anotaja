import { Module } from '@nestjs/common';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { DeliveryAssignmentsController } from './delivery-assignments.controller';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [DeliveryAssignmentsController],
  providers: [DeliveryAssignmentsService, OrdersWebSocketGateway, JwtService, ConfigService],
})
export class DeliveryAssignmentsModule {}
