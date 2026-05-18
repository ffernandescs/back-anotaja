/**
 * Eventos de webhook Cakto (custom_id) — docs.cakto.com.br/api-reference/webhooks/create
 */
export const CAKTO_WEBHOOK_EVENTS = {
  initiate_checkout: 'initiate_checkout',
  checkout_abandonment: 'checkout_abandonment',
  purchase_approved: 'purchase_approved',
  purchase_refused: 'purchase_refused',
  pix_gerado: 'pix_gerado',
  boleto_gerado: 'boleto_gerado',
  picpay_gerado: 'picpay_gerado',
  openfinance_nubank_gerado: 'openfinance_nubank_gerado',
  chargeback: 'chargeback',
  refund: 'refund',
  subscription_created: 'subscription_created',
  subscription_canceled: 'subscription_canceled',
  subscription_renewed: 'subscription_renewed',
  subscription_renewal_refused: 'subscription_renewal_refused',
} as const;

export type CaktoWebhookEvent =
  (typeof CAKTO_WEBHOOK_EVENTS)[keyof typeof CAKTO_WEBHOOK_EVENTS];

/** Confirma pagamento e aplica plano pendente. */
export const CAKTO_ACTIVATE_EVENTS = new Set<string>([
  CAKTO_WEBHOOK_EVENTS.purchase_approved,
  CAKTO_WEBHOOK_EVENTS.subscription_created,
  CAKTO_WEBHOOK_EVENTS.subscription_renewed,
]);

/** Encerra acesso (reembolso, chargeback, cancelamento de assinatura). */
export const CAKTO_CANCEL_EVENTS = new Set<string>([
  CAKTO_WEBHOOK_EVENTS.refund,
  CAKTO_WEBHOOK_EVENTS.chargeback,
  CAKTO_WEBHOOK_EVENTS.subscription_canceled,
]);

/** Pagamento falhou ou renovação recusada — suspende sem cancelar definitivamente. */
export const CAKTO_SUSPEND_EVENTS = new Set<string>([
  CAKTO_WEBHOOK_EVENTS.purchase_refused,
  CAKTO_WEBHOOK_EVENTS.subscription_renewal_refused,
]);

/** Meio de pagamento gerado — aguardando confirmação (não ativa plano). */
export const CAKTO_AWAITING_PAYMENT_EVENTS = new Set<string>([
  CAKTO_WEBHOOK_EVENTS.pix_gerado,
  CAKTO_WEBHOOK_EVENTS.boleto_gerado,
  CAKTO_WEBHOOK_EVENTS.picpay_gerado,
  CAKTO_WEBHOOK_EVENTS.openfinance_nubank_gerado,
]);

/** Apenas registro — não altera assinatura. */
export const CAKTO_INFORMATIONAL_EVENTS = new Set<string>([
  CAKTO_WEBHOOK_EVENTS.initiate_checkout,
  CAKTO_WEBHOOK_EVENTS.checkout_abandonment,
]);

export const CAKTO_ALL_KNOWN_EVENTS = new Set<string>([
  ...Object.values(CAKTO_WEBHOOK_EVENTS),
]);

export function isKnownCaktoEvent(event: string): boolean {
  return CAKTO_ALL_KNOWN_EVENTS.has(event);
}
