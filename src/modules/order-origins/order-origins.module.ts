import { Module } from '@nestjs/common';
import { OrderOriginsService } from './order-origins.service';

@Module({
  providers: [OrderOriginsService],
  exports: [OrderOriginsService],
})
export class OrderOriginsModule {}
