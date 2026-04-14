import { BadRequestException } from '@nestjs/common';
import {
  Order,
  OrderStatus,
  DeliveryType,
  DispatchStatus,
  PreparationStatus,
  PaymentStatus,
} from '@prisma/client';

type AvailableTransition = {
  status: OrderStatus;
  action: OrderAction;
};

export enum OrderAction {
  CONFIRM = 'CONFIRM',
  START_COOKING = 'START_COOKING',
  MARK_READY = 'MARK_READY',
  START_DELIVERY = 'START_DELIVERY',
  MARK_DELIVERED = 'MARK_DELIVERED',
  COMPLETE = 'COMPLETE',
  CANCEL = 'CANCEL',
}

export const ACTION_TO_STATUS: Record<OrderAction, OrderStatus> = {
  CONFIRM: OrderStatus.CONFIRMED,
  START_COOKING: OrderStatus.IN_PROGRESS,
  MARK_READY: OrderStatus.READY,
  START_DELIVERY: OrderStatus.DELIVERING,
  MARK_DELIVERED: OrderStatus.DELIVERED,
  COMPLETE: OrderStatus.COMPLETED,
  CANCEL: OrderStatus.CANCELLED,
};


export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],

  CONFIRMED: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],

  IN_PROGRESS: [OrderStatus.READY, OrderStatus.CANCELLED],

  READY: [OrderStatus.DELIVERING, OrderStatus.COMPLETED, OrderStatus.CANCELLED],

  DELIVERING: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],

  DELIVERED: [OrderStatus.COMPLETED],

  COMPLETED: [],

  CANCELLED: [],
};



export type MoveOrderStatus = OrderStatus | 'NEXT' | 'READY' | 'COMPLETED';



export class OrderStateMachineService {
  moveByAction(order: Order, action: OrderAction) {
    const target = ACTION_TO_STATUS[action];

    this.validateTransition(order, target);

    return this.buildUpdate(order, target);
  }

  getAvailableTransitions(order: Order): AvailableTransition[] {
    const allowedStatuses = ORDER_TRANSITIONS[order.status] || [];

    return allowedStatuses
      .map((status) => {
        const action = Object.entries(ACTION_TO_STATUS).find(
          ([, value]) => value === status,
        )?.[0] as OrderAction | undefined;

        if (!action) return null;

        // 🚨 regra extra dinâmica (ex: delivery)
        if (
          order.deliveryType !== DeliveryType.DELIVERY &&
          status === 'DELIVERING'
        ) {
          return null;
        }

        return {
          status,
          action,
        };
      })
      .filter(Boolean) as AvailableTransition[];
  }

  private validateTransition(order: Order, target: OrderStatus) {
    const allowed = ORDER_TRANSITIONS[order.status];

    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Não pode mudar de ${order.status} para ${target}`,
      );
    }

    // 🚚 delivery precisa ser entregue antes de completar
    if (
      order.deliveryType === DeliveryType.DELIVERY &&
      target === OrderStatus.COMPLETED &&
      order.dispatchStatus !== DispatchStatus.DELIVERED
    ) {
      throw new BadRequestException('Entrega não finalizada');
    }

    // 🚫 pickup não pode ir para delivering
    if (
      order.deliveryType !== DeliveryType.DELIVERY &&
      target === OrderStatus.DELIVERING
    ) {
      throw new BadRequestException('Pedido não é delivery');
    }
  }

  private buildUpdate(order: Order, target: OrderStatus) {
    const updates: any = {
      status: target,
    };

    switch (target) {
      case OrderStatus.CONFIRMED:
        updates.preparationStatus = PreparationStatus.PENDING;
        break;

      case OrderStatus.IN_PROGRESS:
        updates.preparationStatus = PreparationStatus.PREPARING;
        break;

      case OrderStatus.READY:
        updates.preparationStatus = PreparationStatus.READY;

        if (order.deliveryType === DeliveryType.DELIVERY) {
          updates.dispatchStatus = DispatchStatus.WAITING_DRIVER;
        }
        break;

      case OrderStatus.DELIVERING:
        updates.dispatchStatus = DispatchStatus.ASSIGNED;
        break;

      case OrderStatus.DELIVERED:
        updates.dispatchStatus = DispatchStatus.DELIVERED;
        break;

      case OrderStatus.COMPLETED:
        updates.paymentStatus = PaymentStatus.PAID;
        break;

      case OrderStatus.CANCELLED:
        updates.paymentStatus = PaymentStatus.CANCELLED;
        break;
    }

    return updates;
  }
}