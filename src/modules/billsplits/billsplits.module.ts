import { Module } from '@nestjs/common';
import { BillSplitsController } from './billsplits.controller';
import { BillSplitsService } from './billsplits.service';

@Module({
  controllers: [BillSplitsController],
  providers: [BillSplitsService],
})
export class BillsplitsModule {}
