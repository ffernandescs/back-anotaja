import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  DeliveryType,
  OrderChannel,
  OrderStatus,
  PaymentMethodType,
  ServiceType,
  CustomerType,
  PreparationStatus,
  DispatchStatus,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  IfoodService,
  IfoodOrder,
  IfoodOrderEvent,
  IfoodOrderItem,
  IfoodPaymentMethod,
} from './ifood.service';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';

interface MappedOption {
  optionId: string;
  complementId: string;
  quantity: number;
  price: number; // cents
}

interface MappedItem {
  productId: string;
  quantity: number;
  price: number; // cents
  notes?: string;
  options: MappedOption[];
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

  // ─────────────────────────────────────────────────────────────
  // ENTRY POINT: processa um evento recebido do polling
  // ─────────────────────────────────────────────────────────────
  async processEvent(event: IfoodOrderEvent, branchId: string): Promise<boolean> {
    this.logger.log(`Processando evento iFood ${event.code} para pedido ${event.orderId}`);

    try {
      if (event.code === 'KEEPALIVE') {
        return false;
      }

      if (event.code === 'PLC') {
        await this.handleNewOrder(event.orderId, branchId);
        return true;
      }

      // Para outros eventos, atualiza o status do pedido local
      const localStatus = this.mapEventToLocalStatus(event.code);
      if (!localStatus) return false;

      const mapping = await prisma.ifoodOrderMapping.findUnique({
        where: { ifoodOrderId: event.orderId },
      });

      // Atualiza o status no mapeamento mesmo sem pedido local
      await prisma.ifoodOrderMapping.upsert({
        where: { ifoodOrderId: event.orderId },
        create: {
          id: uuidv4(),
          branchId,
          ifoodOrderId: event.orderId,
          ifoodStatus: event.code,
        },
        update: { ifoodStatus: event.code },
      });

      if (mapping?.localOrderId) {
        const currentOrder = await prisma.order.findUnique({
          where: { id: mapping.localOrderId },
        });

        // Proteção contra regressão de status
        if (currentOrder && this.isStatusRegression(currentOrder.status, localStatus)) {
          this.logger.warn(
            `Evento ${event.code} ignorado: tentativa de regredir status ` +
            `${currentOrder.status} → ${localStatus} no pedido ${mapping.localOrderId}`,
          );
          return true;
        }

        await prisma.order.update({
          where: { id: mapping.localOrderId },
          data: { status: localStatus },
        });

        this.logger.log(`Pedido local ${mapping.localOrderId} → ${localStatus}`);

        // Notifica frontend via WebSocket
        const updatedOrder = await prisma.order.findUnique({
          where: { id: mapping.localOrderId },
          include: {
            items: { include: { product: true } },
            customer: true,
            payments: true,
            branch: true,
          },
        });

        if (updatedOrder) {
          this.wsGateway.emitOrderUpdate(updatedOrder, 'order:status_changed');
        }
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

  // ─────────────────────────────────────────────────────────────
  // NOVO PEDIDO (PLC)
  // ─────────────────────────────────────────────────────────────
  private async handleNewOrder(ifoodOrderId: string, branchId: string): Promise<void> {
    // Idempotência: evita criar o mesmo pedido duas vezes
    const existing = await prisma.ifoodOrderMapping.findUnique({
      where: { ifoodOrderId },
    });

    if (existing?.localOrderId) {
      this.logger.warn(`Pedido iFood ${ifoodOrderId} já processado → local ${existing.localOrderId}`);
      return;
    }

    // 1. Busca detalhes do pedido na API iFood
    let ifoodOrder: IfoodOrder;
    try {
      ifoodOrder = await this.ifoodService.getOrder(ifoodOrderId);
    } catch (err: any) {
      this.logger.error(`Erro ao buscar pedido iFood ${ifoodOrderId}: ${err.message}`);
      throw err; // Re-throw para evitar ACK indevido
    }

    this.logger.log(
      `Pedido iFood recebido: ${ifoodOrder.displayId} | ${ifoodOrder.customer.name}`,
    );
    this.logger.debug(
      `[iFood valores brutos] displayId=${ifoodOrder.displayId} ` +
      `totalPrice=${ifoodOrder.totalPrice} ` +
      `subTotal=${ifoodOrder.subTotal} ` +
      `deliveryFee=${ifoodOrder.deliveryFee} ` +
      `totalFee=${ifoodOrder.totalFee} ` +
      `payments=${JSON.stringify(
        ifoodOrder.payments.methods.map((m) => ({ method: m.method, value: m.value, prepaid: m.prepaid }))
      )}`,
    );

    // 2. Mapeia itens para produtos locais
    const { mappedItems, unmappedNames } = await this.mapItems(ifoodOrder.items, branchId);

    if (unmappedNames.length > 0) {
      this.logger.warn(
        `Pedido ${ifoodOrderId}: ${unmappedNames.length} item(ns) sem mapeamento local: ` +
        unmappedNames.join(', '),
      );
    }

    // 3. Cria ou busca o cliente local
    const customer = await this.findOrCreateCustomer(ifoodOrder, branchId);

    // 5. Calcula valores do pedido
    const deliveryType = this.mapDeliveryType(ifoodOrder.type);
    const subtotalCents = Math.round((ifoodOrder.subTotal ?? 0) * 100);
    const deliveryFeeCents = Math.round((ifoodOrder.deliveryFee ?? 0) * 100);
    const totalFeeCents = Math.round((ifoodOrder.totalFee ?? 0) * 100);
    const totalFromApi = Math.round((ifoodOrder.totalPrice ?? 0) * 100);

    // 4. Mapeia pagamentos (passa 0 como placeholder; total será recalculado abaixo)
    const { payments, paidAmount } = await this.mapPayments(
      ifoodOrder.payments.methods,
      branchId,
      0,
    );

    // Total a partir dos itens (mais confiável quando campos financeiros vêm undefined)
    const itemsTotalCents = ifoodOrder.items.reduce(
      (sum, item) => sum + Math.round((item.totalPrice ?? item.price ?? 0) * 100),
      0,
    );

    // Total em cascata: totalPrice → subTotal+taxas → itens → paidAmount
    const totalCentsCalc =
      totalFromApi ||
      (subtotalCents + deliveryFeeCents + totalFeeCents) ||
      itemsTotalCents ||
      paidAmount;

    this.logger.debug(
      `[iFood total calculado] displayId=${ifoodOrder.displayId} ` +
      `totalFromApi=${totalFromApi} subtotal+fees=${subtotalCents + deliveryFeeCents + totalFeeCents} ` +
      `itemsTotal=${itemsTotalCents} paidAmount=${paidAmount} → usando=${totalCentsCalc}`,
    );

    const paymentStatus =
      paidAmount >= totalCentsCalc ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    // 6. Cria o pedido local dentro de uma transação
    const localOrder = await prisma.$transaction(async (tx) => {
      // Número sequencial do pedido
      const lastOrder = await tx.order.findFirst({
        where: { branchId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      // Cria o pedido
      const order = await tx.order.create({
        data: {
          orderNumber,
          branchId,
          channel: OrderChannel.IFOOD,
          serviceType: ServiceType.TAKEAWAY,
          customerType: customer ? CustomerType.REGISTERED : CustomerType.GUEST,
          customerId: customer?.id ?? null,
          status: OrderStatus.CONFIRMED, // iFood já confirmou
          preparationStatus: PreparationStatus.PENDING,
          dispatchStatus:
            deliveryType === DeliveryType.DELIVERY
              ? DispatchStatus.PENDING
              : undefined,
          deliveryType,
          subtotal: subtotalCents,
          deliveryFee: deliveryFeeCents,
          serviceFee: 0,
          discount: 0,
          total: totalCentsCalc,
          paymentStatus,
          paidAmount,
          notes: typeof ifoodOrder.additionalInfo === 'string'
            ? ifoodOrder.additionalInfo
            : ifoodOrder.additionalInfo
              ? JSON.stringify(ifoodOrder.additionalInfo)
              : null,

          // Cria os pagamentos
          payments: payments.length > 0
            ? {
                create: payments.map((p) => ({
                  type: p.type,
                  amount: p.amount,
                  status: p.status === 'PAID' ? PaymentStatus.PAID : PaymentStatus.PENDING,
                  paymentMethodId: p.paymentMethodId,
                  change: p.change,
                })),
              }
            : undefined,
        },
      });

      // Cria os itens com seus complementos
      for (const item of mappedItems) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            notes: item.notes,
          },
        });

        if (item.options.length > 0) {
          // Agrupa opções pelo complementId para criar um OrderItemComplement por grupo
          const byComplement = new Map<string, MappedOption[]>();
          for (const opt of item.options) {
            const group = byComplement.get(opt.complementId) ?? [];
            group.push(opt);
            byComplement.set(opt.complementId, group);
          }

          for (const [complementId, opts] of byComplement) {
            const orderItemComplement = await tx.orderItemComplement.create({
              data: { orderItemId: orderItem.id, complementId },
            });

            for (const opt of opts) {
              await tx.orderItemComplementOption.create({
                data: {
                  orderItemComplementId: orderItemComplement.id,
                  optionId: opt.optionId,
                  quantity: opt.quantity,
                },
              });
            }
          }
        }
      }

      // Cria o mapeamento iFood → local
      await tx.ifoodOrderMapping.upsert({
        where: { ifoodOrderId },
        create: {
          id: uuidv4(),
          branchId,
          ifoodOrderId,
          localOrderId: order.id,
          ifoodStatus: 'PLC',
          displayId: ifoodOrder.displayId,
          rawData: ifoodOrder as any,
        },
        update: {
          localOrderId: order.id,
          ifoodStatus: 'PLC',
          displayId: ifoodOrder.displayId,
          rawData: ifoodOrder as any,
        },
      });

      return order;
    });

    this.logger.log(
      `Pedido iFood ${ifoodOrderId} → local #${localOrder.orderNumber} (id: ${localOrder.id})`,
    );

    // 7. Confirma o pedido na API iFood (com retry)
    await this.safeConfirmOrder(ifoodOrderId);

    // 8. Busca pedido completo para o WebSocket
    const fullOrder = await prisma.order.findUnique({
      where: { id: localOrder.id },
      include: {
        items: { include: { product: true } },
        customer: true,
        payments: true,
        branch: true,
      },
    });

    // 9. Emite evento WebSocket para o frontend
    if (fullOrder) {
      this.wsGateway.emitOrderUpdate(fullOrder, 'order:created');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  private async findOrCreateCustomer(ifoodOrder: IfoodOrder, branchId: string) {
    const phone = ifoodOrder.customer.phone?.number;
    if (!phone) return null;

    // Normaliza o telefone removendo caracteres não numéricos
    const normalizedPhone = phone.replace(/\D/g, '');

    try {
      const existing = await prisma.customer.findFirst({
        where: { phone: normalizedPhone, branchId },
      });

      if (existing) return existing;

      return await prisma.customer.create({
        data: {
          id: uuidv4(),
          name: ifoodOrder.customer.name,
          phone: normalizedPhone,
          branchId,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Não foi possível criar cliente iFood: ${err.message}`);
      return null;
    }
  }

  private async safeConfirmOrder(orderId: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.ifoodService.confirmOrder(orderId);
        this.logger.log(`iFood pedido ${orderId} confirmado`);
        return;
      } catch (err: any) {
        const status = err?.response?.status;

        // 404 = pedido de teste ou já confirmado — não tentar novamente
        if (status === 404) {
          this.logger.warn(`iFood pedido ${orderId} retornou 404 no confirm (pedido de teste ou já confirmado) — ignorando`);
          return;
        }

        this.logger.warn(
          `Tentativa ${i + 1}/${retries} de confirmar pedido ${orderId} falhou: ${err.message}`,
        );
        if (i === retries - 1) {
          this.logger.warn(`Não foi possível confirmar pedido iFood ${orderId} — pedido já salvo localmente`);
          return; // best-effort, não re-throw
        }
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  private isStatusRegression(current: OrderStatus, next: OrderStatus): boolean {
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

  private async mapItems(
    ifoodItems: IfoodOrderItem[],
    branchId: string,
  ): Promise<{ mappedItems: MappedItem[]; unmappedNames: string[] }> {
    const externalCodes = ifoodItems.map((i) => i.externalCode).filter(Boolean);

    // 1. Busca produtos por codigoPDV (mapeamento automático)
    const productsByPdv = await prisma.product.findMany({
      where: { branchId, codigoPDV: { in: externalCodes } },
      select: { id: true, codigoPDV: true },
    });
    const productByPdvCode = new Map(productsByPdv.map((p) => [p.codigoPDV!, p.id]));

    // 2. Busca mapeamentos manuais existentes (fallback para produtos)
    const mappings = await prisma.ifoodProductMapping.findMany({
      where: { branchId, ifoodExternalCode: { in: externalCodes } },
    });
    const mappingByCode = new Map(mappings.map((m) => [m.ifoodExternalCode, m]));

    // 3. Busca opções de complemento por codigoPDV (batch, todos os itens)
    const allOptionCodes = ifoodItems
      .flatMap((i) => i.options ?? [])
      .map((o) => o.externalCode)
      .filter(Boolean);

    const complementOptionsByPdv = allOptionCodes.length
      ? await prisma.complementOption.findMany({
          where: { branchId, codigoPDV: { in: allOptionCodes } },
          select: {
            id: true,
            codigoPDV: true,
            complement: { select: { id: true, productId: true } },
          },
        })
      : [];
    const optionByPdvCode = new Map(complementOptionsByPdv.map((o) => [o.codigoPDV!, o]));

    const mappedItems: MappedItem[] = [];
    const unmappedNames: string[] = [];

    for (const item of ifoodItems) {
      // Resolve productId — prioridade 1: codigoPDV, prioridade 2: mapeamento manual
      const productId =
        productByPdvCode.get(item.externalCode) ??
        mappingByCode.get(item.externalCode)?.localProductId ??
        null;

      if (!productId) {
        unmappedNames.push(`${item.name} (x${item.quantity})`);
        await prisma.ifoodProductMapping.upsert({
          where: { branchId_ifoodExternalCode: { branchId, ifoodExternalCode: item.externalCode } },
          create: { id: uuidv4(), branchId, ifoodExternalCode: item.externalCode, ifoodItemName: item.name, isOption: false },
          update: { ifoodItemName: item.name },
        });
        continue;
      }

      // Mapeia as opções de complemento do item
      const mappedOptions: MappedOption[] = [];
      for (const ifoodOption of item.options ?? []) {
        const matched = optionByPdvCode.get(ifoodOption.externalCode);
        if (!matched) {
          // Registra opção sem mapeamento para mapeamento manual posterior
          await prisma.ifoodProductMapping.upsert({
            where: { branchId_ifoodExternalCode: { branchId, ifoodExternalCode: ifoodOption.externalCode } },
            create: { id: uuidv4(), branchId, ifoodExternalCode: ifoodOption.externalCode, ifoodItemName: ifoodOption.name, isOption: true },
            update: { ifoodItemName: ifoodOption.name },
          });
          continue;
        }

        // Prefere o complemento associado ao produto pedido; fallback para o primeiro
        const complement =
          matched.complement.find((c) => c.productId === productId) ??
          matched.complement[0];

        if (!complement) continue;

        mappedOptions.push({
          optionId: matched.id,
          complementId: complement.id,
          quantity: ifoodOption.quantity,
          price: Math.round(ifoodOption.price * 100),
        });
      }

      mappedItems.push({
        productId,
        quantity: item.quantity,
        price: Math.round(item.price * 100),
        notes: item.notes || undefined,
        options: mappedOptions,
      });
    }

    return { mappedItems, unmappedNames };
  }

  private async mapPayments(
    methods: IfoodPaymentMethod[],
    branchId: string,
    totalCents: number,
  ): Promise<{ payments: MappedPayment[]; paymentStatus: string; paidAmount: number }> {
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
          `Branch ${branchId} não tem método de pagamento do tipo ${localType} — usando ONLINE como fallback`,
        );

        // Fallback: tenta usar ONLINE
        const onlineFallback = await prisma.branchPaymentMethod.findFirst({
          where: {
            branchId,
            paymentMethod: { type: PaymentMethodType.ONLINE },
          },
          include: { paymentMethod: true },
        });

        if (onlineFallback) {
          payments.push({
            type: PaymentMethodType.ONLINE,
            amount: amountCents,
            status: isPaid ? 'PAID' : 'PENDING',
            paymentMethodId: onlineFallback.id,
            change: 0,
          });
          if (isPaid) paidAmount += amountCents;
        } else {
          if (isPaid) paidAmount += amountCents;
        }

        continue;
      }

      const change =
        method.cash?.changeFor
          ? Math.max(0, Math.round(method.cash.changeFor * 100) - amountCents)
          : 0;

      payments.push({
        type: localType,
        amount: amountCents,
        status: isPaid ? 'PAID' : 'PENDING',
        paymentMethodId: branchPaymentMethod.id,
        change,
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