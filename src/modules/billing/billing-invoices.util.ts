import type { Invoice, SubscriptionHistory } from '@prisma/client';
import type Stripe from 'stripe';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  CAKTO_ACTIVATE_EVENTS,
  CAKTO_AWAITING_PAYMENT_EVENTS,
  CAKTO_SUSPEND_EVENTS,
  CAKTO_WEBHOOK_EVENTS,
} from './cakto-webhook.events';
import type { CaktoWebhookHistoryMetadata } from './cakto-webhook-history.util';

export type BillingInvoiceStatus = 'PAID' | 'PENDING' | 'FAILED';

export interface BillingInvoiceDto {
  id: string;
  number: string;
  amount: number;
  formattedAmount: string;
  status: BillingInvoiceStatus;
  date: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  description: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  provider: 'STRIPE' | 'CAKTO' | 'ASAAS' | null;
  providerLabel: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  STRIPE: 'Stripe',
  CAKTO: 'Cakto',
  ASAAS: 'Asaas',
};

const HISTORY_INVOICE_EVENT_TYPES = new Set([
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'ACTIVATED',
  'RENEWED',
]);

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asCaktoMeta(
  meta: Record<string, unknown> | null,
): CaktoWebhookHistoryMetadata | null {
  if (!meta || meta.provider !== 'CAKTO') return null;
  return meta as CaktoWebhookHistoryMetadata;
}

function isHistoryInvoiceEntry(entry: SubscriptionHistory): boolean {
  if (HISTORY_INVOICE_EVENT_TYPES.has(entry.eventType)) {
    return true;
  }

  const meta = parseMetadata(entry.metadata);
  const cakto = asCaktoMeta(meta);
  if (!cakto?.caktoEvent) return false;

  return (
    CAKTO_ACTIVATE_EVENTS.has(cakto.caktoEvent) ||
    CAKTO_AWAITING_PAYMENT_EVENTS.has(cakto.caktoEvent) ||
    CAKTO_SUSPEND_EVENTS.has(cakto.caktoEvent) ||
    cakto.caktoEvent === CAKTO_WEBHOOK_EVENTS.refund ||
    cakto.caktoEvent === CAKTO_WEBHOOK_EVENTS.chargeback
  );
}

function resolveHistoryStatus(
  entry: SubscriptionHistory,
  meta: Record<string, unknown> | null,
): BillingInvoiceStatus {
  if (entry.eventType === 'PAYMENT_FAILED') return 'FAILED';

  const cakto = asCaktoMeta(meta);
  if (cakto?.caktoEvent) {
    if (CAKTO_SUSPEND_EVENTS.has(cakto.caktoEvent)) return 'FAILED';
    if (
      cakto.caktoEvent === CAKTO_WEBHOOK_EVENTS.refund ||
      cakto.caktoEvent === CAKTO_WEBHOOK_EVENTS.chargeback
    ) {
      return 'FAILED';
    }
    if (CAKTO_AWAITING_PAYMENT_EVENTS.has(cakto.caktoEvent)) return 'PENDING';
    if (CAKTO_ACTIVATE_EVENTS.has(cakto.caktoEvent)) return 'PAID';
  }

  if (entry.eventType === 'ACTIVATED' || entry.eventType === 'RENEWED') {
    return 'PAID';
  }

  return entry.amount && entry.amount > 0 ? 'PAID' : 'PENDING';
}

function resolveProvider(
  meta: Record<string, unknown> | null,
  fallback?: string | null,
): BillingInvoiceDto['provider'] {
  const p = meta?.provider;
  if (p === 'STRIPE' || p === 'CAKTO' || p === 'ASAAS') return p;
  if (fallback === 'STRIPE' || fallback === 'CAKTO' || fallback === 'ASAAS') {
    return fallback;
  }
  return null;
}

function buildHistoryDescription(
  entry: SubscriptionHistory,
  meta: Record<string, unknown> | null,
  planName?: string | null,
): string {
  const cakto = asCaktoMeta(meta);
  const dateLabel = entry.createdAt.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  if (cakto?.caktoProductName) {
    return `${cakto.caktoProductName} — ${dateLabel}`;
  }

  if (planName) {
    return `${planName} — ${dateLabel}`;
  }

  if (entry.reason?.trim()) {
    return entry.reason.trim();
  }

  const labels: Record<string, string> = {
    PAYMENT_SUCCEEDED: 'Pagamento da assinatura',
    PAYMENT_FAILED: 'Falha no pagamento',
    ACTIVATED: 'Ativação da assinatura',
    RENEWED: 'Renovação da assinatura',
  };

  return `${labels[entry.eventType] ?? 'Cobrança'} — ${dateLabel}`;
}

