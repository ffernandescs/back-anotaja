import type { SubscriptionEventType } from '@prisma/client';
import { CAKTO_WEBHOOK_EVENTS } from './cakto-webhook.events';

export interface CaktoWebhookHistoryMetadata extends Record<string, unknown> {
  provider: 'CAKTO';
  caktoEvent: string;
  subscriptionId: string;
  companyId?: string;
  planId?: string;
  planName?: string;
  pendingPlanId?: string;
  pendingPlanName?: string;
  integrationId?: string;
  caktoOrderId?: string;
  caktoRefId?: string;
  caktoSubscriptionId?: string;
  caktoProductName?: string;
  paymentMethodName?: string;
  paymentStatus?: string;
}

/** Texto curto para o campo reason (não repetir título do card). */
const CAKTO_REASON_HINT: Record<string, string> = {
  [CAKTO_WEBHOOK_EVENTS.refund]: 'Reembolso',
  [CAKTO_WEBHOOK_EVENTS.chargeback]: 'Chargeback',
  [CAKTO_WEBHOOK_EVENTS.subscription_canceled]: 'Cancelamento na Cakto',
  [CAKTO_WEBHOOK_EVENTS.purchase_approved]: 'Pagamento confirmado',
  [CAKTO_WEBHOOK_EVENTS.subscription_created]: 'Pagamento confirmado',
  [CAKTO_WEBHOOK_EVENTS.subscription_renewed]: 'Renovação',
  [CAKTO_WEBHOOK_EVENTS.purchase_refused]: 'Pagamento recusado',
  [CAKTO_WEBHOOK_EVENTS.subscription_renewal_refused]: 'Renovação recusada',
  [CAKTO_WEBHOOK_EVENTS.pix_gerado]: 'PIX gerado',
  [CAKTO_WEBHOOK_EVENTS.boleto_gerado]: 'Boleto gerado',
  [CAKTO_WEBHOOK_EVENTS.picpay_gerado]: 'PicPay gerado',
  [CAKTO_WEBHOOK_EVENTS.openfinance_nubank_gerado]: 'Pagamento Nubank',
  [CAKTO_WEBHOOK_EVENTS.initiate_checkout]: 'Checkout iniciado',
  [CAKTO_WEBHOOK_EVENTS.checkout_abandonment]: 'Checkout abandonado',
  checkout_intent: 'Checkout aberto',
};

export function mapCaktoEventToSubscriptionEventType(
  caktoEvent: string,
): SubscriptionEventType {
  switch (caktoEvent) {
    case CAKTO_WEBHOOK_EVENTS.initiate_checkout:
    case 'checkout_intent':
    case CAKTO_WEBHOOK_EVENTS.pix_gerado:
    case CAKTO_WEBHOOK_EVENTS.boleto_gerado:
    case CAKTO_WEBHOOK_EVENTS.picpay_gerado:
    case CAKTO_WEBHOOK_EVENTS.openfinance_nubank_gerado:
      return 'CREATED';
    case CAKTO_WEBHOOK_EVENTS.checkout_abandonment:
      return 'CREATED';
    case CAKTO_WEBHOOK_EVENTS.purchase_approved:
    case CAKTO_WEBHOOK_EVENTS.subscription_created:
      return 'ACTIVATED';
    case CAKTO_WEBHOOK_EVENTS.subscription_renewed:
      return 'RENEWED';
    case CAKTO_WEBHOOK_EVENTS.refund:
    case CAKTO_WEBHOOK_EVENTS.chargeback:
    case CAKTO_WEBHOOK_EVENTS.subscription_canceled:
      return 'CANCELLED';
    case CAKTO_WEBHOOK_EVENTS.purchase_refused:
    case CAKTO_WEBHOOK_EVENTS.subscription_renewal_refused:
      return 'PAYMENT_FAILED';
    default:
      return 'CREATED';
  }
}

export function caktoExternalEventId(
  caktoEvent: string,
  data: Record<string, unknown>,
): string | undefined {
  const orderId = typeof data.id === 'string' ? data.id : undefined;
  const refId = typeof data.refId === 'string' ? data.refId : undefined;
  const sub = data.subscription as Record<string, unknown> | undefined;
  const subId = sub && typeof sub.id === 'string' ? sub.id : undefined;

  const key = orderId ?? refId ?? subId;
  if (!key) return undefined;
  return `cakto:${key}:${caktoEvent}`;
}

export function amountToCents(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.round(num * 100);
}

export interface BuildCaktoHistoryContext {
  caktoEvent: string;
  data: Record<string, unknown>;
  subscription: {
    id: string;
    companyId: string;
    planId: string;
    pendingPlanId?: string | null;
    plan?: { id: string; name: string } | null;
    pendingPlan?: { id: string; name: string } | null;
  };
  integrationId?: string;
  productLabel?: string;
}

export function buildCaktoHistoryMetadata(
  ctx: BuildCaktoHistoryContext,
): CaktoWebhookHistoryMetadata {
  const { caktoEvent, data, subscription, integrationId, productLabel } = ctx;

  const productPayload = data.product as Record<string, unknown> | undefined;
  const subPayload = data.subscription as Record<string, unknown> | undefined;

  return {
    provider: 'CAKTO',
    caktoEvent,
    subscriptionId: subscription.id,
    companyId: subscription.companyId,
    planId: subscription.planId,
    planName: subscription.plan?.name,
    pendingPlanId: subscription.pendingPlanId ?? undefined,
    pendingPlanName: subscription.pendingPlan?.name,
    integrationId,
    caktoOrderId: typeof data.id === 'string' ? data.id : undefined,
    caktoRefId: typeof data.refId === 'string' ? data.refId : undefined,
    caktoSubscriptionId:
      subPayload && typeof subPayload.id === 'string'
        ? subPayload.id
        : undefined,
    caktoProductName:
      (typeof productPayload?.name === 'string' && productPayload.name) ||
      productLabel,
    paymentMethodName:
      typeof data.paymentMethodName === 'string'
        ? data.paymentMethodName
        : undefined,
    paymentStatus:
      typeof data.status === 'string' ? data.status : undefined,
  };
}

export function buildCaktoHistoryReason(
  caktoEvent: string,
  metadata: CaktoWebhookHistoryMetadata,
  extraReason?: string,
): string | undefined {
  const parts: string[] = [];
  const hint = CAKTO_REASON_HINT[caktoEvent];

  if (hint) parts.push(hint);
  if (extraReason?.trim()) parts.push(extraReason.trim());

  if (metadata.caktoRefId && parts.length > 0) {
    parts.push(`Ref. ${metadata.caktoRefId}`);
  } else if (metadata.caktoRefId) {
    parts.push(`Ref. ${metadata.caktoRefId}`);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
