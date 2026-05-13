import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { MasterBrandController } from './master.brands.controller';
import { MasterBrandService } from './master.brands.service';
import { MasterService } from '../master/master.service';

@Module({
  imports: [UploadModule],
  controllers: [MasterBrandController],
  providers: [MasterBrandService, MasterService],
  exports: [MasterBrandService],
})
export class MasterBrandModule {}