import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { prisma } from 'lib/prisma';
import {
  AdminAlertContext,
  AdminAlertDto,
  AdminAlertType,
} from '../admin-alerts.types';
import { AdminAlertProvider } from './admin-alert-provider.interface';

const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

@Injectable()
export class OrderUnpaidStaleAlertProvider implements AdminAlertProvider {
  readonly type = AdminAlertType.ORDER_UNPAID_STALE;

  async getAlerts(context: AdminAlertContext): Promise<AdminAlertDto[]> {
    const { branchId, config } = context;

    if (!config.adminAlertsEnabled || !config.orderUnpaidStaleAlertEnabled) {
      return [];
    }

    const maxDays = Math.max(1, config.orderMaxUnpaidDays ?? 1);
    // Janela contínua: 1 dia = 24h (facilita teste e evita confusão com meia-noite)
    const threshold = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

    const candidates = await prisma.order.findMany({
      where: {
        branchId,
        status: { notIn: TERMINAL_STATUSES },
        createdAt: { lt: threshold },
        NOT: { paymentStatus: 'PAID' },
      },
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const orders = candidates.filter(
      (order) => (order.paidAmount ?? 0) < order.total,
    );

    const now = Date.now();

    return orders.slice(0, 50).map((order) => {
      const createdAt = order.createdAt;
      const daysOpen = Math.max(
        1,
        Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const customerName = order.customer?.name?.trim() || 'Cliente';
      const orderLabel = order.orderNumber
        ? `#${order.orderNumber}`
        : order.id.slice(0, 8).toUpperCase();
      const pendingCents = Math.max(0, order.total - (order.paidAmount ?? 0));
      const pendingReais = (pendingCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const paymentLabel =
        (order.paidAmount ?? 0) > 0 ? 'parcialmente pago' : 'não pago';

      return {
        id: `${AdminAlertType.ORDER_UNPAID_STALE}:${order.id}`,
        type: AdminAlertType.ORDER_UNPAID_STALE,
        severity: daysOpen >= maxDays * 2 ? 'critical' : 'warning',
        title: 'Pedido com pagamento pendente',
        message: `${orderLabel} — ${customerName}: ${paymentLabel} há ${daysOpen} dia(s) (pendente ${pendingReais}). Finalize o pagamento ou feche o pedido.`,
        href: `/admin/kanban?orderId=${order.id}`,
        entityId: `unpaid:${order.id}`,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName,
          daysOpen,
          maxUnpaidDays: maxDays,
          paymentStatus: order.paymentStatus,
          total: order.total,
          paidAmount: order.paidAmount,
          pendingAmount: pendingCents,
          orderStatus: order.status,
        },
        createdAt: createdAt.toISOString(),
        read: false,
      };
    });
  }
}
