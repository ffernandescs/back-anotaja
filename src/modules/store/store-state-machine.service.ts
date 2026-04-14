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
  uiEvent?: 'OPEN_DRIVER_MODAL' | 'OPEN_PAYMENT_MODAL';
};

export enum OrderAction {
  CONFIRM = 'CONFIRM',
  START_COOKING = 'START_COOKING',
  MARK_READY = 'MARK_READY',
  ASSIGN_DRIVER = 'ASSIGN_DRIVER',
  START_DELIVERY = 'START_DELIVERY',
  MARK_DELIVERED = 'MARK_DELIVERED',
  COMPLETE = 'COMPLETE',
  CANCEL = 'CANCEL',
}

export const ACTION_TO_STATUS: Record<Exclude<OrderAction, 'ASSIGN_DRIVER'>, OrderStatus> = {
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
  moveByAction(order: Order, action: OrderAction, deliveryPersonId?: string) {
    // Atribuição de entregador sem mudar status
    if (action === OrderAction.ASSIGN_DRIVER) {
      if (!deliveryPersonId) {
        throw new BadRequestException('deliveryPersonId é obrigatório para ASSIGN_DRIVER');
      }
      if (order.deliveryType !== DeliveryType.DELIVERY) {
        throw new BadRequestException('Pedido não é delivery');
      }
      if (order.status !== OrderStatus.READY) {
        throw new BadRequestException('Pedido precisa estar READY para atribuir entregador');
      }
      return { deliveryPersonId };
    }

    const target = ACTION_TO_STATUS[action as Exclude<OrderAction, 'ASSIGN_DRIVER'>];

    this.validateTransition(order, target, deliveryPersonId);

    const updates = this.buildUpdate(order, target);

    // Se deliveryPersonId fornecido junto com START_DELIVERY, atribui na mesma chamada
    if (deliveryPersonId && action === OrderAction.START_DELIVERY) {
      (updates as any).deliveryPersonId = deliveryPersonId;
    }

    return updates;
  }

  getAvailableTransitions(order: Order): AvailableTransition[] {
    const allowedStatuses = ORDER_TRANSITIONS[order.status] || [];

    return allowedStatuses
      .map((status): AvailableTransition | null => {
        const action = Object.entries(ACTION_TO_STATUS).find(
          ([, value]) => value === status,
        )?.[0] as OrderAction | undefined;

        if (!action) return null;

        // 🚫 regra: não mostrar delivery para não-delivery
        if (
          order.deliveryType !== DeliveryType.DELIVERY &&
          status === OrderStatus.DELIVERING
        ) {
          return null;
        }

        const transition: AvailableTransition = {
          status,
          action,
        };

        // 🚨 1. precisa atribuir entregador
        if (
          status === OrderStatus.DELIVERING &&
          order.deliveryType === DeliveryType.DELIVERY &&
          !order.deliveryPersonId
        ) {
          transition.uiEvent = 'OPEN_DRIVER_MODAL';
        }

        // 🚨 2. precisa pagamento
        if (
          status === OrderStatus.COMPLETED &&
          order.paymentStatus !== PaymentStatus.PAID
        ) {
          transition.uiEvent = 'OPEN_PAYMENT_MODAL';
        }

        return transition;
      })
      .filter(Boolean) as AvailableTransition[];
  }

  private validateTransition(order: Order, target: OrderStatus, incomingDeliveryPersonId?: string) {
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

    // Precisa de entregador — aceita o que vem no body se ainda não estiver no pedido
    if (
      order.status === OrderStatus.READY &&
      target === OrderStatus.DELIVERING &&
      order.deliveryType === DeliveryType.DELIVERY &&
      !order.deliveryPersonId &&
      !incomingDeliveryPersonId
    ) {
      throw new BadRequestException('Precisa selecionar entregador primeiro');
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
      if (order.paymentStatus === PaymentStatus.PAID) {
        updates.paymentStatus = PaymentStatus.PAID;
      }
      break;

    case OrderStatus.CANCELLED:
      updates.paymentStatus = PaymentStatus.CANCELLED;
      break;
  }

  return updates;
}
}