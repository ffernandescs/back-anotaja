import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { prisma } from '../../../lib/prisma';

export interface NinetyNineFoodOrder {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  customer: { name: string; phone: string };
  items: NinetyNineFoodOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  payment: { method: string; prepaid: boolean };
  deliveryAddress?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

interface NinetyNineFoodOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

@Injectable()
export class NinetyNineFoodService {
  private readonly logger = new Logger(NinetyNineFoodService.name);
  private readonly BASE_URL = 'https://api.99food.com.br/v1';
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: this.BASE_URL });
  }

  private async getApiKey(): Promise<string> {
    const row = await prisma.systemConfig.findUnique({
      where: { key: 'ninetynine_food_api_key' },
    });

    if (!row?.value) {
      throw new UnprocessableEntityException(
        'API Key do 99Food não configurada no master.',
      );
    }

    return row.value;
  }

  private async authHeaders() {
    const apiKey = await this.getApiKey();
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }

  // Verifica se a chave master é válida
  async testAuth(): Promise<{ ok: boolean; message: string }> {
    try {
      const headers = await this.authHeaders();
      await this.http.get('/auth/validate', { headers });
      return { ok: true, message: 'Autenticação 99Food válida' };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.message || 'Falha na autenticação 99Food' };
    }
  }

  // Busca pedidos pendentes de uma loja
  async getOrders(merchantId: string): Promise<{ orders: NinetyNineFoodOrder[] }> {
    const headers = await this.authHeaders();
    const response = await this.http.get<NinetyNineFoodOrder[]>(
      `/merchants/${merchantId}/orders`,
      { headers, params: { status: 'PENDING' } },
    );
    return { orders: response.data ?? [] };
  }

  // Busca detalhes de um pedido
  async getOrder(merchantId: string, orderId: string): Promise<NinetyNineFoodOrder> {
    const headers = await this.authHeaders();
    const response = await this.http.get<NinetyNineFoodOrder>(
      `/merchants/${merchantId}/orders/${orderId}`,
      { headers },
    );
    return response.data;
  }

  // Aceita o pedido
  async acceptOrder(merchantId: string, orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/merchants/${merchantId}/orders/${orderId}/accept`,
      {},
      { headers },
    );
    this.logger.log(`99Food pedido ${orderId} aceito`);
  }

  // Marca pedido como em preparo
  async startPreparation(merchantId: string, orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/merchants/${merchantId}/orders/${orderId}/preparing`,
      {},
      { headers },
    );
  }

  // Marca pedido como pronto
  async markReady(merchantId: string, orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/merchants/${merchantId}/orders/${orderId}/ready`,
      {},
      { headers },
    );
  }

  // Despacha pedido para entrega
  async dispatch(merchantId: string, orderId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/merchants/${merchantId}/orders/${orderId}/dispatch`,
      {},
      { headers },
    );
  }

  // Cancela o pedido
  async cancelOrder(merchantId: string, orderId: string, reason: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/merchants/${merchantId}/orders/${orderId}/cancel`,
      { reason },
      { headers },
    );
    this.logger.log(`99Food pedido ${orderId} cancelado`);
  }
}
