import { Module } from '@nestjs/common';
import { AdminAlertsController } from './admin-alerts.controller';
import { AdminAlertsService } from './admin-alerts.service';
import { CashSessionStaleAlertProvider } from './providers/cash-session-stale-alert.provider';
import { OrderStaleAlertProvider } from './providers/order-stale-alert.provider';
import { OrderUnpaidStaleAlertProvider } from './providers/order-unpaid-stale-alert.provider';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [AdminAlertsController],
  providers: [
    AdminAlertsService,
    CashSessionStaleAlertProvider,
    OrderStaleAlertProvider,
    OrderUnpaidStaleAlertProvider,
  ],
  exports: [AdminAlertsService],
})
export class AdminAlertsModule {}
