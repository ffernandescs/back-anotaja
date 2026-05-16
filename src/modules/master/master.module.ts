import { Module } from '@nestjs/common';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';
import { UploadModule } from '../upload/upload.module';
import { OrderOriginsModule } from '../order-origins/order-origins.module';

@Module({
  imports: [UploadModule, OrderOriginsModule],
  controllers: [MasterController],
  providers: [MasterService],
  exports: [MasterService],
})
export class MasterModule {}
