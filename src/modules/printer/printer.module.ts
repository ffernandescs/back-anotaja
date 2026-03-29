import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrinterService } from './printer.service';
import { PrinterController } from './printer.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PrinterController],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
