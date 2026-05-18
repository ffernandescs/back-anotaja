import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { prisma } from 'lib/prisma';
import {
  AdminAlertContext,
  AdminAlertDto,
  AdminAlertType,
} from '../admin-alerts.types';
import { AdminAlertProvider } from './admin-alert-provider.interface';

function formatWaitLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${rest}min`;
}

@Injectable()
export class OrderStaleAlertProvider implements AdminAlertProvider {
  readonly type = AdminAlertType.ORDER_STALE;

  async getAlerts(context: AdminAlertContext): Promise<AdminAlertDto[]> {
    const { branchId, config } = context;

    if (!config.adminAlertsEnabled || !config.orderStaleAlertEnabled) {
      return [];
    }

    const maxMinutes = Math.max(5, config.orderMaxPendingMinutes ?? 30);
    const threshold = new Date(Date.now() - maxMinutes * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        branchId,
        status: OrderStatus.PENDING,
        createdAt: { lt: threshold },
      },
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const now = Date.now();

    return orders.map((order) => {
      const createdAt = order.createdAt;
      const minutesWaiting = Math.max(
        1,
        Math.floor((now - createdAt.getTime()) / (1000 * 60)),
      );
      const customerName =
        order.customer?.name?.trim() || 'Cliente';
      const orderLabel = order.orderNumber
        ? `#${order.orderNumber}`
        : order.id.slice(0, 8).toUpperCase();

      return {
        id: `${AdminAlertType.ORDER_STALE}:${order.id}`,
        type: AdminAlertType.ORDER_STALE,
        severity:
          minutesWaiting >= maxMinutes * 2 ? 'critical' : 'warning',
        title: 'Pedido pendente há muito tempo',
        message: `${orderLabel} — ${customerName} aguardando há ${formatWaitLabel(minutesWaiting)}. Confirme ou cancele no kanban.`,
        href: `/admin/kanban?orderId=${order.id}`,
        entityId: order.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName,
          minutesWaiting,
          maxPendingMinutes: maxMinutes,
          deliveryType: order.deliveryType,
          total: order.total,
        },
        createdAt: createdAt.toISOString(),
        read: false,
      };
    });
  }
}
