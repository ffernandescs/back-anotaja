import { Injectable } from '@nestjs/common';
import { CashSessionStatus } from '@prisma/client';
import {
  AdminAlertContext,
  AdminAlertDto,
  AdminAlertType,
} from '../admin-alerts.types';
import { AdminAlertProvider } from './admin-alert-provider.interface';
import { prisma } from 'lib/prisma';

@Injectable()
export class CashSessionStaleAlertProvider implements AdminAlertProvider {
  readonly type = AdminAlertType.CASH_SESSION_STALE;

  async getAlerts(context: AdminAlertContext): Promise<AdminAlertDto[]> {
    const { branchId, config } = context;

    if (!config.adminAlertsEnabled || !config.cashSessionStaleAlertEnabled) {
      return [];
    }

    const maxDays = Math.max(1, config.cashSessionMaxOpenDays ?? 1);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - maxDays);

    const sessions = await prisma.cashSession.findMany({
      where: {
        branchId,
        status: CashSessionStatus.OPEN,
        openedAt: { lt: threshold },
      },
      include: {
        openedByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { openedAt: 'asc' },
    });

    const now = Date.now();

    return sessions.map((session) => {
      const openedAt = session.openedAt;
      const daysOpen = Math.max(
        1,
        Math.floor((now - openedAt.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const operatorName =
        session.openedByUser?.name?.trim() || 'Operador';

      return {
        id: `${AdminAlertType.CASH_SESSION_STALE}:${session.id}`,
        type: AdminAlertType.CASH_SESSION_STALE,
        severity: daysOpen >= maxDays * 2 ? 'critical' : 'warning',
        title: 'Caixa aberto há muito tempo',
        message: `${operatorName} — aberto há ${daysOpen} dia(s) (desde ${openedAt.toLocaleDateString('pt-BR')}). Feche o caixa no PDV se o turno já terminou.`,
        href: '/admin/financial/cash',
        entityId: session.id,
        metadata: {
          cashSessionId: session.id,
          openedByUserId: session.openedBy,
          openedByName: operatorName,
          openedAt: openedAt.toISOString(),
          daysOpen,
          maxOpenDays: maxDays,
        },
        createdAt: openedAt.toISOString(),
        read: false,
      };
    });
  }
}
