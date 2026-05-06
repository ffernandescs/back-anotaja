import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { IfoodService, IfoodOrderEvent } from './ifood.service';
import { IfoodOrderProcessorService } from './ifood-order-processor.service';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const ACK_BATCH_SIZE = 2000;

@Injectable()
export class IfoodPollingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IfoodPollingService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly ifoodService: IfoodService,
    private readonly processor: IfoodOrderProcessorService,
  ) {}

  onApplicationBootstrap(): void {
    this.intervalHandle = setInterval(() => {
      if (!this.running) void this.pollAllBranches();
    }, POLL_INTERVAL_MS);
    this.logger.log(`iFood polling iniciado (intervalo: ${POLL_INTERVAL_MS / 1000}s)`);
  }

  onApplicationShutdown(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('iFood polling encerrado');
  }

  private async pollAllBranches(): Promise<void> {
    this.running = true;
    try {
      const enabledConfigs = await prisma.foodDeliveryIntegrationConfig.findMany({
        where: { ifoodEnabled: true, ifoodMerchantId: { not: null } },
      });

      if (!enabledConfigs.length) return;

      for (const config of enabledConfigs) {
        try {
          await this.pollBranch(config.branchId, config.ifoodMerchantId!);
        } catch (err: any) {
          this.logger.error(
            `Erro ao processar polling da branch ${config.branchId}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Erro no ciclo de polling iFood: ${err.message}`, err.stack);
    } finally {
      this.running = false;
    }
  }

  private async pollBranch(branchId: string, merchantId: string): Promise<void> {
    let events: IfoodOrderEvent[];

    try {
      events = await this.ifoodService.pollOrders(merchantId);
    } catch (err: any) {
      this.logger.error(`Falha ao buscar eventos iFood para branch ${branchId}: ${err.message}`);
      return;
    }

    if (!events.length) return;

    this.logger.log(`Branch ${branchId}: ${events.length} evento(s) iFood recebido(s)`);

    // Process events sequentially to maintain order
    for (const event of events) {
      await this.processor.processEvent(event, branchId);
    }

    // Acknowledge all events (up to ACK_BATCH_SIZE at a time)
    const toAck = events.slice(0, ACK_BATCH_SIZE).map((e) => ({ id: e.id, code: e.code }));
    try {
      await this.ifoodService.acknowledgeEvents(toAck);
    } catch (err: any) {
      this.logger.error(`Falha ao confirmar eventos iFood para branch ${branchId}: ${err.message}`);
    }
  }

  // Expose for manual trigger (admin endpoint)
  async triggerPollForBranch(branchId: string): Promise<{ eventsProcessed: number }> {
    const config = await prisma.foodDeliveryIntegrationConfig.findUnique({
      where: { branchId },
    });

    if (!config?.ifoodEnabled || !config.ifoodMerchantId) {
      return { eventsProcessed: 0 };
    }

    const events = await this.ifoodService.pollOrders(config.ifoodMerchantId);

    for (const event of events) {
      await this.processor.processEvent(event, branchId);
    }

    if (events.length) {
      await this.ifoodService.acknowledgeEvents(
        events.slice(0, ACK_BATCH_SIZE).map((e) => ({ id: e.id, code: e.code })),
      );
    }

    return { eventsProcessed: events.length };
  }
}
