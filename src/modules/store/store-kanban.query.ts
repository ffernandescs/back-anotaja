import { DeliveryType } from '@prisma/client';
import { prisma } from 'lib/prisma';

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
  status: string;
  action: string;
};

function getAvailableTransitions(order: any): AvailableTransition[] {
  const isDelivery = order.deliveryType === DeliveryType.DELIVERY;

  switch (order.status) {
    case 'PENDING':
      return [{ status: 'CONFIRMED', action: 'CONFIRM' }];

    case 'CONFIRMED':
      return [{ status: 'IN_PROGRESS', action: 'START_COOKING' }];

    case 'IN_PROGRESS':
      return [{ status: 'READY', action: 'MARK_READY' }];

    case 'READY':
      if (isDelivery) {
        return [{ status: 'WAITING_DRIVER', action: 'START_DELIVERY' }];
      }
      return [{ status: 'COMPLETED', action: 'COMPLETE' }];

    case 'WAITING_DRIVER':
      return [{ status: 'ON_THE_WAY', action: 'START_DELIVERY' }];

    case 'ON_THE_WAY':
      return [{ status: 'DELIVERED', action: 'MARK_DELIVERED' }];

    case 'DELIVERED':
      return [{ status: 'COMPLETED', action: 'COMPLETE' }];

    default:
      return [];
  }
}

export async function getKanbanOrders(userId: string) {
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

  // 🔥 injeta transições aqui
  const enrichedOrders = orders.map((order) => ({
    ...order,
    availableTransitions: getAvailableTransitions(order),
  }));

  return {
    pending: enrichedOrders.filter((o) => o.status === 'PENDING'),

    confirmed: enrichedOrders.filter((o) => o.status === 'CONFIRMED'),

    inProgress: enrichedOrders.filter((o) => o.status === 'IN_PROGRESS'),

    ready: enrichedOrders.filter((o) => o.status === 'READY'),

    delivery: {
      waitingDriver: enrichedOrders.filter(
        (o) =>
          o.deliveryType === DeliveryType.DELIVERY &&
          o.dispatchStatus === 'WAITING_DRIVER',
      ),

      onTheWay: enrichedOrders.filter(
        (o) => o.dispatchStatus === 'PICKED_UP',
      ),

      delivered: enrichedOrders.filter(
        (o) => o.dispatchStatus === 'DELIVERED',
      ),
    },

    completed: enrichedOrders.filter((o) => o.status === 'COMPLETED'),

    cancelled: enrichedOrders.filter((o) => o.status === 'CANCELLED'),
  };
}