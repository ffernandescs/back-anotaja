import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { OrdersModule } from '../orders/orders.module';
@Module({
  controllers: [TablesController],
  providers: [TablesService],
  imports: [OrdersModule],
})
export class TablesModule {}
