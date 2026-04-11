import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WebSocketModule } from '../websocket/websocket.module';
import { PrinterModule } from '../printer/printer.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [
    WebSocketModule,
    PrinterModule,
    StoreModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