export function mapStripeInvoiceToDto(inv: Stripe.Invoice, planName?: string): BillingInvoiceDto {
  const amount = inv.amount_paid || inv.amount_due || 0;
  const date = new Date(inv.created * 1000);

  return {
    id: inv.id,
    number: inv.number || `INV-${inv.id.slice(-8)}`,
    amount,
    formattedAmount: formatCurrency(amount),
    status: inv.status === 'paid' ? 'PAID' : 'PENDING',
    date,
    periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
    periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
    description:
      inv.description ||
      `${planName ?? 'Assinatura'} — ${date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
    pdfUrl: inv.invoice_pdf || null,
    hostedUrl: inv.hosted_invoice_url || null,
    provider: 'STRIPE',
    providerLabel: PROVIDER_LABELS.STRIPE,
  };
}

export function mapHistoryEntryToDto(
  entry: SubscriptionHistory & { newPlan?: { name: string } | null },
  subscriptionProvider?: string | null,
  fallbackAmountCents?: number,
): BillingInvoiceDto | null {
  if (!isHistoryInvoiceEntry(entry)) return null;

  const meta = parseMetadata(entry.metadata);
  const provider = resolveProvider(meta, subscriptionProvider);
  const cakto = asCaktoMeta(meta);
  const status = resolveHistoryStatus(entry, meta);

  let amount = entry.amount && entry.amount > 0 ? entry.amount : 0;
  if (
    amount === 0 &&
    status === 'PAID' &&
    fallbackAmountCents &&
    fallbackAmountCents > 0
  ) {
    amount = fallbackAmountCents;
  }

  const ref =
    cakto?.caktoRefId ||
    cakto?.caktoOrderId ||
    (typeof meta?.asaasPaymentId === 'string' ? meta.asaasPaymentId : null) ||
    entry.stripeEventId?.replace(/^cakto:/, '').split(':')[0];

  const number = ref
    ? `${provider ?? 'PAG'}-${String(ref).slice(-8).toUpperCase()}`
    : `HIST-${entry.id.slice(-8).toUpperCase()}`;

  return {
    id: `hist-${entry.id}`,
    number,
    amount,
    formattedAmount: amount > 0 ? formatCurrency(amount) : '—',
    status,
    date: entry.createdAt,
    periodStart: null,
    periodEnd: null,
    description: buildHistoryDescription(entry, meta, entry.newPlan?.name),
    pdfUrl: null,
    hostedUrl: null,
    provider,
    providerLabel: provider ? PROVIDER_LABELS[provider] : null,
  };
}

export function mapDbInvoiceToDto(inv: Invoice, planName?: string): BillingInvoiceDto {
  const statusMap: Record<string, BillingInvoiceStatus> = {
    PAID: 'PAID',
    PENDING: 'PENDING',
    FAILED: 'FAILED',
    VOID: 'FAILED',
  };

  return {
    id: inv.id,
    number: inv.stripeInvoiceId
      ? `INV-${inv.stripeInvoiceId.slice(-8)}`
      : `DB-${inv.id.slice(-8).toUpperCase()}`,
    amount: inv.amount,
    formattedAmount: formatCurrency(inv.amount),
    status: statusMap[inv.status] ?? 'PENDING',
    date: inv.paidAt ?? inv.createdAt,
    periodStart: inv.billingPeriodStart,
    periodEnd: inv.billingPeriodEnd,
    description: `${planName ?? 'Assinatura'} — ${inv.billingPeriodStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
    pdfUrl: null,
    hostedUrl: null,
    provider: 'STRIPE',
    providerLabel: PROVIDER_LABELS.STRIPE,
  };
}

export function mergeBillingInvoices(
  lists: BillingInvoiceDto[][],
  limit = 20,
): BillingInvoiceDto[] {
  const seen = new Set<string>();
  const merged: BillingInvoiceDto[] = [];

  const all = lists.flat().sort((a, b) => b.date.getTime() - a.date.getTime());

  for (const item of all) {
    const dedupeKey =
      item.hostedUrl ||
      item.pdfUrl ||
      item.number ||
      item.id;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}

export async function fetchStripeInvoices(
  stripeClient: Stripe,
  stripeSubscriptionId: string,
  planName?: string,
): Promise<BillingInvoiceDto[]> {
  const stripeInvoices = await stripeClient.invoices.list({
    subscription: stripeSubscriptionId,
    limit: 15,
  });

  return stripeInvoices.data
    .filter((inv) => inv.status === 'paid' || inv.status === 'open')
    .map((inv) => mapStripeInvoiceToDto(inv, planName));
}
