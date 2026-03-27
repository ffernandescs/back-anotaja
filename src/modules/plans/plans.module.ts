import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlanSyncService } from './plan-sync.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlanSyncService],
  exports: [PlansService, PlanSyncService],
})
export class PlansModule {}
