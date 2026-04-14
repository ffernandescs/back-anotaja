export type KanbanColumnKey =
  | 'pending'
  | 'confirmed'
  | 'inProgress'
  | 'ready'
  | 'waitingDriver'
  | 'onTheWay'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type KanbanData = Record<KanbanColumnKey, any[]>;

export function buildKanban(
  orders: any[],
  columns: KanbanColumnKey[],
): KanbanData {
  const result = {} as KanbanData;

  // init
  for (const col of columns) {
    result[col] = [];
  }

  for (const order of orders) {
    switch (order.status) {
      case 'PENDING':
        result.pending.push(order);
        break;

      case 'CONFIRMED':
        result.confirmed.push(order);
        break;

      case 'PREPARING':
      case 'IN_PROGRESS':
        result.inProgress.push(order);
        break;

      case 'READY':
        result.ready.push(order);
        break;

      case 'COMPLETED':
        result.completed.push(order);
        break;

      case 'CANCELLED':
        result.cancelled.push(order);
        break;
    }

    // ===== DELIVERY FLOW =====
    if (order.deliveryType === 'DELIVERY') {
      if (order.dispatchStatus === 'WAITING_DRIVER') {
        result.waitingDriver.push(order);
      }

      if (order.dispatchStatus === 'PICKED_UP') {
        result.onTheWay.push(order);
      }

      if (order.dispatchStatus === 'DELIVERED') {
        result.delivered.push(order);
      }
    }
  }

  return result;
}