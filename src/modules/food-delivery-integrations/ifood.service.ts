import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { prisma } from '../../../lib/prisma';

export interface IfoodOrderEvent {
  id: string;
  code: string; // PLC, CFM, RTO, CAN, DSP, DLV, CON
  correlationId: string;
  createdAt: string;
  orderId: string;
  merchantId: string;
}

export interface IfoodOrder {
  id: string;
  reference: string;
  shortReference: string;
  displayId: string;
  createdAt: string;
  type: string; // DELIVERY, TAKEOUT, INDOOR
  merchant: { id: string; name: string };
  customer: {
    name: string;
    phone: { number: string; localizer: string };
    documentNumber?: string;
    ordersCountOnMerchant?: number;
  };
  items: IfoodOrderItem[];
  subTotal: number;
  totalFee: number;
  totalPrice: number;
  deliveryFee: number;
  payments: { methods: IfoodPaymentMethod[] };
  delivery?: {
    deliveryAddress: IfoodAddress;
    deliveryBy: string;
    estimatedDeliveryTime: string;
  };
  schedule?: {
    scheduledDateTimeStart: string;
    scheduledDateTimeEnd: string;
  };
  additionalInfo?: string;
}

export interface IfoodOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
  externalCode: string;
  notes?: string;
  subItems?: IfoodOrderItem[];
  options?: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    externalCode: string;
  }[];
}

export interface IfoodPaymentMethod {
  value: number;
  currency: string;
  method: string; // CASH, CREDIT, DEBIT, MEAL_VOUCHER, FOOD_VOUCHER, DIGITAL_WALLET, PIX
  type: string;   // PREPAID, OFFLINE
  prepaid: boolean;
  cash?: { changeFor: number };
  wallet?: { name: string };
}

interface IfoodAddress {
  streetName: string;
  streetNumber: string;
  formattedAddress: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  complement?: string;
}

const TOKEN_KEY = 'ifood_access_token';
const TOKEN_EXPIRES_KEY = 'ifood_token_expires_at';
const MARGIN_MS = 120_000; // 2 min safety margin

@Injectable()
export class IfoodService {
  private readonly logger = new Logger(IfoodService.name);
  readonly BASE_URL = 'https://merchant-api.ifood.com.br';
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: this.BASE_URL });
  }

  private async getMasterCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const [clientIdRow, clientSecretRow] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: 'ifood_client_id' } }),
      prisma.systemConfig.findUnique({ where: { key: 'ifood_client_secret' } }),
    ]);

    if (!clientIdRow?.value || !clientSecretRow?.value) {
      throw new UnprocessableEntityException(
        'Credenciais iFood não configuradas. Configure client_id e client_secret no master.',
      );
    }

    return { clientId: clientIdRow.value, clientSecret: clientSecretRow.value };
  }

  async getAccessToken(): Promise<string> {
    // Check persisted token first (survives restarts)
    const [tokenRow, expiresRow] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: TOKEN_KEY } }),
      prisma.systemConfig.findUnique({ where: { key: TOKEN_EXPIRES_KEY } }),
    ]);

    const expiresAt = expiresRow?.value ? parseInt(expiresRow.value, 10) : 0;
    if (tokenRow?.value && Date.now() < expiresAt - MARGIN_MS) {
      return tokenRow.value;
    }

    // Request new token
    const { clientId, clientSecret } = await this.getMasterCredentials();

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');

    const response = await this.http.post<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>('/authentication/v1.0/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, token_type, expires_in } = response.data;
    const newExpiresAt = Date.now() + expires_in * 1000;

    // Persist token so it survives restarts
    await Promise.all([
      prisma.systemConfig.upsert({
        where: { key: TOKEN_KEY },
        create: { key: TOKEN_KEY, value: access_token },
        update: { value: access_token },
      }),
      prisma.systemConfig.upsert({
        where: { key: TOKEN_EXPIRES_KEY },
        create: { key: TOKEN_EXPIRES_KEY, value: String(newExpiresAt) },
        update: { value: String(newExpiresAt) },
      }),
    ]);

    this.logger.log(`iFood access token renovado (expira em ${expires_in}s)`);
    return access_token;
  }


  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async pollOrders(merchantId: string): Promise<IfoodOrderEvent[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get<IfoodOrderEvent[]>(
      `/order/v1.0/events:polling`,
      {
        headers,
        params: {
          types: 'PLC,CFM,RTO,CAN,DSP,DLV,CON',
        },
      },
    );
    return response.data ?? [];
  }

  async acknowledgeEvents(events: Pick<IfoodOrderEvent, 'id' | 'code'>[]): Promise<void> {
    if (!events.length) return;
    const headers = await this.authHeaders();
    await this.http.post('/order/v1.0/events/acknowledgment', events, { headers });
  }

  async getOrder(orderId: string): Promise<IfoodOrder> {
    const headers = await this.authHeaders();
    const response = await this.http.get<IfoodOrder>(`/order/v1.0/orders/${orderId}`, { headers });
    return response.data;
  }

  async confirmOrder(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(`/order/v1.0/orders/${orderId}/statuses/confirmation`, {}, { headers });
    this.logger.log(`iFood pedido ${orderId} confirmado`);
  }

  async startPreparation(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(`/order/v1.0/orders/${orderId}/statuses/startPreparation`, {}, { headers });
  }

  async readyToPickup(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(`/order/v1.0/orders/${orderId}/statuses/readyToPickup`, {}, { headers });
  }

  async dispatch(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(`/order/v1.0/orders/${orderId}/statuses/dispatcher`, {}, { headers });
  }

  async requestCancellation(orderId: string, reason: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/order/v1.0/orders/${orderId}/statuses/cancellationRequested`,
      { reason },
      { headers },
    );
    this.logger.log(`iFood pedido ${orderId} cancelamento solicitado`);
  }

  async getCancellationReasons(orderId: string): Promise<{ cancelCodeId: string; description: string }[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get(`/order/v1.0/orders/${orderId}/cancellationReasons`, { headers });
    return response.data;
  }

  async getMerchants(): Promise<{ id: string; name: string; status: string }[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get('/merchant/v1.0/merchants', { headers });
    return response.data;
  }
}
