import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrinterService } from './printer.service';
import { PrinterController } from './printer.controller';
import { PrinterManagementService } from './printer-management.service';
import { PrinterManagementController } from './printer-management.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PrinterController, PrinterManagementController],
  providers: [PrinterService, PrinterManagementService],
  exports: [PrinterService, PrinterManagementService],
})
export class PrinterModule {}
