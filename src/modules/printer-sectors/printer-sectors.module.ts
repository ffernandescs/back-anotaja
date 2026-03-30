import { Module } from '@nestjs/common';
import { PrinterSectorsController } from '../../controllers/printer-sectors.controller';
import { PrinterSectorService } from '../../services/printer-sectors.service';

@Module({
  controllers: [PrinterSectorsController],
  providers: [PrinterSectorService],
  exports: [PrinterSectorService],
})
export class PrinterSectorsModule {}
