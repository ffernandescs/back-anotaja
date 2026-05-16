/**
 * Metadados por status de pedido (notificações WhatsApp ao cliente).
 * Textos customizados continuam em `WhatsAppConfig.template*`; aqui só `enabled` e `useDefaultTemplate`.
 */

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
