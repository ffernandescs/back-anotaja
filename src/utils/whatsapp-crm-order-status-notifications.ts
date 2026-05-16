/**
 * Metadados por status de pedido (notificações WhatsApp ao cliente).
 * Textos customizados continuam em `WhatsAppConfig.template*`; aqui só `enabled` e `useDefaultTemplate`.
 */

/** Chave reservada dentro de `crmBootGreetingFlows` (evita coluna/migração até `prisma generate`). */
export const CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY = 'orderStatusNotifications';

export const CRM_ORDER_STATUS_NOTIFICATION_IDS = [
  'confirmation',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type CrmOrderStatusNotificationId = (typeof CRM_ORDER_STATUS_NOTIFICATION_IDS)[number];

export interface CrmOrderStatusNotificationSlice {
  enabled: boolean;
  useDefaultTemplate: boolean;
}

export type CrmOrderStatusNotificationsMap = Record<
  CrmOrderStatusNotificationId,
  CrmOrderStatusNotificationSlice
>;

type LegacyWhatsAppNotifyConfig = {
  orderConfirmationEnabled?: boolean;
  orderReadyEnabled?: boolean;
  deliveryCancelEnabled?: boolean;
};

const DEFAULT_SLICE: CrmOrderStatusNotificationSlice = {
  enabled: true,
  useDefaultTemplate: true,
};

export function blankCrmOrderStatusNotifications(): CrmOrderStatusNotificationsMap {
  return {
    confirmation: { ...DEFAULT_SLICE },
    preparing: { ...DEFAULT_SLICE },
    ready: { ...DEFAULT_SLICE },
    out_for_delivery: { ...DEFAULT_SLICE },
    delivered: { ...DEFAULT_SLICE },
    cancelled: { ...DEFAULT_SLICE },
  };
}

function legacyEnabledFor(
  id: CrmOrderStatusNotificationId,
  config: LegacyWhatsAppNotifyConfig,
): boolean {
  if (id === 'confirmation' || id === 'preparing') {
    return config.orderConfirmationEnabled !== false;
  }
  if (id === 'cancelled') {
    return config.deliveryCancelEnabled !== false;
  }
  return config.orderReadyEnabled !== false;
}

function coerceSlice(raw: unknown): CrmOrderStatusNotificationSlice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : undefined;
  const useDefaultTemplate =
    typeof o.useDefaultTemplate === 'boolean' ? o.useDefaultTemplate : undefined;
  if (enabled === undefined && useDefaultTemplate === undefined) return null;
  return {
    enabled: enabled ?? DEFAULT_SLICE.enabled,
    useDefaultTemplate: useDefaultTemplate ?? DEFAULT_SLICE.useDefaultTemplate,
  };
}

/** Normaliza JSON persistido sem flags legados (UI / leitura exata do que foi salvo). */
export function normalizeGranularOrderStatusNotifications(
  raw: unknown,
): CrmOrderStatusNotificationsMap {
  const out = blankCrmOrderStatusNotifications();
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  for (const id of CRM_ORDER_STATUS_NOTIFICATION_IDS) {
    const slice = coerceSlice(root[id]);
    if (slice) out[id] = slice;
  }

  return out;
}

/** Normaliza JSON persistido ou deriva dos flags legados (`orderConfirmationEnabled`, etc.). */
export function normalizeCrmOrderStatusNotifications(
  raw: unknown,
  legacy?: LegacyWhatsAppNotifyConfig,
): CrmOrderStatusNotificationsMap {
  const out = blankCrmOrderStatusNotifications();
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  for (const id of CRM_ORDER_STATUS_NOTIFICATION_IDS) {
    const slice = coerceSlice(root[id]);
    if (slice) {
      out[id] = slice;
    } else if (legacy) {
      out[id] = {
        enabled: legacyEnabledFor(id, legacy),
        useDefaultTemplate: DEFAULT_SLICE.useDefaultTemplate,
      };
    }
  }

  return out;
}

