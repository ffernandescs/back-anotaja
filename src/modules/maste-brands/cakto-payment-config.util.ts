import { randomUUID } from 'crypto';
import type {
  CaktoPaymentConfig,
  CaktoProductIntegration,
} from './subscription-payment.types';

export type CaktoPlanRef = {
  id: string;
  type?: string | null;
  billingPeriod?: string | null;
  name?: string | null;
};

export function caktoIntegrationIdForPlan(planId: string): string {
  return `plan-${planId}`;
}

/** Remove produtos legados sem planId (ex.: "Produto padrão (legado)"). */
export function sanitizeCaktoProducts(
  products: CaktoProductIntegration[],
): CaktoProductIntegration[] {
  const byPlanId = new Map<string, CaktoProductIntegration>();

  for (const p of products) {
    const planId = p.planId?.trim();
    if (!planId) continue;

    byPlanId.set(planId, {
      ...p,
      id: caktoIntegrationIdForPlan(planId),
      planId,
      label: p.label?.trim() || undefined,
      planType: p.planType?.trim() || undefined,
      billingPeriod: p.billingPeriod?.trim() || undefined,
      checkoutCode: p.checkoutCode?.trim() || undefined,
      caktoProductId: p.caktoProductId?.trim() || undefined,
      webhookSecret: p.webhookSecret?.trim() || undefined,
      enabled: p.enabled !== false,
    });
  }

  return Array.from(byPlanId.values());
}

/** Normaliza config legada para lista de produtos vinculados a planId. */
export function normalizeCaktoConfig(
  raw: CaktoPaymentConfig | null | undefined,
): CaktoPaymentConfig {
  const apiKey = raw?.apiKey?.trim() ?? '';

  if (Array.isArray(raw?.products) && raw.products.length > 0) {
    const mapped = raw.products.map((p) => {
      const planId = p.planId?.trim();
      return {
        ...p,
        id: planId
          ? caktoIntegrationIdForPlan(planId)
          : p.id?.trim() || randomUUID(),
        label: p.label?.trim() || undefined,
        planId,
        planType: p.planType?.trim() || undefined,
        billingPeriod: p.billingPeriod?.trim() || undefined,
        checkoutCode: p.checkoutCode?.trim() || undefined,
        caktoProductId: p.caktoProductId?.trim() || undefined,
        webhookSecret: p.webhookSecret?.trim() || undefined,
        enabled: p.enabled !== false,
      };
    });
    return { apiKey, products: sanitizeCaktoProducts(mapped) };
  }

  const products: CaktoProductIntegration[] = [];

  /** Config global legada (checkout único) — não gera produto sem planId; reconfigure no Master. */

  for (const [key, code] of Object.entries(raw?.planCheckoutCodes ?? {})) {
    if (!code?.trim()) continue;
    const planId = key.length > 20 ? key : undefined;
    products.push({
      id: planId ? caktoIntegrationIdForPlan(planId) : `plan-type-${key}`,
      label: `Plano ${key}`,
      planType: !planId && key.length <= 32 ? key : undefined,
      planId,
      checkoutCode: code.trim(),
      webhookSecret: raw?.webhookSecret?.trim(),
      enabled: true,
    });
  }

  for (const [key, productId] of Object.entries(raw?.planProductIds ?? {})) {
    if (!productId?.trim()) continue;
    const planId = key.length > 20 ? key : undefined;
    const existing = products.find(
      (p) => p.planId === planId || p.planType === key,
    );
    if (existing) {
      existing.caktoProductId = productId.trim();
      if (planId) {
        existing.planId = planId;
        existing.id = caktoIntegrationIdForPlan(planId);
      }
      continue;
    }
    products.push({
      id: planId ? caktoIntegrationIdForPlan(planId) : `plan-product-${key}`,
      label: `Plano ${key}`,
      planType: !planId && key.length <= 32 ? key : undefined,
      planId,
      caktoProductId: productId.trim(),
      webhookSecret: raw?.webhookSecret?.trim(),
      enabled: true,
    });
  }

  return { apiKey, products: sanitizeCaktoProducts(products) };
}

/**
 * Produto Cakto do plano escolhido — prioridade: planId → type+period → type único.
 */
export function resolveCaktoProductForPlan(
  raw: CaktoPaymentConfig | null | undefined,
  plan: CaktoPlanRef,
): CaktoProductIntegration | null {
  const config = normalizeCaktoConfig(raw);
  const enabled = (config.products ?? []).filter((p) => p.enabled !== false);

  if (enabled.length === 0) return null;

  const byPlanId = enabled.find((p) => p.planId === plan.id);
  if (byPlanId) return byPlanId;

  const period = plan.billingPeriod?.trim();
  const type = plan.type?.trim();

  if (type && period) {
    const byTypePeriod = enabled.find(
      (p) => p.planType === type && p.billingPeriod === period,
    );
    if (byTypePeriod) return byTypePeriod;
  }

  if (type) {
    const byType = enabled.filter((p) => p.planType === type);
    if (byType.length === 1) return byType[0];
  }

  /** Legado: um único produto sem planId */
  const unbound = enabled.filter((p) => !p.planId);
  if (unbound.length === 1) return unbound[0];

  return null;
}

