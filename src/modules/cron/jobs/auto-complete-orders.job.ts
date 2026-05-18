import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutoCompleteOrdersService } from '../auto-complete-orders.service';

@Injectable()
export class AutoCompleteOrdersJob {
  private readonly logger = new Logger(AutoCompleteOrdersJob.name);

  constructor(
    private readonly autoCompleteOrdersService: AutoCompleteOrdersService,
  ) {}

  /** A cada hora, finaliza pedidos abertos há mais de 24h (filiais com flag ativa). */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyAutoComplete() {
    try {
      const result = await this.autoCompleteOrdersService.runForAllBranches();
      if (result.orders > 0) {
        this.logger.log(
          `Auto-complete: ${result.orders} pedido(s) em ${result.branches} filial(is)`,
        );
      }
    } catch (error) {
      this.logger.error('Falha ao finalizar pedidos automaticamente', error);
    }
  }
}
