import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { CashSessionStaleAlertJob } from '../admin-alerts/jobs/cash-session-stale-alert.job';
import { TrialExpirationService } from './trial-expiration.service';

@Module({
  imports: [ScheduleModule.forRoot(), AdminAlertsModule],
  providers: [TrialExpirationService, CashSessionStaleAlertJob],
  exports: [TrialExpirationService],
})
export class CronModule {}
