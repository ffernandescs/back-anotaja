import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DeliveryType, OrderChannel, OrderStatus, PaymentMethodType, ServiceType, CustomerType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { IfoodService, IfoodOrder, IfoodOrderEvent, IfoodOrderItem, IfoodPaymentMethod } from './ifood.service';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';

interface MappedItem {
  productId: string;
  quantity: number;
  price: number; // cents
  notes?: string;
}

interface MappedPayment {
  type: string;
  amount: number; // cents
  status: 'PENDING' | 'PAID';
  paymentMethodId: string;
  change: number;
}

@Injectable()
export class IfoodOrderProcessorService {
  private readonly logger = new Logger(IfoodOrderProcessorService.name);

  constructor(
    private readonly ifoodService: IfoodService,
    private readonly wsGateway: OrdersWebSocketGateway,
  ) {}

async processEvent(event: IfoodOrderEvent, branchId: string): Promise<boolean> {
  this.logger.log(`Processando evento iFood ${event.code} para pedido ${event.orderId}`);

  try {
    // KEEPALIVE ou eventos inúteis
    if (event.code === 'KEEPALIVE') {
      return false;
    }

    if (event.code === 'PLC') {
      await this.handleNewOrder(event.orderId, branchId);
      return true;
    }

    const mapping = await prisma.ifoodOrderMapping.findUnique({
      where: { ifoodOrderId: event.orderId },
    });

    const localStatus = this.mapEventToLocalStatus(event.code);
    if (!localStatus) return false;

    await prisma.ifoodOrderMapping.update({
      where: { ifoodOrderId: event.orderId },
      data: { ifoodStatus: event.code },
    });

    if (mapping?.localOrderId) {
      await prisma.order.update({
        where: { id: mapping.localOrderId },
        data: { status: localStatus as OrderStatus },
      });

      this.logger.log(`Pedido local ${mapping.localOrderId} → ${localStatus}`);
    }

    return true;
  } catch (err: any) {
    this.logger.error(
      `Erro ao processar evento iFood ${event.code} (${event.orderId}): ${err.message}`,
      err.stack,
    );
    return false;
  }
}

private isStatusRegression(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  const priority: Record<OrderStatus, number> = {
    PENDING: 1,
    CONFIRMED: 2,
    IN_PROGRESS: 3,
    READY: 4,
    DELIVERING: 5,
    DELIVERED: 6,
    COMPLETED: 7,
    CANCELLED: 0,
  };

  return priority[next] < priority[current];
}
  private mapEventToLocalStatus(code: string): OrderStatus | null {
    const map: Record<string, OrderStatus> = {
      CFM: OrderStatus.CONFIRMED,
      RTO: OrderStatus.READY,
      DSP: OrderStatus.DELIVERING,
      CON: OrderStatus.COMPLETED,
      CAN: OrderStatus.CANCELLED,
    };

    return map[code] ?? null;
  }

