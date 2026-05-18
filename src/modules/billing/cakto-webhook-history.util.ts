import type { SubscriptionEventType } from '@prisma/client';
import { CAKTO_WEBHOOK_EVENTS } from './cakto-webhook.events';

export interface CaktoWebhookHistoryMetadata extends Record<string, unknown> {
  provider: 'CAKTO';
  caktoEvent: string;
  label: string;
  anotajaSubscriptionId: string;
  anotajaCompanyId?: string;
  anotajaPlanId?: string;
  anotajaPlanName?: string;
  anotajaPendingPlanId?: string;
  anotajaPendingPlanName?: string;
  integrationId?: string;
  caktoOrderId?: string;
  caktoRefId?: string;
  caktoSubscriptionId?: string;
  caktoProductId?: string;
  caktoProductName?: string;
  caktoOfferId?: string;
  caktoOfferName?: string;
  paymentMethod?: string;
  paymentMethodName?: string;
  paymentStatus?: string;
  amount?: number;
  baseAmount?: number;
  paidAt?: string;
  refundedAt?: string;
  canceledAt?: string;
  customerEmail?: string;
  customerName?: string;
  parentOrder?: string;
  checkoutUrl?: string;
}

const CAKTO_EVENT_LABELS: Record<string, string> = {
  [CAKTO_WEBHOOK_EVENTS.initiate_checkout]: 'Início do checkout (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.checkout_abandonment]: 'Abandono de checkout (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.purchase_approved]: 'Compra aprovada (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.purchase_refused]: 'Compra recusada (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.pix_gerado]: 'PIX gerado (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.boleto_gerado]: 'Boleto gerado (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.picpay_gerado]: 'PicPay gerado (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.openfinance_nubank_gerado]: 'Nubank gerado (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.chargeback]: 'Chargeback (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.refund]: 'Reembolso (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.subscription_created]: 'Assinatura criada na Cakto',
  [CAKTO_WEBHOOK_EVENTS.subscription_canceled]: 'Assinatura cancelada na Cakto',
  [CAKTO_WEBHOOK_EVENTS.subscription_renewed]: 'Assinatura renovada (Cakto)',
  [CAKTO_WEBHOOK_EVENTS.subscription_renewal_refused]:
    'Renovação recusada (Cakto)',
  checkout_intent: 'Intenção de compra — checkout aberto',
};

export function caktoEventLabel(caktoEvent: string): string {
  return CAKTO_EVENT_LABELS[caktoEvent] ?? `Cakto: ${caktoEvent}`;
}

export function mapCaktoEventToSubscriptionEventType(
  caktoEvent: string,
): SubscriptionEventType {
  switch (caktoEvent) {
    case CAKTO_WEBHOOK_EVENTS.initiate_checkout:
    case 'checkout_intent':
      return 'CREATED';
    case CAKTO_WEBHOOK_EVENTS.checkout_abandonment:
      return 'CANCELLED';
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
    case CAKTO_WEBHOOK_EVENTS.pix_gerado:
    case CAKTO_WEBHOOK_EVENTS.boleto_gerado:
    case CAKTO_WEBHOOK_EVENTS.picpay_gerado:
    case CAKTO_WEBHOOK_EVENTS.openfinance_nubank_gerado:
      return 'PAYMENT_SUCCEEDED';
    default:
      return 'ACTIVATED';
  }
}

