import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { IfoodService, IfoodOrderEvent } from './ifood.service';
import { IfoodOrderProcessorService } from './ifood-order-processor.service';

// ⚠️  Se você usa webhook do iFood, mantenha POLL_ENABLED = false.
//     O iFood não permite polling e webhook simultaneamente na mesma credencial.
const POLL_ENABLED = false;
const POLL_INTERVAL_MS = 30_000;
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
    if (!POLL_ENABLED) {
      this.logger.log('iFood polling DESATIVADO (usando webhook)');
      return;
    }

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
  }

  // ─── Trigger manual via endpoint admin ────────────────────────────────────

  async triggerPollForBranch(branchId: string): Promise<{ eventsProcessed: number }> {
    const config = await prisma.foodDeliveryIntegrationConfig.findUnique({
      where: { branchId },
    });

    if (!config?.ifoodEnabled || !config.ifoodMerchantId) {
      return { eventsProcessed: 0 };
    }

    let events: IfoodOrderEvent[] = [];

    try {
      events = await this.ifoodService.pollOrders();
    } catch (err: any) {
      this.logger.error(`Erro ao buscar eventos iFood para branch ${branchId}: ${err.message}`);
      return { eventsProcessed: 0 };
    }

    // Filtra apenas eventos desta loja
    const branchEvents = events.filter((e) => e.merchantId === config.ifoodMerchantId);

    if (!branchEvents.length) {
      return { eventsProcessed: 0 };
    }

    this.logger.log(`Branch ${branchId}: ${branchEvents.length} evento(s) recebidos do iFood`);

    const successEvents: { id: string; code: string }[] = [];

    for (const event of branchEvents) {
      try {
        await this.processor.processEvent(event, branchId);
        successEvents.push({ id: event.id, code: event.code });
      } catch (err: any) {
        this.logger.error(`Erro ao processar evento ${event.id} (${event.code}): ${err.message}`);
      }
    }

    if (successEvents.length) {
      try {
        await this.ifoodService.acknowledgeEvents(successEvents.slice(0, ACK_BATCH_SIZE));
      } catch (err: any) {
        this.logger.error(`Erro ao confirmar eventos iFood para branch ${branchId}: ${err.message}`);
      }
    }

    return { eventsProcessed: successEvents.length };
  }

  // ─── Polling automático (só ativo se POLL_ENABLED = true) ─────────────────

  private async pollAllBranches(): Promise<void> {
    this.running = true;
    try {
      const configs = await prisma.foodDeliveryIntegrationConfig.findMany({
        where: { ifoodEnabled: true, ifoodMerchantId: { not: null } },
      });

      for (const config of configs) {
        try {
          await this.pollBranch(config.branchId, config.ifoodMerchantId!);
        } catch (err: any) {
          this.logger.error(`Erro na branch ${config.branchId}: ${err.message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async pollBranch(branchId: string, merchantId: string): Promise<void> {
    let events: IfoodOrderEvent[] = [];

    try {
      events = await this.ifoodService.pollOrders();
    } catch (err: any) {
      this.logger.error(`Erro polling iFood branch ${branchId}: ${err.message}`);
      return;
    }

    const branchEvents = events.filter((e) => e.merchantId === merchantId);
    if (!branchEvents.length) return;

    this.logger.log(`Branch ${branchId}: ${branchEvents.length} evento(s) iFood`);

    const successEvents: { id: string; code: string }[] = [];

    for (const event of branchEvents) {
      try {
        await this.processor.processEvent(event, branchId);
        successEvents.push({ id: event.id, code: event.code });
      } catch (err: any) {
        this.logger.error(
          `Erro processando evento ${event.code} (${event.orderId}): ${err.message}`,
        );
      }
    }

    if (!successEvents.length) return;

    try {
      await this.ifoodService.acknowledgeEvents(successEvents.slice(0, ACK_BATCH_SIZE));
      this.logger.log(`ACK iFood: ${successEvents.length} evento(s) branch ${branchId}`);
    } catch (err: any) {
      this.logger.error(`Erro ACK iFood branch ${branchId}: ${err.message}`);
    }
  }
}