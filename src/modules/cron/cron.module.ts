import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { CashSessionStaleAlertJob } from '../admin-alerts/jobs/cash-session-stale-alert.job';
import { WebSocketModule } from '../websocket/websocket.module';
import { AutoCompleteOrdersService } from './auto-complete-orders.service';
import { AutoCompleteOrdersJob } from './jobs/auto-complete-orders.job';
import { TrialExpirationService } from './trial-expiration.service';

@Module({
  imports: [ScheduleModule.forRoot(), AdminAlertsModule, WebSocketModule],
  providers: [
    TrialExpirationService,
    CashSessionStaleAlertJob,
    AutoCompleteOrdersService,
    AutoCompleteOrdersJob,
  ],
  exports: [TrialExpirationService, AutoCompleteOrdersService],
})
export class CronModule {}
