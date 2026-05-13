export function countOrders(orders: any[] = []) {
  return {
    novos: orders.filter(o => o.status === 'PENDING').length,
    pendentes: orders.filter(o => o.status === 'CONFIRMED').length,
    saiuParaEntrega: orders.filter(o => o.status === 'READY').length,
    concluidos: orders.filter(o => o.status === 'DONE' || o.status === 'DELIVERED').length,
  };
}