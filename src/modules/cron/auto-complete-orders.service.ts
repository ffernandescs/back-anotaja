import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryType,
  DispatchStatus,
  OrderStatus,
  PreparationStatus,
} from '@prisma/client';
import { prisma } from 'lib/prisma';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';

const AUTO_COMPLETE_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

@Injectable()
export class AutoCompleteOrdersService {
  private readonly logger = new Logger(AutoCompleteOrdersService.name);

  constructor(private readonly webSocketGateway: OrdersWebSocketGateway) {}

  /** Finaliza pedidos com mais de 24h nas filiais com autoCompleteOrders ativo. */
  async runForAllBranches(): Promise<{ branches: number; orders: number }> {
    const configs = await prisma.generalConfig.findMany({
      where: { autoCompleteOrders: true },
      select: { branchId: true },
    });

    if (configs.length === 0) {
      return { branches: 0, orders: 0 };
    }

    const threshold = new Date(Date.now() - AUTO_COMPLETE_MS);
    let totalOrders = 0;

    for (const { branchId } of configs) {
      totalOrders += await this.completeStaleOrdersForBranch(branchId, threshold);
    }

    return { branches: configs.length, orders: totalOrders };
  }

  private async completeStaleOrdersForBranch(
    branchId: string,
    threshold: Date,
  ): Promise<number> {
    const orders = await prisma.order.findMany({
      where: {
        branchId,
        status: { notIn: TERMINAL_STATUSES },
        createdAt: { lt: threshold },
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        deliveryType: true,
        dispatchStatus: true,
        preparationStatus: true,
        deliveryPersonId: true,
        tableId: true,
      },
    });

    if (orders.length === 0) {
      return 0;
    }

    for (const order of orders) {
      const data: {
        status: OrderStatus;
        dispatchStatus?: DispatchStatus;
        preparationStatus?: PreparationStatus;
      } = {
        status: OrderStatus.COMPLETED,
      };

      if (
        order.deliveryType === DeliveryType.DELIVERY &&
        order.dispatchStatus !== DispatchStatus.DELIVERED
      ) {
        data.dispatchStatus = DispatchStatus.DELIVERED;
      }

      if (
        order.preparationStatus === PreparationStatus.PENDING ||
        order.preparationStatus === PreparationStatus.PREPARING
      ) {
        data.preparationStatus = PreparationStatus.READY;
      }

      await prisma.order.update({
        where: { id: order.id },
        data,
      });

      await this.webSocketGateway.emitOrderUpdate(
        {
          id: order.id,
          status: OrderStatus.COMPLETED,
          branchId: order.branchId,
          deliveryPersonId: order.deliveryPersonId,
          tableId: order.tableId,
        },
        'order:status_changed',
      );
    }

    this.logger.log(
      `Filial ${branchId}: ${orders.length} pedido(s) finalizado(s) automaticamente (24h)`,
    );

    return orders.length;
  }
}
