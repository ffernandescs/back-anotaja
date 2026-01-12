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
import { prisma } from '../../../lib/prisma';
import { DeliveryTypeDto, OrderStatusDto } from './dto/create-order-item.dto';
import { Prisma } from 'generated/prisma';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { money } from 'src/utils/money';

@Injectable()
export class OrdersService {
  constructor(private webSocketGateway: OrdersWebSocketGateway) {}

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

    // Gerar número sequencial do pedido
    const lastOrder = await prisma.order.findFirst({
      where: { branchId },
      orderBy: { orderNumber: 'desc' },
    });

    const orderNumber = lastOrder?.orderNumber ? lastOrder.orderNumber + 1 : 1;

    // Criar o pedido com os itens
    const order = await prisma.order.create({
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
            name: true,
            address: true,
            city: true,
            state: true,
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

    if (order.tableId) {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'OPEN' },
      });
    }

    // Emitir evento de criação via WebSocket
    this.webSocketGateway.emitOrderUpdate(
      {
        id: order.id,
        status: order.status,
        branchId: order.branchId,
        deliveryPersonId: order.deliveryPersonId,
        tableId: order.tableId,
      },
      'order:created',
    );

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
        branch: { select: { id: true, name: true, address: true } },
        user: { select: { id: true, name: true, email: true } },
        customer: true,
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
            name: true,
            address: true,
            city: true,
            state: true,
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
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // 🔒 Regras de permissão
    if (!['admin', 'manager'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para atualizar pedidos');
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
            name: true,
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
    // Verificar se o pedido existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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

    // Emitir evento de mudança de status via WebSocket
    this.webSocketGateway.emitOrderUpdate(
      {
        id: updatedOrder.id,
        status: updatedOrder.status,
        branchId: updatedOrder.branchId,
        deliveryPersonId: updatedOrder.deliveryPersonId,
        tableId: updatedOrder.tableId,
      },
      'order:status_changed',
    );

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
            name: true,
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

    // Registrar pagamentos
    await prisma.orderPayment.createMany({
      data: payments.map((p) => ({
        orderId,
        paymentMethodId: p.paymentMethodId,
        type: p.type,
        amount: p.amount,
        change: p.change || 0,
      })),
    });

    // Atualizar paidAmount e paymentStatus
    const totalPaidThisCall = payments.reduce((sum, p) => sum + p.amount, 0);
    const newPaidAmount = (order.paidAmount || 0) + totalPaidThisCall;

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: newPaidAmount >= order.total ? 'PAID' : 'PARTIALLY_PAID',
      },
      include: { payments: true },
    });

    // Emitir evento WebSocket se precisars

    return updatedOrder;
  }
}
