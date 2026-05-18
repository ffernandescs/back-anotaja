import { AdminAlertContext, AdminAlertDto } from '../admin-alerts.types';

export interface AdminAlertProvider {
  readonly type: string;
  getAlerts(context: AdminAlertContext): Promise<AdminAlertDto[]>;
}
