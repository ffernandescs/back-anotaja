import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto, UpdateOrderItemDto } from './dto/update-order.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { PrinterService } from '../printer/printer.service';
import { prisma } from '../../../lib/prisma';
import { DeliveryTypeDto, OrderStatusDto } from './dto/create-order-item.dto';
import { OrderStatus, Prisma, CashMovementType, PaymentMethodType } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { money } from '../../utils/money';

@Injectable()
export class OrdersService {
  constructor(
    private webSocketGateway: OrdersWebSocketGateway,
    private printerService: PrinterService,
  ) {
    console.log('🖨️ OrdersService constructor - PrinterService injected:', !!this.printerService);
  }

  async create(createOrderDto: CreateOrderDto, userId: string) {
    // Verificar se o usuário existe e tem acesso à filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Sempre usar branchId do usuário logado
    const branchId = user.branchId;

    // Verificar se a filial existe
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: true },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    // Verificar se os produtos existem
    const productIds = createOrderDto.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Um ou mais produtos não foram encontrados');
    }

    const order = await prisma.$transaction(async (tx) => {
      const lastOrder = await tx.order.findFirst({
        where: { branchId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });

      const orderNumber = lastOrder?.orderNumber ? lastOrder.orderNumber + 1 : 1;

      const created = await tx.order.create({
        data: {
          orderNumber,
          status: createOrderDto.status || OrderStatusDto.PENDING,
          deliveryType: createOrderDto.deliveryType,
          paymentStatus: 'PENDING',

          // 💰 Arredondando sempre
          paidAmount: money(0),
          total: money(createOrderDto.total),
          subtotal: money(createOrderDto.subtotal),
          deliveryFee: money(createOrderDto.deliveryFee || 0),
          serviceFee: money(createOrderDto.serviceFee || 0),
          discount: money(createOrderDto.discount || 0),

          notes: createOrderDto.notes || null,
          customerId: createOrderDto.customerId || null,
          customerAddressId: createOrderDto.addressId || null,
          branchId,
          userId: userId,
          couponId: createOrderDto.couponId || null,
          tableNumber: createOrderDto.tableNumber || null,
          tableId: createOrderDto.tableId || null,

          items: {
            create: createOrderDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: money(item.price), // <--- arredondando o price do item
              notes: item.notes || null,
              preparationStatus: 'PENDING',
              dispatchStatus: 'PENDING',
              additions: item.additions
                ? {
                    create: item.additions.map((addition) => ({
                      additionId: addition.additionId,
                    })),
                  }
                : undefined,
              complements: item.complements
                ? {
                    create: item.complements.map((complement) => ({
                      complementId: complement.complementId,
                      options: complement.options
                        ? {
                            create: complement.options.map((option) => ({
                              optionId: option.optionId,
                            })),
                          }
                        : undefined,
                    })),
                  }
                : undefined,
            })),
          },
        },
        include: {
          branch: {
            select: {
              id: true,
              branchName: true,
              address: true,
            },
          },
          customer: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  image: true,
                },
              },
              additions: {
                include: {
                  addition: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                    },
                  },
                },
              },
              complements: {
                include: {
                  complement: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                  options: {
                    include: {
                      option: {
                        select: {
                          id: true,
                          name: true,
                          price: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          coupon: {
            select: {
              id: true,
              code: true,
              type: true,
              value: true,
            },
          },
          deliveryPerson: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });

      if (created.tableId) {
        await tx.table.update({
          where: { id: created.tableId },
          data: { status: 'OPEN' },
        });
      }

      return created;
    });

    // Emitir evento de criação via WebSocket com payload completo
    const fullCreatedOrder = await this.findOne(order.id, userId);
    await this.webSocketGateway.emitOrderUpdate(fullCreatedOrder, 'order:created');

    // 🖨️ Imprimir pedido automaticamente na criação
    console.log('🖨️ About to call printOrderOnCreate for order:', fullCreatedOrder.orderNumber);
    console.log('🖨️ Branch data:', JSON.stringify(branch, null, 2));
    console.log('🖨️ PrinterService exists:', !!this.printerService);
    
    await this.printerService.printOrderOnCreate(fullCreatedOrder, branch);
    console.log('🖨️ printOrderOnCreate completed');

    return order;
  }

  async findAll(
    userId: string,
    query: QueryOrdersDto,
  ): Promise<PaginatedResponseDto<any>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    // Filtro correto tipado
    const where: Prisma.OrderWhereInput = {
      branchId: user.branchId,
    };

    // Status único ou múltiplos
    if (query.status) {
      // Garante que o status é um valor válido do enum
      if (Object.values(OrderStatusDto).includes(query.status)) {
        where.status = query.status;
      } else {
        throw new BadRequestException(`Status inválido: ${query.status}`);
      }
    } else if (query.statuses) {
      const statusArray = query.statuses
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) =>
          Object.values(OrderStatusDto).includes(s as OrderStatusDto),
        )
        .map((s) => s as OrderStatusDto);

      if (statusArray.length > 0) {
        where.status = { in: statusArray };
      }
    }

    // Entregador
    if (query.deliveryPersonId) {
      where.deliveryPersonId = query.deliveryPersonId;
    }

    // Tipo de entrega
    if (query.deliveryType) {
      const deliveryTypes = query.deliveryType
        .split(',')
        .map((t) => t.trim()) as DeliveryTypeDto[]; // força o tipo correto se DeliveryType for enum

      // Filtra apenas os tipos válidos do enum (opcional, se DeliveryType for enum)
      const validDeliveryTypes = deliveryTypes.filter((t) =>
        Object.values(DeliveryTypeDto).includes(t),
      );

      if (validDeliveryTypes.length === 0) {
        throw new BadRequestException(
          `Tipo de entrega inválido: ${query.deliveryType}`,
        );
      }

      // Se houver mais de um tipo, usamos "in", senão usamos diretamente
      where.deliveryType =
        validDeliveryTypes.length > 1
          ? { in: validDeliveryTypes }
          : validDeliveryTypes[0];
    }

    // Busca textual
    if (query.search) {
      const searchTerm = query.search.trim();

      const orConditions: Prisma.OrderWhereInput[] = [
        {
          customer: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
        {
          customer: {
            phone: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      ];

      const parsedOrderNumber = parseInt(searchTerm, 10);
      if (!isNaN(parsedOrderNumber) && parsedOrderNumber > 0) {
        orConditions.push({ orderNumber: parsedOrderNumber });
      }

      where.OR = orConditions;
    }

    // Ordenação
    const orderBy: Prisma.Enumerable<Prisma.OrderOrderByWithRelationInput> = {};
    if (query.sortBy) {
      orderBy[query.sortBy as keyof Prisma.OrderOrderByWithRelationInput] =
        query.sortOrder || 'desc';
    } else {
      orderBy.createdAt = query.sortOrder || 'desc';
    }

    // Paginação
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const total = await prisma.order.count({ where });
    const data = await prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        branch: { select: { id: true, branchName: true, address: true } },
        user: { select: { id: true, name: true, email: true } },
        customer: true,
        customerAddress: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, price: true, image: true },
            },
            additions: {
              include: {
                addition: { select: { id: true, name: true, price: true } },
              },
            },
            complements: {
              include: {
                complement: { select: { id: true, name: true } },
                options: {
                  include: {
                    option: { select: { id: true, name: true, price: true } },
                  },
                },
              },
            },
          },
        },
        deliveryPerson: {
          select: { id: true, name: true, phone: true, email: true },
        },
        deliveryAssignment: { select: { id: true, name: true, status: true } },
        coupon: { select: { id: true, code: true, type: true, value: true } },
        payments: {
          select: {
            id: true,
            type: true,
            amount: true,
            change: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        table: {
          include: {
            user: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });

    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const order = await prisma.order.findUnique({
      where: {
        id,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        customerAddress:true,
        billSplit: {
          include: {
            persons: {
              include: { payments: true },
            },
          },
        },
        branch: {
          select: {
            id: true,
            branchName: true,
            address: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                image: true,
              },
            },
            additions: {
              include: {
                addition: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
            complements: {
              include: {
                complement: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                options: {
                  include: {
                    option: {
                      select: {
                        id: true,
                        name: true,
                        price: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        coupon: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
          },
        },
        deliveryPerson: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        payments: {
          select: {
            id: true,
            type: true,
            amount: true,
            change: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        table: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  async update(id: string, dto: UpdateOrderDto, userId: string) {
    const existingOrder = await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, group: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }


    // 🚫 Não permitir update direto de items
    const { items, ...payload } = dto;

    if (items) {
      await this.updateItems(id, items, userId);
    }

    // 🧠 Montagem dinâmica do update
    const data = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      },
      {} as Record<string, any>,
    );

    // 🛑 Regras de negócio
    if (
      existingOrder.status === 'CANCELLED' ||
      existingOrder.status === 'DELIVERED'
    ) {
      if ('paymentMethod' in data) {
        throw new BadRequestException(
          'Não é possível alterar forma de pagamento em pedidos finalizados ou cancelados',
        );
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        total: money(payload.total || 0),
        subtotal: money(payload.subtotal || 0),
        serviceFee: money(payload.serviceFee || 0),
        customerId: payload.customerId || null,
      },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
            complements: {
              include: {
                options: true,
              },
            },
            additions: true,
          },
        },
        payments: true,
      },
    });

    // 🔔 WebSocket
    this.webSocketGateway.emitOrderUpdate(
      {
        id: updatedOrder.id,
        status: updatedOrder.status,
        branchId: updatedOrder.branchId,
      },
      'order:updated',
    );

    return updatedOrder;
  }

  async updateItems(
    orderId: string,
    items: UpdateOrderItemDto[],
    userId: string,
  ) {
    const order = await this.findOne(orderId, userId);

    if (['CANCELLED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException(
        'Não é possível alterar itens de pedidos finalizados ou cancelados',
      );
    }

    await prisma.$transaction(async (tx) => {
      // 🔥 Remove itens antigos
      await tx.orderItem.deleteMany({
        where: { orderId },
      });

      // ✅ Cria novos itens
      for (const item of items) {
        await tx.orderItem.create({
          data: {
            orderId,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,

            // ➕ Additions
            additions: {
              create:
                item.additions?.map((additionId) => ({
                  additionId,
                })) ?? [],
            },

            // 🧩 Complements + Options (CORRETO)
            complements: {
              create:
                item.complements?.map((complement) => ({
                  complementId: complement.complementId,

                  options: {
                    create:
                      complement.options?.map((option) => ({
                        optionId: option.optionId,
                        price: option.price,
                      })) ?? [],
                  },
                })) ?? [],
            },
          },
        });
      }
    });

    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
            additions: {
              include: {
                addition: true,
              },
            },
            complements: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: OrderStatusDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        group: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar se o pedido existe e se o usuário tem permissão

    

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (
      status === OrderStatusDto.DELIVERED &&
      updatedOrder.deliveryAssignmentId
    ) {
      // Buscar todos os pedidos da mesma rota
      const ordersFromRoute = await prisma.order.findMany({
        where: {
          deliveryAssignmentId: updatedOrder.deliveryAssignmentId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      // Verificar se TODOS estão DELIVERED
      const allDelivered = ordersFromRoute.every(
        (order) => order.status === OrderStatus.DELIVERED,
      );

      if (allDelivered) {
        // 🔹 Atualiza o status da rota
        await prisma.deliveryAssignment.update({
          where: {
            id: updatedOrder.deliveryAssignmentId,
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        // 🔹 (Opcional) aqui você pode disparar evento websocket da rota
      }
    }

    // Emitir evento de mudança de status via WebSocket com payload completo
    const fullStatusOrder = await this.findOne(updatedOrder.id, userId);
    this.webSocketGateway.emitOrderUpdate(fullStatusOrder, 'order:status_changed');

    return updatedOrder;
  }

  async remove(id: string, userId: string) {
    // Verificar se o pedido existe e se o usuário tem permissão
    const order = await this.findOne(id, userId);

    // Só pode cancelar pedidos pendentes ou confirmados
    const status = order.status as OrderStatusDto;

    if (
      status !== OrderStatusDto.PENDING &&
      status !== OrderStatusDto.CONFIRMED
    ) {
      throw new BadRequestException(
        'Apenas pedidos pendentes ou confirmados podem ser cancelados',
      );
    }

    const cancelledOrder = await prisma.order.update({
      where: { id },
      data: { status: OrderStatusDto.CANCELLED },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
      },
    });

    // Emitir evento de cancelamento via WebSocket
    this.webSocketGateway.emitOrderUpdate(
      {
        id: cancelledOrder.id,
        status: cancelledOrder.status,
        branchId: cancelledOrder.branchId,
        deliveryPersonId: cancelledOrder.deliveryPersonId,
        tableId: cancelledOrder.tableId,
      },
      'order:status_changed',
    );

    return cancelledOrder;
  }

  async addPayment(
    orderId: string,
    dto: CreatePaymentDto | CreatePaymentDto[],
    userId: string,
  ) {
    const payments = Array.isArray(dto) ? dto : [dto];

    const order = await this.findOne(orderId, userId);

    if (['CANCELLED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException(
        'Não é possível adicionar pagamento a pedidos finalizados ou cancelados',
      );
    }

    // Buscar usuário para obter branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Verificar se existe caixa aberto
    let openCashSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: 'OPEN',
      },
    });

    // Se não houver caixa aberto, abrir automaticamente com saldo anterior
    if (!openCashSession) {
      // Buscar último caixa fechado da filial
      const lastClosedCashSession = await prisma.cashSession.findFirst({
        where: {
          branchId: user.branchId,
          status: 'CLOSED',
        },
        orderBy: { closedAt: 'desc' },
      });

      const previousBalance = lastClosedCashSession?.closingAmount ?? 0;

      // Criar novo caixa com saldo anterior
      openCashSession = await prisma.cashSession.create({
        data: {
          branchId: user.branchId,
          openedBy: userId,
          status: 'OPEN',
          openingAmount: previousBalance,
        },
      });

      // Registrar movimento de abertura se houver saldo anterior
      if (previousBalance > 0) {
        await prisma.cashMovement.create({
          data: {
            cashSessionId: openCashSession.id,
            type: CashMovementType.DEPOSIT,
            amount: previousBalance,
            userId: userId,
            paymentMethod: PaymentMethodType.CASH,
            description: 'Abertura automática com saldo anterior',
          },
        });
      }
    }

    // SUBSTITUIR pagamentos existentes: deletar todos os pagamentos anteriores
    await prisma.orderPayment.deleteMany({
      where: { orderId },
    });

    // Registrar novos pagamentos
    await prisma.orderPayment.createMany({
      data: payments.map((p) => ({
        orderId,
        paymentMethodId: p.paymentMethodId,
        type: p.type,
        amount: p.amount,
        change: p.change || 0,
      })),
    });

    // Atualizar paidAmount e paymentStatus com base nos NOVOS pagamentos
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        paidAmount: totalPaid,
        paymentStatus: totalPaid >= order.total ? 'PAID' : 'PARTIAL',
      },
      include: {
        payments: true,
        customer: true,
        customerAddress: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Registrar movimentações de caixa para cada pagamento
    for (const payment of payments) {
      // REGRA CRÍTICA: Só cria movimento SALE se for pagamento em DINHEIRO
      const paymentMethod = (() => {
        const value = String(payment.type || '').toLowerCase();
        if (['pix'].includes(value)) return PaymentMethodType.PIX;
        if (['dinheiro', 'cash'].includes(value)) return PaymentMethodType.CASH;
        if (['credito', 'crédito', 'credit', 'credit_card', 'cartão de crédito', 'cartao de credito'].includes(value))
          return PaymentMethodType.CREDIT;
        if (['debito', 'débito', 'debit', 'debit_card', 'cartão de débito', 'cartao de debito'].includes(value))
          return PaymentMethodType.DEBIT;
        if (['online'].includes(value)) return PaymentMethodType.ONLINE;
        return PaymentMethodType.CASH;
      })();
      
      if (paymentMethod === PaymentMethodType.CASH) {
        await prisma.cashMovement.create({
          data: {
            cashSessionId: openCashSession.id,
            type: CashMovementType.SALE,
            amount: payment.amount,
            userId: userId,
            orderId: orderId,
            paymentMethod: paymentMethod,
            description: `Pagamento pedido #${order.orderNumber || orderId.slice(0, 8)} - ${payment.type}`,
          },
        });
      }
      // Para pagamentos não-dinheiro (cartão, pix, etc.), NÃO cria movimento de caixa
      // pois não afetam o caixa físico
    }

    // Emitir evento WebSocket
    this.webSocketGateway.emitOrderUpdate(updatedOrder);

    // 🖨️ Imprimir pedido automaticamente se estiver pago
    if (updatedOrder.paymentStatus === 'PAID') {
      const branch = await prisma.branch.findUnique({
        where: { id: user.branchId! },
        include: { company: true },
      });
      await this.printerService.printOrderIfPaid(updatedOrder, branch);
    }

    return updatedOrder;
  }

  async markOrderAsPaid(orderId: string, userId: string) {
    const order = await this.findOne(orderId, userId);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'Não é possível marcar pedidos cancelados como pagos',
      );
    }

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('Pedido já está marcado como pago');
    }

    // Buscar usuário para obter branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Verificar se existe caixa aberto para este usuário
    let openCashSession = await prisma.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: 'OPEN',
      },
    });

    // Se não houver caixa aberto, abrir automaticamente com saldo anterior
    if (!openCashSession) {
      const lastClosedCashSession = await prisma.cashSession.findFirst({
        where: {
          branchId: user.branchId,
          status: 'CLOSED',
        },
        orderBy: { closedAt: 'desc' },
      });

      const previousBalance = lastClosedCashSession?.closingAmount ?? 0;

      openCashSession = await prisma.cashSession.create({
        data: {
          branchId: user.branchId,
          openedBy: userId,
          status: 'OPEN',
          openingAmount: previousBalance,
          notes: 'Abertura automática ao marcar pedido como pago',
        },
      });

      await prisma.cashMovement.create({
        data: {
          cashSessionId: openCashSession.id,
          type: CashMovementType.DEPOSIT,
          amount: previousBalance,
          userId: userId,
          paymentMethod: PaymentMethodType.CASH,
          description: 'Abertura automática - saldo anterior mantido',
        },
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        paidAmount: order.total,
      },
      include: {
        payments: true,
        customer: true,
        customerAddress: true,
        items: {
          include: {
            product: true,
          },
        },
        billSplit: {
          include: {
            persons: {
              include: {
                payments: true,
              },
            },
          },
        },
      },
    });

    // Registrar movimentações de caixa para esta marcação como pago
    // Se existirem pagamentos associados ao pedido, usa cada um (suporta múltiplos pagamentos/divisão)
    const directPayments =
      (order as any).payments && (order as any).payments.length > 0
        ? (order as any).payments.map((p: any) => ({
            amount: p.amount,
            method: p.type || p.paymentMethod || 'CASH',
          }))
        : [];

    const splitPayments =
      (order as any).billSplit?.persons?.length > 0
        ? (order as any).billSplit.persons
            .flatMap((person: any) => person.payments || [])
            .map((p: any) => ({
              amount: p.amount,
              method: p.type || p.paymentMethod || 'CASH',
            }))
        : [];

    // Evitar duplicidade: se existe billSplit, usar apenas os pagamentos do split;
    // senão, usar pagamentos diretos; senão, fallback para total.
    const paymentsForMovement =
      splitPayments.length > 0
        ? splitPayments
        : directPayments.length > 0
          ? directPayments
          : [
              {
                amount: order.total,
                method: (order as any).paymentMethod || 'CASH',
              },
            ];

    const normalizePaymentMethod = (method: any): PaymentMethodType => {
      const value = String(method || '').toLowerCase();

      if (['pix'].includes(value)) return PaymentMethodType.PIX;
      if (['dinheiro', 'cash'].includes(value)) return PaymentMethodType.CASH;
      if (['credito', 'crédito', 'credit', 'credit_card', 'cartão de crédito', 'cartao de credito'].includes(value))
        return PaymentMethodType.CREDIT;
      if (['debito', 'débito', 'debit', 'debit_card', 'cartão de débito', 'cartao de debito'].includes(value))
        return PaymentMethodType.DEBIT;
      if (['online'].includes(value)) return PaymentMethodType.ONLINE;

      // fallback seguro
      return PaymentMethodType.CASH;
    };

    for (const payment of paymentsForMovement) {
      // REGRA CRÍTICA: Só cria movimento SALE se for pagamento em DINHEIRO
      const paymentMethod = normalizePaymentMethod(payment.method);
      
      if (paymentMethod === PaymentMethodType.CASH) {
        await prisma.cashMovement.create({
          data: {
            cashSessionId: openCashSession!.id,
            type: CashMovementType.SALE,
            amount: payment.amount,
            userId: userId,
            orderId: orderId,
            paymentMethod: paymentMethod,
            description: `Pedido marcado como pago #${order.orderNumber || orderId.slice(0, 8)} - ${payment.method}`,
          },
        });
      }
      // Para pagamentos não-dinheiro (cartão, pix, etc.), NÃO cria movimento de caixa
      // pois não afetam o caixa físico
    }

    // Emitir evento WebSocket
    this.webSocketGateway.emitOrderUpdate(updatedOrder);

    // 🖨️ Imprimir pedido automaticamente se estiver pago
    if (updatedOrder.paymentStatus === 'PAID') {
      const branch = await prisma.branch.findUnique({
        where: { id: user.branchId! },
        include: { company: true },
      });
      await this.printerService.printOrderIfPaid(updatedOrder, branch);
    }

    return updatedOrder;
  }

  async testPrint(order: any, branch: any): Promise<void> {
    console.log('🖨️ testPrint called - PrinterService exists:', !!this.printerService);
    await this.printerService.printOrder(order, branch);
  }
}
