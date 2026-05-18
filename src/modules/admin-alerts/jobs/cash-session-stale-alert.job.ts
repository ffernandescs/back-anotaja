import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminAlertsService } from '../admin-alerts.service';

@Injectable()
export class CashSessionStaleAlertJob {
  private readonly logger = new Logger(CashSessionStaleAlertJob.name);

  constructor(private readonly adminAlertsService: AdminAlertsService) {}

  /** Verifica alertas do painel (caixa, pedidos pendentes, etc.) e notifica via WebSocket. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyStaleCashCheck() {
    try {
      const result =
        await this.adminAlertsService.runStaleAlertsForAllBranches();
      if (result.alerts > 0) {
        this.logger.log(
          `Alertas do painel: ${result.alerts} em ${result.branches} filial(is)`,
        );
      }
    } catch (error) {
      this.logger.error('Falha ao verificar alertas do painel', error);
    }
  }
}
