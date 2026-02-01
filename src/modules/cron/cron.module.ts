import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TrialExpirationService } from './trial-expiration.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TrialExpirationService],
  exports: [TrialExpirationService],
})
export class CronModule {}
