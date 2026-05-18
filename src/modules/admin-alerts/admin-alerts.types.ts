export enum AdminAlertType {
  CASH_SESSION_STALE = 'CASH_SESSION_STALE',
  ORDER_STALE = 'ORDER_STALE',
  ORDER_UNPAID_STALE = 'ORDER_UNPAID_STALE',
}

export type AdminAlertSeverity = 'info' | 'warning' | 'critical';

export interface AdminAlertDto {
  /** Identificador estável para UI e leitura (ex.: CASH_SESSION_STALE:sessionId). */
  id: string;
  type: AdminAlertType;
  severity: AdminAlertSeverity;
  title: string;
  message: string;
  href?: string;
  /** Usado em NotificationRead (SYSTEM). */
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface AdminAlertBranchConfig {
  adminAlertsEnabled: boolean;
  cashSessionStaleAlertEnabled: boolean;
  cashSessionMaxOpenDays: number;
  orderStaleAlertEnabled: boolean;
  orderMaxPendingMinutes: number;
  orderUnpaidStaleAlertEnabled: boolean;
  orderMaxUnpaidDays: number;
}

export interface AdminAlertContext {
  branchId: string;
  userId: string;
  config: AdminAlertBranchConfig;
}
