import { DeliveryType, Order, OrderStatus } from '@prisma/client';
import { prisma } from 'lib/prisma';
import { OrderAction, OrderStateMachineService } from './store-state-machine.service';

type KanbanColumnKey =
  | 'pending'
  | 'confirmed'
  | 'inProgress'
  | 'ready'
  | 'waitingDriver'
  | 'onTheWay'
  | 'delivered'
  | 'completed'
  | 'cancelled';

type AvailableTransition = {
  status: OrderStatus;
  action: OrderAction;
};

type EnrichedOrder = Order & {
  items: any[];
  customer: any;
  deliveryPerson: any;
  availableTransitions: AvailableTransition[];
};

type KanbanResponse = Record<KanbanColumnKey, EnrichedOrder[]>;

export async function getKanbanOrders(userId: string): Promise<KanbanResponse> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
  });

  if (!user) throw new Error('Usuário não encontrado');

  const orders = await prisma.order.findMany({
    where: {
      branch: {
        users: {
          some: { id: userId },
        },
      },
    },
    include: {
      items: true,
      customer: true,
      deliveryPerson: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const stateMachine = new OrderStateMachineService();

  const enrichedOrders: EnrichedOrder[] = orders.map((order) => ({
    ...order,
    availableTransitions: stateMachine.getAvailableTransitions(order),
  }));

  const columns: KanbanResponse = {
    pending: [],
    confirmed: [],
    inProgress: [],
    ready: [],
    waitingDriver: [],
    onTheWay: [],
    delivered: [],
    completed: [],
    cancelled: [],
  };

  for (const order of enrichedOrders) {
    switch (order.status) {
      case 'PENDING':
        columns.pending.push(order);
        break;

      case 'CONFIRMED':
        columns.confirmed.push(order);
        break;

      case 'IN_PROGRESS':
        columns.inProgress.push(order);
        break;

      case 'READY':
        if (
          order.deliveryType === DeliveryType.DELIVERY &&
          order.dispatchStatus === 'WAITING_DRIVER'
        ) {
          columns.waitingDriver.push(order);
        } else {
          columns.ready.push(order);
        }
        break;

      case 'DELIVERING':
        columns.onTheWay.push(order);
        break;

      case 'DELIVERED':
        columns.delivered.push(order);
        break;

      case 'COMPLETED':
        columns.completed.push(order);
        break;

      case 'CANCELLED':
        columns.cancelled.push(order);
        break;
    }
  }

  return columns;
}