/**
 * Mapa granular para UI/API: prioriza bloco em `crmBootGreetingFlows`, depois coluna.
 * Nunca preenche `enabled` a partir de flags legados (evita “ligar todos” ao ativar notifyOrderStatus).
 */
export function readGranularOrderStatusNotificationsForApi(config: {
  crmOrderStatusNotifications?: unknown;
  crmBootGreetingFlows?: unknown;
}): CrmOrderStatusNotificationsMap {
  const flowsRaw = readOrderStatusNotificationsFromFlows(config.crmBootGreetingFlows);
  const flowsNorm =
    flowsRaw != null ? normalizeGranularOrderStatusNotifications(flowsRaw) : null;

  const colNorm =
    config.crmOrderStatusNotifications != null
      ? normalizeGranularOrderStatusNotifications(config.crmOrderStatusNotifications)
      : null;

  if (!flowsNorm && !colNorm) return blankCrmOrderStatusNotifications();
  if (!flowsNorm) return colNorm!;
  if (!colNorm) return flowsNorm;

  if (
    isDefaultOrderStatusNotificationsMap(colNorm) &&
    !orderStatusNotificationsMapsEqual(colNorm, flowsNorm)
  ) {
    return flowsNorm;
  }

  return colNorm;
}

export function sanitizeCrmOrderStatusNotificationsInput(raw: unknown): CrmOrderStatusNotificationsMap {
  const blank = blankCrmOrderStatusNotifications();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blank;

  const root = raw as Record<string, unknown>;
  const out = { ...blank };

  for (const id of CRM_ORDER_STATUS_NOTIFICATION_IDS) {
    const slice = coerceSlice(root[id]);
    if (slice) out[id] = slice;
  }

  return out;
}

/** Sincroniza flags booleanas legadas a partir do mapa granular (compatibilidade). */
export function legacyFlagsFromOrderStatusNotifications(
  map: CrmOrderStatusNotificationsMap,
): LegacyWhatsAppNotifyConfig {
  return {
    orderConfirmationEnabled: map.confirmation.enabled || map.preparing.enabled,
    orderReadyEnabled:
      map.ready.enabled || map.out_for_delivery.enabled || map.delivered.enabled,
    deliveryCancelEnabled: map.cancelled.enabled,
  };
}

export function isCrmOrderStatusNotificationEnabled(
  map: CrmOrderStatusNotificationsMap | unknown,
  id: CrmOrderStatusNotificationId,
  legacy?: LegacyWhatsAppNotifyConfig,
): boolean {
  const normalized = normalizeCrmOrderStatusNotifications(map, legacy);
  return normalized[id].enabled;
}

/** Bot global do CRM (`crmBootBotEnabled`). */
export function isCrmGlobalBotEnabled(config: { crmBootBotEnabled?: boolean }): boolean {
  return config.crmBootBotEnabled === true;
}

/** Bot de notificações ao cliente (`notifyOrderStatus` — default true no banco). */
export function isCrmClientOrderNotificationsEnabled(config: {
  notifyOrderStatus?: boolean;
}): boolean {
  return config.notifyOrderStatus !== false;
}

export type CrmOrderStatusNotificationGateConfig = {
  crmBootBotEnabled?: boolean;
  notifyOrderStatus?: boolean;
  crmOrderStatusNotifications?: unknown;
  crmBootGreetingFlows?: unknown;
  orderConfirmationEnabled?: boolean;
  orderReadyEnabled?: boolean;
  deliveryCancelEnabled?: boolean;
};

/**
 * Hierarquia para envio: bot global → notificações ao cliente → status individual.
 */
export function canSendCrmOrderStatusNotification(
  config: CrmOrderStatusNotificationGateConfig,
  id: CrmOrderStatusNotificationId,
): boolean {
  if (!isCrmGlobalBotEnabled(config)) return false;
  if (!isCrmClientOrderNotificationsEnabled(config)) return false;
  const map = resolveCrmOrderStatusNotifications(config);
  return map[id].enabled;
}

