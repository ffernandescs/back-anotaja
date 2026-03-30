import { Module } from '@nestjs/common';
import { PrintConfigsController } from '../../controllers/print-configs.controller';
import { PrintConfigService } from '../../services/print-configs.service';
import { PrinterModule } from '../printer/printer.module';

@Module({
  controllers: [PrintConfigsController],
  providers: [PrintConfigService],
  imports: [PrinterModule],
})
export class PrintConfigsModule {}
