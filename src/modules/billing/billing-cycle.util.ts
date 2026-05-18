import type { BillingPeriod } from '@prisma/client';

export interface BillingCycleDates {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingDate: Date;
  lastBillingDate: Date;
}

/** Converte timestamp/string do webhook para Date. */
export function parseBillingDate(value: unknown): Date | undefined {
  if (value == null) return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : undefined;
    if (ms == null) return undefined;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  return undefined;
}

function addBillingPeriod(date: Date, billingPeriod: BillingPeriod): Date {
  const next = new Date(date);

  switch (billingPeriod) {
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'SEMESTRAL':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'ANNUAL':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'MONTHLY':
    default:
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

/**
 * Calcula início/fim do ciclo atual e próxima cobrança a partir de uma data de referência.
 */
export function calculateBillingCycleDates(
  referenceDate: Date,
  billingPeriod: BillingPeriod,
): BillingCycleDates {
  const currentPeriodStart = new Date(referenceDate);
  const currentPeriodEnd = addBillingPeriod(currentPeriodStart, billingPeriod);
  /** Próxima cobrança = fim do ciclo atual (mesmo critério do Stripe current_period_end). */
  const nextBillingDate = new Date(currentPeriodEnd);

  return {
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingDate,
    lastBillingDate: currentPeriodStart,
  };
}

function pickDate(
  sources: unknown[],
): Date | undefined {
  for (const value of sources) {
    const parsed = parseBillingDate(value);
    if (parsed) return parsed;
  }
  return undefined;
}

/**
 * Extrai datas de cobrança do payload do webhook Cakto (quando disponíveis).
 */
export function extractCaktoBillingDates(
  data: Record<string, unknown>,
): Partial<BillingCycleDates> {
  const sub = data.subscription as Record<string, unknown> | undefined;

  const periodStart = pickDate([
    data.paidAt,
    data.paid_at,
    data.createdAt,
    data.created_at,
    sub?.current_period_start,
    sub?.currentPeriodStart,
    sub?.started_at,
    sub?.start_at,
  ]);

  const periodEnd = pickDate([
    sub?.current_period_end,
    sub?.currentPeriodEnd,
    sub?.period_end,
    sub?.ends_at,
    sub?.end_at,
    data.current_period_end,
    data.period_end,
  ]);

  const nextBilling = pickDate([
    sub?.next_charge_at,
    sub?.next_charge_date,
    sub?.next_billing_date,
    sub?.nextBillingDate,
    sub?.next_payment_date,
    data.next_charge_at,
    data.next_charge_date,
    data.next_billing_date,
    periodEnd,
  ]);

  const lastBilling = pickDate([
    data.paidAt,
    data.paid_at,
    sub?.last_charge_date,
    periodStart,
  ]);

  const result: Partial<BillingCycleDates> = {};

  if (periodStart) result.currentPeriodStart = periodStart;
  if (periodEnd) result.currentPeriodEnd = periodEnd;
  if (nextBilling) result.nextBillingDate = nextBilling;
  if (lastBilling) result.lastBillingDate = lastBilling;

  return result;
}

/**
 * Mescla datas do webhook com cálculo pelo período de cobrança.
 */
export function resolveBillingCycleDates(
  data: Record<string, unknown> | undefined,
  billingPeriod: BillingPeriod,
  referenceDate: Date = new Date(),
): BillingCycleDates {
  const fromWebhook = data ? extractCaktoBillingDates(data) : {};
  const calculated = calculateBillingCycleDates(
    fromWebhook.currentPeriodStart ?? referenceDate,
    billingPeriod,
  );

  return {
    currentPeriodStart:
      fromWebhook.currentPeriodStart ?? calculated.currentPeriodStart,
    currentPeriodEnd:
      fromWebhook.currentPeriodEnd ?? calculated.currentPeriodEnd,
    nextBillingDate:
      fromWebhook.nextBillingDate ?? calculated.nextBillingDate,
    lastBillingDate:
      fromWebhook.lastBillingDate ?? calculated.lastBillingDate,
  };
}