/** Mapa igual ao default do banco (tudo ligado + modelo padrão). */
export function isDefaultOrderStatusNotificationsMap(
  map: CrmOrderStatusNotificationsMap,
): boolean {
  return CRM_ORDER_STATUS_NOTIFICATION_IDS.every(
    (id) => map[id].enabled === true && map[id].useDefaultTemplate === true,
  );
}

export function orderStatusNotificationsMapsEqual(
  a: CrmOrderStatusNotificationsMap,
  b: CrmOrderStatusNotificationsMap,
): boolean {
  return CRM_ORDER_STATUS_NOTIFICATION_IDS.every(
    (id) =>
      a[id].enabled === b[id].enabled && a[id].useDefaultTemplate === b[id].useDefaultTemplate,
  );
}

/** Bloco `orderStatusNotifications` dentro de `crmBootGreetingFlows`, se existir. */
export function readOrderStatusNotificationsFromFlows(flows: unknown): unknown {
  if (!flows || typeof flows !== 'object' || Array.isArray(flows)) return null;
  return (flows as Record<string, unknown>)[CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY] ?? null;
}

/**
 * Lê meta de notificações unificando coluna dedicada e bloco em `crmBootGreetingFlows`.
 * A coluna é a fonte principal após qualquer save; o bloco nos fluxos só prevalece se a coluna
 * ainda estiver no default de fábrica e divergir (instalações antigas só no JSON de fluxos).
 */
export function resolveCrmOrderStatusNotifications(
  config: {
    crmOrderStatusNotifications?: unknown;
    crmBootGreetingFlows?: unknown;
    orderConfirmationEnabled?: boolean;
    orderReadyEnabled?: boolean;
    deliveryCancelEnabled?: boolean;
  },
): CrmOrderStatusNotificationsMap {
  const legacy: LegacyWhatsAppNotifyConfig = {
    orderConfirmationEnabled: config.orderConfirmationEnabled,
    orderReadyEnabled: config.orderReadyEnabled,
    deliveryCancelEnabled: config.deliveryCancelEnabled,
  };

  const flowsRaw = readOrderStatusNotificationsFromFlows(config.crmBootGreetingFlows);
  const flowsNorm =
    flowsRaw != null ? normalizeCrmOrderStatusNotifications(flowsRaw, legacy) : null;

  const colNorm =
    config.crmOrderStatusNotifications != null
      ? normalizeCrmOrderStatusNotifications(config.crmOrderStatusNotifications, legacy)
      : null;

  if (!flowsNorm && !colNorm) {
    return normalizeCrmOrderStatusNotifications(null, legacy);
  }
  if (!flowsNorm) return colNorm!;
  if (!colNorm) return flowsNorm;

  if (
    isDefaultOrderStatusNotificationsMap(colNorm) &&
    !orderStatusNotificationsMapsEqual(colNorm, flowsNorm)
  ) {
    return flowsNorm;
  }

  return colNorm;
}

export function mergeOrderStatusNotificationsIntoFlows(
  flows: unknown,
  notifications: CrmOrderStatusNotificationsMap,
): Record<string, unknown> {
  const base =
    flows && typeof flows === 'object' && !Array.isArray(flows)
      ? { ...(flows as Record<string, unknown>) }
      : {};
  base[CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY] = notifications;
  return base;
}

export const CRM_ORDER_STATUS_TEMPLATE_FIELD: Record<
  CrmOrderStatusNotificationId,
  | 'templateConfirmation'
  | 'templatePreparing'
  | 'templateReady'
  | 'templateOutForDelivery'
  | 'templateDelivered'
  | 'templateCancelled'
> = {
  confirmation: 'templateConfirmation',
  preparing: 'templatePreparing',
  ready: 'templateReady',
  out_for_delivery: 'templateOutForDelivery',
  delivered: 'templateDelivered',
  cancelled: 'templateCancelled',
};
