const URGENCY: Record<string, number> = {
  DELIVERING: 1,
  READY: 2,
  IN_PROGRESS: 3,
  CONFIRMED: 4,
  PENDING: 5,
  DELIVERED: 50,
  COMPLETED: 51,
  CANCELLED: 99,
};

export function orderLeadUrgencyRank(status: string): number {
  return URGENCY[status] ?? 100;
}

function rankTime(d?: Date | null): number {
  return d instanceof Date ? d.getTime() : 0;
}

/** Última atividade conhecida do pedido (status muda → updatedAt; fallback createdAt). */
function latestOrderActivityMs(o: {
  updatedAt?: Date | null;
  createdAt?: Date | null;
}): number {
  return Math.max(rankTime(o.updatedAt), rankTime(o.createdAt));
}

/**
 * Badge do chat: **sempre** o status do pedido com atividade mais recente (cadeia temporal),
 * não a “urgência” fixa — assim IN_PROGRESS recém-atualizado aparece mesmo com pedidos
 * antigos em outros status.
 */
export function pickLeadOrderForChatBadge(
  orders: ReadonlyArray<{
    status: string;
    updatedAt?: Date | null;
    createdAt?: Date | null;
  }>,
): { status: string; label: string } | null {
  if (!orders.length) return null;

  const sorted = [...orders].sort((a, b) => {
    const diff = latestOrderActivityMs(b) - latestOrderActivityMs(a);
    if (diff !== 0) return diff;
    return orderLeadUrgencyRank(a.status) - orderLeadUrgencyRank(b.status);
  });

  const top = sorted[0];
  return { status: top.status, label: orderStatusBadgeLabelPt(top.status) };
}

export function orderStatusBadgeLabelPt(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendente',
    CONFIRMED: 'Confirmado',
    IN_PROGRESS: 'Preparando',
    READY: 'Pronto',
    DELIVERING: 'Em entrega',
    DELIVERED: 'Entregue',
    COMPLETED: 'Concluído',
    CANCELLED: 'Cancelado',
  };
  return m[status] ?? status;
}

export function pickBetterLeadOrderStatus(
  a?: string | null,
  b?: string | null,
): string | null {
  const sa = typeof a === 'string' ? a.trim() : '';
  const sb = typeof b === 'string' ? b.trim() : '';
  if (!sa) return sb || null;
  if (!sb) return sa || null;
  const d = orderLeadUrgencyRank(sa) - orderLeadUrgencyRank(sb);
  return d <= 0 ? sa : sb;
}
