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

  async processEvent(event: IfoodOrderEvent, branchId: string): Promise<void> {
    this.logger.log(`Processando evento iFood ${event.code} para pedido ${event.orderId}`);

    try {
      if (event.code === 'PLC') {
        await this.handleNewOrder(event.orderId, branchId);
        return;
      }

      // All other events update local order status
      const mapping = await prisma.ifoodOrderMapping.findUnique({
        where: { ifoodOrderId: event.orderId },
      });

      const localStatus = this.mapEventToLocalStatus(event.code);
      if (!localStatus) return;

      // Update mapping status
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
    } catch (err: any) {
      this.logger.error(
        `Erro ao processar evento iFood ${event.code} (${event.orderId}): ${err.message}`,
        err.stack,
      );
    }
  }

  private mapEventToLocalStatus(code: string): string | null {
    const map: Record<string, string> = {
      CFM: 'CONFIRMED',
      RTO: 'READY',
      DSP: 'DELIVERING',
      CON: 'COMPLETED',
      CAN: 'CANCELLED',
    };
    return map[code] ?? null;
  }

  private async handleNewOrder(ifoodOrderId: string, branchId: string): Promise<void> {
    // Idempotency — skip if already processed
    const existing = await prisma.ifoodOrderMapping.findUnique({ where: { ifoodOrderId } });
    if (existing?.localOrderId) {
      this.logger.warn(`iFood pedido ${ifoodOrderId} já processado → ${existing.localOrderId}`);
      return;
    }

    const ifoodOrder = await this.ifoodService.getOrder(ifoodOrderId);
    const { mappedItems, unmappedNames } = await this.mapItems(ifoodOrder.items, branchId);

    // Store the raw mapping first (idempotency)
    await prisma.ifoodOrderMapping.upsert({
      where: { ifoodOrderId },
      create: {
        id: uuidv4(),
        branchId,
        ifoodOrderId,
        ifoodStatus: 'PLC',
        displayId: ifoodOrder.displayId || ifoodOrder.shortReference,
        rawData: ifoodOrder as any,
      },
      update: {
        ifoodStatus: 'PLC',
        displayId: ifoodOrder.displayId || ifoodOrder.shortReference,
        rawData: ifoodOrder as any,
      },
    });

    if (!mappedItems.length) {
      this.logger.warn(
        `iFood pedido ${ifoodOrderId}: nenhum produto mapeado. Itens: ${unmappedNames.join(', ')}`,
      );
      // Emit unmapped notification via WebSocket so operator can review
      if (this.wsGateway) {
        (this.wsGateway as any).server
          ?.to(`branch:${branchId}`)
          ?.emit('ifood:unmapped_order', {
            ifoodOrderId,
            displayId: ifoodOrder.displayId || ifoodOrder.shortReference,
            unmappedItems: unmappedNames,
            rawOrder: ifoodOrder,
          });
      }
      return;
    }

    const deliveryType = this.mapDeliveryType(ifoodOrder.type);
    const serviceType = deliveryType === DeliveryType.PICKUP ? ServiceType.TAKEAWAY : ServiceType.TAKEAWAY;
    const { payments, paymentStatus, paidAmount } = await this.mapPayments(
      ifoodOrder.payments.methods,
      branchId,
      ifoodOrder.totalPrice,
    );

    // Build notes with unmapped items info
    let notes = ifoodOrder.additionalInfo || '';
    if (unmappedNames.length) {
      const unmappedNote = `[iFood - itens sem mapeamento: ${unmappedNames.join(', ')}]`;
      notes = notes ? `${notes}\n${unmappedNote}` : unmappedNote;
    }

    const subtotal = Math.round(ifoodOrder.subTotal * 100);
    const deliveryFee = Math.round(ifoodOrder.deliveryFee * 100);
    const total = Math.round(ifoodOrder.totalPrice * 100);

    const order = await prisma.$transaction(async (tx) => {
      const lastOrder = await tx.order.findFirst({
        where: { branchId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      return tx.order.create({
        data: {
          id: uuidv4(),
          orderNumber,
          status: OrderStatus.PENDING,
          deliveryType,
          serviceType,
          channel: OrderChannel.IFOOD,
          customerType: CustomerType.GUEST,
          paymentStatus,
          paidAmount,
          total,
          subtotal,
          deliveryFee,
          serviceFee: 0,
          discount: 0,
          branchId,
          notes: notes || null,
          items: {
            create: mappedItems.map((item) => ({
              id: uuidv4(),
              quantity: item.quantity,
              price: item.price,
              notes: item.notes,
              productId: item.productId,
            })),
          },
          payments: payments.length
            ? {
                create: payments.map((p) => ({
                  id: uuidv4(),
                  type: p.type,
                  amount: p.amount,
                  status: p.status,
                  paymentMethodId: p.paymentMethodId,
                  change: p.change,
                })),
              }
            : undefined,
        },
        include: {
          items: { include: { product: true } },
          customer: true,
          payments: true,
          branch: true,
        },
      });
    });

    // Update mapping with local order ID
    await prisma.ifoodOrderMapping.update({
      where: { ifoodOrderId },
      data: { localOrderId: order.id },
    });

    // Auto-confirm to iFood (must be done within 8 minutes)
    try {
      await this.ifoodService.confirmOrder(ifoodOrderId);
      await prisma.ifoodOrderMapping.update({
        where: { ifoodOrderId },
        data: { ifoodStatus: 'CFM' },
      });
    } catch (err: any) {
      this.logger.error(`Falha ao confirmar pedido iFood ${ifoodOrderId}: ${err.message}`);
    }

    // Emit new order via WebSocket
    this.wsGateway.emitNewOrder(branchId, {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      channel: order.channel,
      customer: { name: ifoodOrder.customer.name, phone: ifoodOrder.customer.phone.number },
      total: order.total,
      createdAt: order.createdAt.toISOString(),
      ifoodOrderId,
      displayId: ifoodOrder.displayId || ifoodOrder.shortReference,
    });

    this.logger.log(
      `iFood pedido ${ifoodOrderId} → pedido local #${order.orderNumber} (${order.id})`,
    );
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
