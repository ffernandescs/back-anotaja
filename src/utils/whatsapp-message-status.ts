const STATUS_RANK: Record<string, number> = {
  error: 0,
  pending: 1,
  sent: 2,
  received: 3,
  read: 4,
};

export function mergeWhatsAppMessageStatus(
  current: string | null | undefined,
  incoming: string,
): string {
  const cur = (current ?? 'pending').toLowerCase();
  const next = (incoming ?? 'sent').toLowerCase();
  const curRank = STATUS_RANK[cur] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;
  return nextRank >= curRank ? next : cur;
}

export function mapEvolutionMessageStatus(status?: number | string | null): string {
  if (typeof status === 'number') {
    const map: Record<number, string> = {
      0: 'error',
      1: 'pending',
      2: 'sent',
      3: 'received',
      4: 'read',
      5: 'read',
    };
    return map[status] ?? 'sent';
  }

  const s = String(status ?? '').toUpperCase();
  if (s === 'ERROR' || s === 'FAILED') return 'error';
  if (s === 'PENDING') return 'pending';
  if (s === 'SERVER_ACK' || s === 'SENT') return 'sent';
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'RECEIVED') return 'received';
  if (s === 'READ' || s === 'PLAYED') return 'read';
  return 'sent';
}

/** Extrai o status mais avançado disponível no payload da Evolution. */
export function extractMessageStatusFromEvolution(msg: unknown): string {
  const m = msg as Record<string, unknown> | null | undefined;
  if (!m) return 'sent';

  const direct = m.status ?? m.messageStatus;
  if (direct != null) return mapEvolutionMessageStatus(direct as string | number);

  const ack = m.ack;
  if (typeof ack === 'number') return mapEvolutionMessageStatus(ack);

  const updates = m.MessageUpdate ?? m.messageUpdate;
  if (Array.isArray(updates) && updates.length > 0) {
    let best = 'sent';
    for (const u of updates) {
      const row = u as Record<string, unknown>;
      const nested =
        row.update && typeof row.update === 'object'
          ? (row.update as Record<string, unknown>)
          : undefined;
      const st = row.status ?? nested?.status ?? row.updateStatus;
      if (st == null) continue;
      best = mergeWhatsAppMessageStatus(best, mapEvolutionMessageStatus(st as string | number));
    }
    return best;
  }

  return 'sent';
}
