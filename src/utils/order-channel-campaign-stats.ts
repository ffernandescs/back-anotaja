/** Status de mensagem de campanha (Evolution → interno). */
export type OrderChannelCampaignMessageStatus =
  | 'pending'
  | 'processed'
  | 'sent'
  | 'read'
  | 'failed';

const STATUS_RANK: Record<OrderChannelCampaignMessageStatus, number> = {
  pending: 0,
  failed: 1,
  processed: 2,
  sent: 3,
  read: 4,
};

export function mapEvolutionAckToCampaignMessageStatus(
  raw?: number | string | null,
): OrderChannelCampaignMessageStatus | null {
  if (raw === undefined || raw === null) return null;

  if (typeof raw === 'number') {
    const map: Record<number, OrderChannelCampaignMessageStatus> = {
      0: 'failed',
      1: 'processed',
      2: 'sent',
      3: 'sent',
      4: 'read',
    };
    return map[raw] ?? null;
  }

  const s = String(raw).toUpperCase();
  if (s === 'READ' || s === 'PLAYED') return 'read';
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'RECEIVED' || s === 'SERVER_ACK' || s === 'SENT') {
    return 'sent';
  }
  if (s === 'PENDING') return 'processed';
  if (s === 'ERROR' || s === 'FAILED') return 'failed';
  // Status já normalizado pelo webhook CRM (`mapStatus`)
  if (s === 'RECEIVED') return 'sent';

  return null;
}

/** Só avança o status (não regride read → sent). */
export function shouldAdvanceCampaignMessageStatus(
  current: string,
  next: OrderChannelCampaignMessageStatus,
): boolean {
  const cur = (current in STATUS_RANK ? current : 'pending') as OrderChannelCampaignMessageStatus;
  if (cur === 'failed') return next === 'failed';
  return STATUS_RANK[next] >= STATUS_RANK[cur];
}

export interface OrderChannelCampaignListStats {
  recipientCount: number;
  processedCount: number;
  sentCount: number;
  readCount: number;
  failedCount: number;
}

export function countCampaignMessagesByStatus(
  rows: Array<{ status: string }>,
): OrderChannelCampaignListStats {
  let processedCount = 0;
  let sentCount = 0;
  let readCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    switch (row.status) {
      case 'processed':
        processedCount++;
        break;
      case 'sent':
        processedCount++;
        sentCount++;
        break;
      case 'read':
        processedCount++;
        sentCount++;
        readCount++;
        break;
      case 'failed':
        failedCount++;
        break;
      default:
        break;
    }
  }

  return {
    recipientCount: rows.length,
    processedCount,
    sentCount,
    readCount,
    failedCount,
  };
}