export function formatCaktoConfiguredPlansHint(
  raw: CaktoPaymentConfig | null | undefined,
): string {
  const config = normalizeCaktoConfig(raw);
  const enabled = (config.products ?? []).filter((p) => p.enabled !== false);
  if (enabled.length === 0) return 'nenhum plano integrado';

  return enabled
    .map((p) => {
      const parts = [p.label || p.planId || p.planType || p.id];
      if (p.planId) parts.push(`id=${p.planId}`);
      if (p.billingPeriod) parts.push(p.billingPeriod);
      return parts.join(' ');
    })
    .join('; ');
}

export function findCaktoProductByIntegrationId(
  raw: CaktoPaymentConfig | null | undefined,
  integrationId: string,
): CaktoProductIntegration | null {
  const config = normalizeCaktoConfig(raw);
  const direct =
    config.products?.find((p) => p.id === integrationId) ?? null;
  if (direct) return direct;

  if (integrationId.startsWith('plan-')) {
    const planId = integrationId.slice(5);
    return config.products?.find((p) => p.planId === planId) ?? null;
  }

  return null;
}

export function caktoWebhookSecretMatches(
  product: CaktoProductIntegration | null,
  config: CaktoPaymentConfig,
  secret: unknown,
): boolean {
  if (typeof secret !== 'string' || !secret.trim()) {
    return process.env.NODE_ENV !== 'production';
  }

  const trimmed = secret.trim();
  if (product?.webhookSecret && product.webhookSecret === trimmed) {
    return true;
  }

  const normalized = normalizeCaktoConfig(config);
  for (const p of normalized.products ?? []) {
    if (p.enabled !== false && p.webhookSecret === trimmed) {
      return true;
    }
  }

  const legacy = (config as { webhookSecret?: string }).webhookSecret?.trim();
  if (legacy && legacy === trimmed) return true;

  return false;
}

function isCaktoProductComplete(p: CaktoProductIntegration): boolean {
  if (p.enabled === false) return false;
  if (!p.planId?.trim()) return false;
  if (!p.webhookSecret?.trim()) return false;
  if (!p.checkoutCode?.trim() && !p.caktoProductId?.trim()) return false;
  return true;
}

export function validateCaktoProductsConfig(
  raw: CaktoPaymentConfig | null | undefined,
  options?: {
    validPlanIds?: Set<string>;
    /** Todos os planos pagos ativos devem estar integrados */
    requiredPlanIds?: Set<string>;
    planNames?: Map<string, string>;
  },
): void {
  const config = normalizeCaktoConfig(raw);

  if (!config.apiKey?.trim()) {
    throw new Error('API Key Cakto é obrigatória.');
  }

  const enabled = (config.products ?? []).filter((p) => p.enabled !== false);

  if (enabled.length === 0) {
    throw new Error(
      'Integre todos os planos pagos ativos em Master → Configurações → Cakto.',
    );
  }

  if (options?.requiredPlanIds && options.requiredPlanIds.size > 0) {
    const completeByPlanId = new Map<string, CaktoProductIntegration>();
    for (const p of enabled) {
      if (p.planId && isCaktoProductComplete(p)) {
        completeByPlanId.set(p.planId, p);
      }
    }

    const missing: string[] = [];
    for (const planId of options.requiredPlanIds) {
      if (!completeByPlanId.has(planId)) {
        const name = options.planNames?.get(planId) ?? planId;
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Integração Cakto incompleta. Falta configurar: ${missing.join(', ')}.`,
      );
    }
  }

  const integrationIds = new Set<string>();
  const planIds = new Set<string>();

  for (const p of enabled) {
    if (!p.planId) {
      throw new Error(
        `Produto "${p.label || p.id}": vincule a um plano do CRUD Master (planId).`,
      );
    }

    if (options?.validPlanIds && !options.validPlanIds.has(p.planId)) {
      throw new Error(
        `Plano ${p.planId} não existe mais no CRUD. Atualize a integração Cakto.`,
      );
    }

    if (planIds.has(p.planId)) {
      throw new Error(
        `Plano duplicado na integração Cakto: ${p.planId}. Use um produto por plano.`,
      );
    }
    planIds.add(p.planId);

    if (integrationIds.has(p.id)) {
      throw new Error(`ID de integração duplicado: ${p.id}`);
    }
    integrationIds.add(p.id);

    if (!p.checkoutCode && !p.caktoProductId) {
      throw new Error(
        `Plano "${p.label || p.planId}": informe checkoutCode ou caktoProductId.`,
      );
    }

    if (!p.webhookSecret) {
      throw new Error(
        `Plano "${p.label || p.planId}": webhook secret é obrigatório.`,
      );
    }
  }
}
