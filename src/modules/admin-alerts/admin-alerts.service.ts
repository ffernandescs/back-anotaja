import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEntityType } from '../notifications/dto/mark-notification-read.dto';
import { prisma } from '../../../lib/prisma';
import {
  AdminAlertBranchConfig,
  AdminAlertContext,
  AdminAlertDto,
} from './admin-alerts.types';
import { CashSessionStaleAlertProvider } from './providers/cash-session-stale-alert.provider';
import { OrderStaleAlertProvider } from './providers/order-stale-alert.provider';
import { OrderUnpaidStaleAlertProvider } from './providers/order-unpaid-stale-alert.provider';
import { AdminAlertProvider } from './providers/admin-alert-provider.interface';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class AdminAlertsService {
  private readonly providers: AdminAlertProvider[];

  constructor(
    private readonly cashSessionStaleProvider: CashSessionStaleAlertProvider,
    private readonly orderStaleProvider: OrderStaleAlertProvider,
    private readonly orderUnpaidStaleProvider: OrderUnpaidStaleAlertProvider,
    private readonly wsGateway: OrdersWebSocketGateway,
  ) {
    this.providers = [
      this.cashSessionStaleProvider,
      this.orderStaleProvider,
      this.orderUnpaidStaleProvider,
    ];
  }

  async getAlertsForUser(userId: string): Promise<{
    alerts: AdminAlertDto[];
    config: AdminAlertBranchConfig;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, branchId: true },
    });

    if (!user?.branchId) {
      throw new NotFoundException('Usuário sem filial associada');
    }

    const config = await this.loadBranchConfig(user.branchId);
    const context: AdminAlertContext = {
      branchId: user.branchId,
      userId,
      config,
    };

    const batches = await Promise.all(
      this.providers.map((provider) => provider.getAlerts(context)),
    );

    const alerts = batches.flat().sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const readIds = await this.getReadEntityIds(userId, alerts);
    const withRead = alerts.map((alert) => ({
      ...alert,
      read: readIds.has(alert.entityId),
    }));

    return { alerts: withRead, config };
  }

  /** Emite todos os alertas ativos da filial via WebSocket. */
  async pushAlertsToBranch(branchId: string): Promise<number> {
    const config = await this.loadBranchConfig(branchId);
    if (!config.adminAlertsEnabled) {
      return 0;
    }

    const context: AdminAlertContext = {
      branchId,
      userId: 'system',
      config,
    };

    const batches = await Promise.all(
      this.providers.map((provider) => provider.getAlerts(context)),
    );
    const alerts = batches.flat();

    for (const alert of alerts) {
      this.emitAlert(branchId, alert);
    }

    return alerts.length;
  }

  async runStaleAlertsForAllBranches(): Promise<{
    branches: number;
    alerts: number;
  }> {
    const branches = await prisma.branch.findMany({
      where: { active: true },
      select: { id: true },
    });

    let totalAlerts = 0;
    for (const branch of branches) {
      totalAlerts += await this.pushAlertsToBranch(branch.id);
    }

    return { branches: branches.length, alerts: totalAlerts };
  }

  /** @deprecated Use pushAlertsToBranch */
  async pushStaleCashAlertsToBranch(branchId: string): Promise<number> {
    return this.pushAlertsToBranch(branchId);
  }

  /** @deprecated Use runStaleAlertsForAllBranches */
  async runStaleCashAlertsForAllBranches(): Promise<{
    branches: number;
    alerts: number;
  }> {
    return this.runStaleAlertsForAllBranches();
  }

  private emitAlert(branchId: string, alert: AdminAlertDto): void {
    this.wsGateway.emitBranchNotification(branchId, {
      type: alert.type,
      title: alert.title,
      message: alert.message,
      data: {
        id: alert.id,
        entityId: alert.entityId,
        href: alert.href,
        severity: alert.severity,
        metadata: alert.metadata,
        createdAt: alert.createdAt,
      },
    });
  }

  private async loadBranchConfig(
    branchId: string,
  ): Promise<AdminAlertBranchConfig> {
    const generalConfig = await prisma.generalConfig.findUnique({
      where: { branchId },
    });

    return {
      adminAlertsEnabled: generalConfig?.adminAlertsEnabled ?? true,
      cashSessionStaleAlertEnabled:
        generalConfig?.cashSessionStaleAlertEnabled ?? true,
      cashSessionMaxOpenDays: Math.max(
        1,
        generalConfig?.cashSessionMaxOpenDays ?? 1,
      ),
      orderStaleAlertEnabled: generalConfig?.orderStaleAlertEnabled ?? true,
      orderMaxPendingMinutes: Math.max(
        5,
        generalConfig?.orderMaxPendingMinutes ?? 30,
      ),
      orderUnpaidStaleAlertEnabled:
        generalConfig?.orderUnpaidStaleAlertEnabled ?? true,
      orderMaxUnpaidDays: Math.max(1, generalConfig?.orderMaxUnpaidDays ?? 1),
    };
  }

  private async getReadEntityIds(
    userId: string,
    alerts: AdminAlertDto[],
  ): Promise<Set<string>> {
    if (alerts.length === 0) {
      return new Set();
    }

    const entityIds = alerts.map((a) => a.entityId);
    const reads = await prisma.notificationRead.findMany({
      where: {
        userId,
        entityType: NotificationEntityType.SYSTEM,
        entityId: { in: entityIds },
      },
      select: { entityId: true },
    });

    return new Set(reads.map((r) => r.entityId));
  }
}
