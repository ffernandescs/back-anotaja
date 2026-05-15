import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { MasterBrandController } from './master.brands.controller';
import { MasterBrandService } from './master.brands.service';

@Module({
  imports: [UploadModule],
  controllers: [MasterBrandController],
  providers: [MasterBrandService],
  exports: [MasterBrandService],
})
export class MasterBrandModule {}