export const SUBSCRIPTION_PAYMENT_PROVIDERS = [
  'STRIPE',
  'CAKTO',
  'ASAAS',
] as const;

export type SubscriptionPaymentProvider =
  (typeof SUBSCRIPTION_PAYMENT_PROVIDERS)[number];

export interface StripePaymentConfig {
  secretKey?: string;
  webhookSecret?: string;
  publishableKey?: string;
}

/**
 * Um produto/oferta Cakto no Master — cada item tem checkout, secret e webhook próprios.
 * URL do webhook: POST /api/cakto-billing/webhook/{id}
 */
export interface CaktoProductIntegration {
  /** ID estável (usado na URL do webhook) */
  id: string;
  /** Nome no painel Master */
  label?: string;
  /** Obrigatório — Plan.id do CRUD Master (/master/plans) */
  planId?: string;
  /** Preenchido automaticamente a partir do plano (Plan.type) */
  planType?: string;
  /** Periodicidade do plano no CRUD (MONTHLY, ANNUAL, …) */
  billingPeriod?: string;
  /** Código pay.cakto.com.br/{checkoutCode} */
  checkoutCode?: string;
  /** UUID do produto no painel Cakto */
  caktoProductId?: string;
  /** Secret exclusivo configurado no webhook deste produto na Cakto */
  webhookSecret?: string;
  enabled?: boolean;
}

export interface CaktoPaymentConfig {
  /** API Key compartilhada da conta Cakto da marca */
  apiKey?: string;
  products?: CaktoProductIntegration[];

  /** @deprecated migrado para products[] — mantido só para leitura legada */
  webhookSecret?: string;
  checkoutCode?: string;
  productId?: string;
  planCheckoutCodes?: Record<string, string>;
  planProductIds?: Record<string, string>;
}

export interface AsaasPaymentConfig {
  apiKey?: string;
  webhookSecret?: string;
  environment?: 'sandbox' | 'production';
}

export type BrandPaymentConfigPayload =
  | StripePaymentConfig
  | CaktoPaymentConfig
  | AsaasPaymentConfig
  | Record<string, unknown>;

export interface BrandPaymentIntegrationDto {
  provider: SubscriptionPaymentProvider;
  enabled: boolean;
  config?: BrandPaymentConfigPayload | null;
}

export interface BrandPaymentIntegrationResponse {
  masterBrandId: string;
  provider: SubscriptionPaymentProvider;
  enabled: boolean;
  config: BrandPaymentConfigPayload | null;
}