 private async handleNewOrder(ifoodOrderId: string, branchId: string) {
  const existing = await prisma.ifoodOrderMapping.findUnique({
    where: { ifoodOrderId },
  });

  if (existing?.localOrderId) {
    this.logger.warn(`Pedido já existe: ${ifoodOrderId}`);
    return;
  }

  let ifoodOrder: IfoodOrder;

  try {
    ifoodOrder = await this.ifoodService.getOrder(ifoodOrderId);
  } catch (err) {
    this.logger.error(`Erro ao buscar pedido ${ifoodOrderId}`);
    throw err; // 🔥 importante pra não dar ACK
  }

  // resto do seu código...

  // ✅ confirmação com retry
  await this.safeConfirmOrder(ifoodOrderId);
}

private async safeConfirmOrder(orderId: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await this.ifoodService.confirmOrder(orderId);
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

  private async mapItems(
    ifoodItems: IfoodOrderItem[],
    branchId: string,
  ): Promise<{ mappedItems: MappedItem[]; unmappedNames: string[] }> {
    const externalCodes = ifoodItems.map((i) => i.externalCode).filter(Boolean);

    const mappings = await prisma.ifoodProductMapping.findMany({
      where: { branchId, ifoodExternalCode: { in: externalCodes } },
    });

    const mappingByCode = new Map(mappings.map((m) => [m.ifoodExternalCode, m]));
    const mappedItems: MappedItem[] = [];
    const unmappedNames: string[] = [];

    for (const item of ifoodItems) {
      const mapping = mappingByCode.get(item.externalCode);

      if (!mapping?.localProductId) {
        unmappedNames.push(`${item.name} (x${item.quantity})`);

        // Save unknown items to mapping table for later
        await prisma.ifoodProductMapping.upsert({
          where: { branchId_ifoodExternalCode: { branchId, ifoodExternalCode: item.externalCode } },
          create: {
            id: uuidv4(),
            branchId,
            ifoodExternalCode: item.externalCode,
            ifoodItemName: item.name,
            isOption: false,
          },
          update: { ifoodItemName: item.name },
        });
        continue;
      }

      const priceInCents = Math.round(item.price * 100);
      const itemNotes = item.notes || undefined;

      mappedItems.push({
        productId: mapping.localProductId,
        quantity: item.quantity,
        price: priceInCents,
        notes: itemNotes,
      });
    }

    return { mappedItems, unmappedNames };
  }

  private async mapPayments(
    methods: IfoodPaymentMethod[],
    branchId: string,
    totalPrice: number,
  ): Promise<{ payments: MappedPayment[]; paymentStatus: string; paidAmount: number }> {
    const totalCents = Math.round(totalPrice * 100);
    const payments: MappedPayment[] = [];
    let paidAmount = 0;

    for (const method of methods) {
      const localType = this.mapPaymentType(method.method, method.prepaid);
      const amountCents = Math.round(method.value * 100);
      const isPaid = method.prepaid;

      const branchPaymentMethod = await prisma.branchPaymentMethod.findFirst({
        where: {
          branchId,
          paymentMethod: { type: localType },
        },
        include: { paymentMethod: true },
      });

      if (!branchPaymentMethod) {
        this.logger.warn(
          `Branch ${branchId} não tem método de pagamento do tipo ${localType} — pulando`,
        );
        if (isPaid) paidAmount += amountCents;
        continue;
      }

      const change = method.cash?.changeFor
        ? Math.round(method.cash.changeFor * 100) - amountCents
        : 0;

      payments.push({
        type: localType,
        amount: amountCents,
        status: isPaid ? 'PAID' : 'PENDING',
        paymentMethodId: branchPaymentMethod.id,
        change: Math.max(0, change),
      });

      if (isPaid) paidAmount += amountCents;
    }

    const paymentStatus =
      paidAmount >= totalCents ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    return { payments, paymentStatus, paidAmount };
  }

  private mapDeliveryType(ifoodType: string): DeliveryType {
    switch (ifoodType?.toUpperCase()) {
      case 'DELIVERY':
        return DeliveryType.DELIVERY;
      case 'TAKEOUT':
        return DeliveryType.PICKUP;
      case 'INDOOR':
        return DeliveryType.DINE_IN;
      default:
        return DeliveryType.DELIVERY;
    }
  }

  private mapPaymentType(method: string, prepaid: boolean): PaymentMethodType {
    if (prepaid) return PaymentMethodType.ONLINE;
    switch (method?.toUpperCase()) {
      case 'CASH':
        return PaymentMethodType.CASH;
      case 'CREDIT':
        return PaymentMethodType.CREDIT;
      case 'DEBIT':
        return PaymentMethodType.DEBIT;
      case 'PIX':
        return PaymentMethodType.PIX;
      case 'MEAL_VOUCHER':
        return PaymentMethodType.MEAL_VOUCHER;
      case 'FOOD_VOUCHER':
        return PaymentMethodType.FOOD_VOUCHER;
      case 'DIGITAL_WALLET':
        return PaymentMethodType.ONLINE;
      default:
        return PaymentMethodType.OTHER;
    }
  }
}
