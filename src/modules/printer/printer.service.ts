import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, Prisma } from '@prisma/client';
import { money } from '../../utils/money';
import { prisma } from 'lib/prisma';

export interface PrinterOrderData {
  number: string;
  table?: string;
  payment: string;
  discount: number;
  notes?: string;
  store: {
    name: string;
    cnpj?: string;
    address?: string;
  };
  items: Array<{
    name: string;
    qty: number;
    price: number;
    complements?: Array<{
      name: string;
      options: Array<{
        name: string;
        qty: number;
        price: number;
      }>;
    }>;
  }>;
}

export interface PrinterConfig {
  enabled: boolean;
  endpoint: string;
  brand: 'daruma' | 'epson' | 'bematech' | 'generic';
  autoPrint: boolean;
  printOnPayment: boolean;
  copies: number;
}

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);
  private config: PrinterConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      enabled: this.configService.get('PRINTER_ENABLED', 'false') === 'true',
      endpoint: this.configService.get('PRINTER_ENDPOINT', 'http://localhost:3131'),
      brand: (this.configService.get('PRINTER_BRAND', 'daruma') as any) || 'daruma',
      autoPrint: this.configService.get('PRINTER_AUTO_PRINT', 'true') === 'true',
      printOnPayment: this.configService.get('PRINTER_PRINT_ON_PAYMENT', 'false') === 'true',
      copies: parseInt(this.configService.get('PRINTER_COPIES', '1')),
    };
  }

  async printOrder(order: any, branch: any): Promise<void> {
    this.logger.debug(`printOrder called for order #${order.orderNumber}`);
    
    if (!this.config.enabled) {
      this.logger.debug('Printer service disabled - skipping print');
      return;
    }

    try {
      const orderData = this.formatOrderForPrinter(order, branch);
      this.logger.debug(`Formatted order data: ${JSON.stringify(orderData, null, 2)}`);
      
      await this.sendToPrinter(orderData);
      this.logger.log(`Order #${order.orderNumber} sent to printer successfully`);
    } catch (error) {
      this.logger.error(`Failed to print order #${order.orderNumber}:`, error instanceof Error ? error.message : String(error));
      // Não lançar erro para não quebrar fluxo principal
    }
  }

  async printOrderIfPaid(order: any, branch: any): Promise<void> {
    if (order.paymentStatus === 'PAID' && this.config.printOnPayment) {
      await this.printOrder(order, branch);
    }
  }

  async printOrderOnCreate(order: any, branch: any): Promise<void> {
    this.logger.debug(`printOrderOnCreate called - enabled: ${this.config.enabled}, autoPrint: ${this.config.autoPrint}`);
    
    if (!this.config.enabled) {
      this.logger.debug('Printer service disabled - skipping print');
      return;
    }

    if (!this.config.autoPrint) {
      this.logger.debug('Auto print disabled - skipping print');
      return;
    }

    this.logger.log(`🖨️ Auto-printing order #${order.orderNumber} on creation`);
    await this.printOrder(order, branch);
  }

  private formatOrderForPrinter(order: any, branch: any): PrinterOrderData {
    const items = order.items?.map((item: any) => {
      // Processar complementos e opções
      const complements = item.complements?.map((complement: any) => ({
        name: complement.complement?.name || complement.name || 'Complemento',
        options: complement.options?.map((option: any) => ({
          name: option.option?.name || option.name || 'Opção',
          qty: option.quantity || 1,
          price: Number(option.price || 0),
        })) || [],
      })) || [];

      return {
        name: item.product?.name || 'Item desconhecido',
        qty: item.quantity,
        price: Number(item.price),
        complements: complements.length > 0 ? complements : undefined,
      };
    }) || [];

    const paymentMethod = this.getPaymentMethodText(order);

    return {
      number: String(order.orderNumber).padStart(4, '0'),
      table: order.tableNumber || order.deliveryType === 'DELIVERY' ? 'Entrega' : undefined,
      payment: paymentMethod,
      discount: Number(order.discount || 0),
      notes: order.notes || undefined,
      store: {
        name: branch?.branchName || 'Estabelecimento',
        cnpj: branch?.company?.cnpj || undefined,
        address: branch?.address || undefined,
      },
      items,
    };
  }

  private getPaymentMethodText(order: any): string {
    const payments = order.payments || [];
    if (payments.length === 0) return 'Não informado';

    if (payments.length === 1) {
      const payment = payments[0];
      return this.normalizePaymentMethod(payment.type || payment.paymentMethod);
    }

    // Múltiplos pagamentos
    const methods = payments.map((p: any) => 
      this.normalizePaymentMethod(p.type || p.paymentMethod)
    );
    return methods.join(' + ');
  }

  private normalizePaymentMethod(method: string): string {
    const value = String(method || '').toLowerCase();
    
    if (['pix'].includes(value)) return 'PIX';
    if (['dinheiro', 'cash'].includes(value)) return 'Dinheiro';
    if (['credito', 'crédito', 'credit', 'credit_card', 'cartão de crédito', 'cartao de credito'].includes(value))
      return 'Cartão Crédito';
    if (['debito', 'débito', 'debit', 'debit_card', 'cartão de débito', 'cartao de debito'].includes(value))
      return 'Cartão Débito';
    if (['vale', 'vale refeição', 'vale alimentação', 'vr', 'va'].includes(value))
      return 'Vale Refeição';
    
    return 'Outros';
  }

  private async sendToPrinter(orderData: PrinterOrderData): Promise<void> {
    const payload = {
      order: orderData,
      copies: this.config.copies,
    };

    this.logger.debug(`Sending to printer endpoint: ${this.config.endpoint}/print`);
    this.logger.debug(`Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = await fetch(`${this.config.endpoint}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    this.logger.debug(`Printer API response status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Printer API error: ${error.error || error.message}`);
    }

    const result = await response.json();
    this.logger.debug(`Printer API response: ${JSON.stringify(result)}`);
    return result;
  }

  async getPrinterStatus(): Promise<any> {
    if (!this.config.enabled) return { status: 'disabled' };

    try {
      const response = await fetch(`${this.config.endpoint}/status`);
      return response.json();
    } catch (error) {
      this.logger.error('Failed to get printer status:', error instanceof Error ? error.message : String(error));
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  async clearPrinterQueue(): Promise<void> {
    // Implementar limpeza de fila se necessário
    this.logger.log('Printer queue cleared');
  }

  // ── CRUD Methods for Printers ───────────────────────────────────────────────

  async findAll(userId: string) {
    // Buscar usuário para obter o branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    return prisma.printer.findMany({
      where: { branchId: user.branchId },
      include: {
        sectorConfig: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
            icon: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(createPrinterDto: any, userId: string) {
    // Buscar usuário para obter o branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    // O frontend agora envia apenas sectorConfigId
    const { sectorConfigId, ...data } = createPrinterDto;

    return prisma.printer.create({
      data: {
        ...data,
        branchId: user.branchId,
        status: 'OFFLINE',
        // Se sectorConfigId foi enviado, usar ele
        ...(sectorConfigId && { sectorConfigId }),
      },
    });
  }

  async update(id: string, updatePrinterDto: any) {
    return prisma.printer.update({
      where: { id },
      data: updatePrinterDto,
    });
  }

  async remove(id: string) {
    return prisma.printer.delete({
      where: { id },
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    return prisma.printer.update({
      where: { id },
      data: { 
        isActive,
        status: isActive ? 'ONLINE' : 'OFFLINE'
      },
    });
  }

  getConfig(): PrinterConfig {
    return { ...this.config };
  }
}
