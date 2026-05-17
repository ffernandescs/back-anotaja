/**
 * Limites de plano: cada recurso tem flag `unlimited` e valor `max`.
 * Compatível com formato legado `{ products: 50, ordersPerMonth: -1 }`.
 */

export const PLAN_LIMIT_RESOURCES = [
  'branches',
  'users',
  'products',
  'ordersPerMonth',
  'deliveryPersons',
] as const;

export type PlanLimitResource = (typeof PLAN_LIMIT_RESOURCES)[number];

export interface PlanLimitEntry {
  /** true = sem limite para este recurso */
  unlimited: boolean;
  /** Usado apenas quando unlimited === false */
  max: number;
}

export type PlanLimitsMap = Record<PlanLimitResource, PlanLimitEntry>;

export const DEFAULT_PLAN_LIMITS: PlanLimitsMap = {
  branches: { unlimited: false, max: 1 },
  users: { unlimited: false, max: 3 },
  products: { unlimited: false, max: 50 },
  ordersPerMonth: { unlimited: false, max: 100 },
  deliveryPersons: { unlimited: false, max: 5 },
};

function isPlanLimitResource(key: string): key is PlanLimitResource {
  return (PLAN_LIMIT_RESOURCES as readonly string[]).includes(key);
}

function entryFromLegacyValue(value: unknown): PlanLimitEntry {
  if (typeof value === 'number') {
    if (value === -1) {
      return { unlimited: true, max: 0 };
    }
    return { unlimited: false, max: Math.max(0, value) };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('unlimited' in obj || 'max' in obj) {
      const unlimited = Boolean(obj.unlimited);
      const max = Number(obj.max);
      return {
        unlimited,
        max: unlimited ? Math.max(0, max || 0) : Math.max(0, Number.isFinite(max) ? max : 0),
      };
    }
  }

  return { unlimited: false, max: 0 };
}

/**
 * Normaliza JSON/string/objeto legado ou novo para PlanLimitsMap.
 */
export function parsePlanLimits(
  raw: string | Record<string, unknown> | PlanLimitsMap | null | undefined,
): PlanLimitsMap {
  const base: PlanLimitsMap = { ...DEFAULT_PLAN_LIMITS };

  if (!raw) {
    return base;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>);
  } catch {
    return base;
  }

  for (const key of PLAN_LIMIT_RESOURCES) {
    if (parsed[key] !== undefined) {
      base[key] = entryFromLegacyValue(parsed[key]);
    }
  }

  return base;
}

export function serializePlanLimits(limits: PlanLimitsMap): string {
  const out: Record<string, PlanLimitEntry> = {};
  for (const key of PLAN_LIMIT_RESOURCES) {
    out[key] = {
      unlimited: limits[key].unlimited,
      max: limits[key].unlimited ? limits[key].max : Math.max(0, limits[key].max),
    };
  }
  return JSON.stringify(out);
}

export function isResourceUnlimited(
  limits: PlanLimitsMap,
  resource: PlanLimitResource,
): boolean {
  return limits[resource]?.unlimited === true;
}

/** Retorna -1 se ilimitado (compatibilidade com telas antigas). */
export function getResourceLimitValue(
  limits: PlanLimitsMap,
  resource: PlanLimitResource,
): number {
  const entry = limits[resource];
  if (!entry || entry.unlimited) {
    return -1;
  }
  return entry.max;
}

export function toLegacyNumericLimits(limits: PlanLimitsMap): Record<PlanLimitResource, number> {
  const out = {} as Record<PlanLimitResource, number>;
  for (const key of PLAN_LIMIT_RESOURCES) {
    out[key] = getResourceLimitValue(limits, key);
  }
  return out;
}

export function formatLimitLabel(entry: PlanLimitEntry): string {
  return entry.unlimited ? 'Ilimitado' : String(entry.max);
}
