import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { MasterBrandController } from './master.brands.controller';
import { MasterBrandService } from './master.brands.service';
import { MasterBrandPaymentService } from './master.brand-payment.service';

@Module({
  imports: [UploadModule],
  controllers: [MasterBrandController],
  providers: [MasterBrandService, MasterBrandPaymentService],
  exports: [MasterBrandService, MasterBrandPaymentService],
})
export class MasterBrandModule {}