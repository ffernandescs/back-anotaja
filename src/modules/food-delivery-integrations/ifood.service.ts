import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { prisma } from '../../../lib/prisma';

export interface IfoodOrderEvent {
  id: string;
  code: string;
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
  type: string;
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
  method: string;
  type: string;
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
const MARGIN_MS = 120_000;

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
        'Credenciais iFood não configuradas. Configure ifood_client_id e ifood_client_secret no SystemConfig.',
      );
    }

    return { clientId: clientIdRow.value, clientSecret: clientSecretRow.value };
  }

  async getAccessToken(): Promise<string> {
    // Verifica token persistido
    const [tokenRow, expiresRow] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: TOKEN_KEY } }),
      prisma.systemConfig.findUnique({ where: { key: TOKEN_EXPIRES_KEY } }),
    ]);

    const expiresAt = expiresRow?.value ? parseInt(expiresRow.value, 10) : 0;
    if (tokenRow?.value && Date.now() < expiresAt - MARGIN_MS) {
      return tokenRow.value;
    }

    // Busca novas credenciais
    const { clientId, clientSecret } = await this.getMasterCredentials();

    this.logger.log(`Solicitando novo token iFood (clientId: ${clientId.slice(0, 8)}...)`);

    // iFood usa camelCase nos campos do form (clientId, clientSecret, grantType)
    const body =
      `clientId=${encodeURIComponent(clientId)}` +
      `&clientSecret=${encodeURIComponent(clientSecret)}` +
      `&grantType=client_credentials`;

    try {
      const response = await this.http.post<{
        accessToken: string;
        type: string;
        expiresIn: number;
      }>('/authentication/v1.0/oauth/token', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { accessToken: access_token, expiresIn: expires_in } = response.data;
      const newExpiresAt = Date.now() + expires_in * 1000;

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

    } catch (err: any) {
      // ─── LOG DETALHADO DO ERRO DE AUTH ────────────────────────────────────
      const status = err?.response?.status;
      const data = err?.response?.data;

      this.logger.error(
        `Falha ao obter token iFood.\n` +
        `  Status: ${status}\n` +
        `  Resposta: ${JSON.stringify(data)}\n` +
        `  clientId usado: ${clientId.slice(0, 8)}...\n` +
        `  Verifique se as credenciais no SystemConfig (ifood_client_id / ifood_client_secret) estão corretas.`,
      );

      throw err;
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async pollOrders(): Promise<IfoodOrderEvent[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get('/order/v1.0/events:polling', { headers });
    return response.data ?? [];
  }

  async acknowledgeEvents(events: Pick<IfoodOrderEvent, 'id' | 'code'>[]): Promise<void> {
    if (!events.length) return;
    const headers = await this.authHeaders();
    await this.http.post('/order/v1.0/events/acknowledgment', events, { headers });
  }

  async getOrder(orderId: string): Promise<IfoodOrder> {
    const headers = await this.authHeaders();
    try {
      const response = await this.http.get<any>(
        `/order/v1.0/orders/${orderId}`,
        { headers },
      );
      this.logger.debug(
        `[iFood raw order] ${orderId}: ${JSON.stringify(response.data)}`,
      );
      return response.data as IfoodOrder;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      this.logger.error(
        `Falha ao buscar pedido iFood ${orderId}.\n` +
        `  Status: ${status}\n` +
        `  Resposta: ${JSON.stringify(data)}`,
      );
      throw err;
    }
  }

  async confirmOrder(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    try {
      await this.http.post(
        `/order/v1.0/orders/${orderId}/statuses/confirmation`,
        {},
        { headers },
      );
      this.logger.log(`iFood pedido ${orderId} confirmado`);
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      this.logger.error(
        `Falha ao confirmar pedido iFood ${orderId}.\n` +
        `  Status: ${status}\n` +
        `  Resposta: ${JSON.stringify(data)}`,
      );
      throw err;
    }
  }

  async startPreparation(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/order/v1.0/orders/${orderId}/statuses/startPreparation`,
      {},
      { headers },
    );
  }

  async readyToPickup(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/order/v1.0/orders/${orderId}/statuses/readyToPickup`,
      {},
      { headers },
    );
  }

  async dispatch(orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/order/v1.0/orders/${orderId}/statuses/dispatcher`,
      {},
      { headers },
    );
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

  async getCancellationReasons(
    orderId: string,
  ): Promise<{ cancelCodeId: string; description: string }[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get(
      `/order/v1.0/orders/${orderId}/cancellationReasons`,
      { headers },
    );
    return response.data;
  }

  async getMerchants(): Promise<{ id: string; name: string; status: string }[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get('/merchant/v1.0/merchants', { headers });
    return response.data;
  }

  // ─── Diagnóstico: verifica credenciais e exibe detalhes ───────────────────

  async diagnose(): Promise<{
    credentialsFound: boolean;
    clientIdPreview: string | null;
    tokenValid: boolean;
    error: string | null;
  }> {
    let clientId: string | null = null;
    let tokenValid = false;
    let error: string | null = null;

    try {
      const creds = await this.getMasterCredentials();
      clientId = creds.clientId.slice(0, 8) + '...';
    } catch (e: any) {
      return {
        credentialsFound: false,
        clientIdPreview: null,
        tokenValid: false,
        error: e.message,
      };
    }

    try {
      await this.getAccessToken();
      tokenValid = true;
    } catch (e: any) {
      error = e?.response?.data
        ? JSON.stringify(e.response.data)
        : e.message;
    }

    return {
      credentialsFound: true,
      clientIdPreview: clientId,
      tokenValid,
      error,
    };
  }
}