export function caktoExternalEventId(
  caktoEvent: string,
  data: Record<string, unknown>,
): string | undefined {
  const orderId =
    typeof data.id === 'string' ? data.id : undefined;
  const refId = typeof data.refId === 'string' ? data.refId : undefined;
  const sub = data.subscription as Record<string, unknown> | undefined;
  const subId =
    sub && typeof sub.id === 'string' ? sub.id : undefined;

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

  const offer = data.offer as Record<string, unknown> | undefined;
  const productPayload = data.product as Record<string, unknown> | undefined;
  const customer = data.customer as Record<string, unknown> | undefined;
  const subPayload = data.subscription as Record<string, unknown> | undefined;
  const subCustomer = subPayload?.customer as
    | Record<string, unknown>
    | undefined;

  return {
    provider: 'CAKTO',
    caktoEvent,
    label: caktoEventLabel(caktoEvent),
    anotajaSubscriptionId: subscription.id,
    anotajaCompanyId: subscription.companyId,
    anotajaPlanId: subscription.planId,
    anotajaPlanName: subscription.plan?.name,
    anotajaPendingPlanId: subscription.pendingPlanId ?? undefined,
    anotajaPendingPlanName: subscription.pendingPlan?.name,
    integrationId,
    caktoOrderId: typeof data.id === 'string' ? data.id : undefined,
    caktoRefId: typeof data.refId === 'string' ? data.refId : undefined,
    caktoSubscriptionId:
      subPayload && typeof subPayload.id === 'string'
        ? subPayload.id
        : undefined,
    caktoProductId:
      (typeof productPayload?.id === 'string' && productPayload.id) ||
      (subPayload && typeof subPayload.product === 'string'
        ? subPayload.product
        : undefined),
    caktoProductName:
      (typeof productPayload?.name === 'string' && productPayload.name) ||
      productLabel,
    caktoOfferId: typeof offer?.id === 'string' ? offer.id : undefined,
    caktoOfferName: typeof offer?.name === 'string' ? offer.name : undefined,
    paymentMethod:
      typeof data.paymentMethod === 'string' ? data.paymentMethod : undefined,
    paymentMethodName:
      typeof data.paymentMethodName === 'string'
        ? data.paymentMethodName
        : undefined,
    paymentStatus:
      typeof data.status === 'string' ? data.status : undefined,
    amount:
      typeof data.amount === 'number'
        ? data.amount
        : parseFloat(String(data.amount ?? '')) || undefined,
    baseAmount:
      typeof data.baseAmount === 'number'
        ? data.baseAmount
        : parseFloat(String(data.baseAmount ?? '')) || undefined,
    paidAt: typeof data.paidAt === 'string' ? data.paidAt : undefined,
    refundedAt:
      typeof data.refundedAt === 'string' ? data.refundedAt : undefined,
    canceledAt:
      typeof data.canceledAt === 'string' ? data.canceledAt : undefined,
    customerEmail:
      (typeof customer?.email === 'string' && customer.email) ||
      (typeof subCustomer?.email === 'string' && subCustomer.email) ||
      undefined,
    customerName:
      (typeof customer?.name === 'string' && customer.name) ||
      (typeof subCustomer?.name === 'string' && subCustomer.name) ||
      undefined,
    parentOrder:
      typeof data.parent_order === 'string' ? data.parent_order : undefined,
    checkoutUrl:
      typeof data.checkoutUrl === 'string' ? data.checkoutUrl : undefined,
  };
}

export function buildCaktoHistoryReason(
  caktoEvent: string,
  metadata: CaktoWebhookHistoryMetadata,
  extraReason?: string,
): string {
  const parts: string[] = [caktoEventLabel(caktoEvent)];

  if (metadata.anotajaPlanName) {
    parts.push(`Plano: ${metadata.anotajaPlanName}`);
  } else if (metadata.anotajaPendingPlanName) {
    parts.push(`Plano pendente: ${metadata.anotajaPendingPlanName}`);
  }

  if (metadata.caktoOrderId) {
    parts.push(`Pedido Cakto: ${metadata.caktoOrderId}`);
  }
  if (metadata.caktoSubscriptionId) {
    parts.push(`Assinatura Cakto: ${metadata.caktoSubscriptionId}`);
  }
  if (metadata.caktoRefId) {
    parts.push(`Ref: ${metadata.caktoRefId}`);
  }

  if (extraReason?.trim()) {
    parts.push(extraReason.trim());
  }

  return parts.join(' · ');
}
