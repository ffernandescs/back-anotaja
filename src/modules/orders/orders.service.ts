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
import { OrderStatus, Prisma, CashMovementType, PaymentMethodType, DeliveryType, OrderItem, StockMovement } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { money } from '../../utils/money';
import { PaymentTypeDto } from '../store/dto/create-store-order.dto';
import { formatCurrency } from 'src/utils/formatCurrency';

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
      include: { complements: { include: { options: true } } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Um ou mais produtos não foram encontrados');
    }

    // Calcular subtotal dos items
    let subtotal = 0;
    const itemsData = createOrderDto.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new NotFoundException(`Produto ${item.productId} não encontrado`);

      let itemPrice = product.price;

      if (item.complements?.length) {
        for (const complement of item.complements) {
          for (const option of complement.options || []) {
            const complementOption = product.complements
              .flatMap((c) => c.options)
              .find((o) => o.id === option.optionId);
            if (complementOption?.active) {
              itemPrice += complementOption.price * (option.quantity || 1);
            }
          }
        }
      }

      subtotal += itemPrice * item.quantity;

      return {
        productId: product.id,
        quantity: item.quantity,
        price: itemPrice,
        notes: item.notes,
        complements: item.complements,
      };
    });

    // Calcular delivery fee se for delivery
    let deliveryFee = 0;
    let estimatedTime: number | null = null;

    if (createOrderDto.deliveryType === DeliveryTypeDto.DELIVERY) {
      if (!createOrderDto.addressId) {
        throw new BadRequestException('Endereço é obrigatório para delivery');
      }
      deliveryFee = createOrderDto.deliveryFee || 0;
    }

    // Taxa de serviço para DINE_IN
    let serviceFee = 0;
    if (createOrderDto.deliveryType === DeliveryTypeDto.DINE_IN) {
      const generalConfig = await prisma.generalConfig.findUnique({
        where: { branchId },
      });

      if (generalConfig?.enableServiceFee) {
        const percentage = generalConfig.serviceFeePercentage || 10;
        serviceFee = Math.round((subtotal * percentage) / 100);
      }
    }

    // Aplicar cupom se houver
    let discount = 0;
    let appliedCouponId: string | null = null;

    if (createOrderDto.couponId) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          id: createOrderDto.couponId,
          branchId,
          active: true,
          validFrom: { lte: new Date() },
          validUntil: { gte: new Date() },
        },
      });

      if (coupon) {
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
          throw new BadRequestException('Cupom esgotado');
        }
        if (coupon.minValue && subtotal < coupon.minValue) {
          throw new BadRequestException(
            `Valor mínimo do pedido não atingido: R$ ${coupon.minValue.toFixed(2)}`,
          );
        }

        discount =
          coupon.type === 'PERCENTAGE'
            ? Math.round((subtotal * coupon.value) / 100)
            : coupon.value;
        appliedCouponId = coupon.id;
      }
    }

    // Calcular total
    const total = subtotal + deliveryFee + serviceFee - discount;

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
          total: money(total),
          subtotal: money(subtotal),
          deliveryFee: money(deliveryFee),
          serviceFee: money(serviceFee),
          discount: money(discount),

          notes: createOrderDto.notes || null,
          customerId: createOrderDto.customerId || null,
          customerAddressId: createOrderDto.addressId || null,
          branchId,
          userId: userId,
          couponId: appliedCouponId || null,
          tableNumber: createOrderDto.tableNumber || null,
          tableId: createOrderDto.tableId || null,

          items: {
            create: itemsData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: money(item.price),
              notes: item.notes || null,
              preparationStatus: 'PENDING',
              dispatchStatus: 'PENDING',
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
    await this.printerService.printOrderOnCreate(fullCreatedOrder, branch);
    console.log('🖨️ printOrderOnCreate completed');

    return order;
  }

  async createPDVOrder(createOrderDto: CreateOrderDto, userId: string) {
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

    const branchId = user.branchId;

    // Validar cliente
    if (!createOrderDto.customerId) {
      throw new BadRequestException('Cliente é obrigatório para criar pedido no PDV');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: createOrderDto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Buscar produtos e complementos
    const productIds = createOrderDto.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        complements: { include: { options: true } },
      },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Um ou mais produtos não foram encontrados');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calcular subtotal
    let subtotal = 0;
    const itemsData = createOrderDto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.active) {
        throw new NotFoundException(`Produto ${item.productId} não encontrado`);
      }

      let itemPrice = product.price;

      if (item.complements?.length) {
        for (const complement of item.complements) {
          for (const option of complement.options || []) {
            const complementOption = product.complements
              .flatMap((c) => c.options)
              .find((o) => o.id === option.optionId);
            if (complementOption?.active) {
              itemPrice += complementOption.price * (option.quantity || 1);
            }
          }
        }
      }

      subtotal += itemPrice * item.quantity;

      return {
        productId: product.id,
        quantity: item.quantity,
        price: itemPrice,
        notes: item.notes,
        complements: item.complements,
      };
    });

    // Calcular delivery fee se for delivery
    let deliveryFee = 0;
    let estimatedTime: number | null = null;

    if (createOrderDto.deliveryType === DeliveryTypeDto.DELIVERY) {
      if (!createOrderDto.addressId) {
        throw new BadRequestException('Endereço é obrigatório para delivery');
      }
      // Para PDV, delivery fee pode ser 0 ou calculado
      deliveryFee = createOrderDto.deliveryFee || 0;
    }

    // Taxa de serviço para DINE_IN
    let serviceFee = 0;
    if (createOrderDto.deliveryType === DeliveryTypeDto.DINE_IN) {
      const generalConfig = await prisma.generalConfig.findUnique({
        where: { branchId },
      });

      if (generalConfig?.enableServiceFee) {
        const percentage = generalConfig.serviceFeePercentage || 10;
        serviceFee = Math.round((subtotal * percentage) / 100);
      }
    }

    // Aplicar cupom se houver
    let discount = 0;
    let appliedCouponId: string | null = null;

    if (createOrderDto.couponId) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          id: createOrderDto.couponId,
          branchId,
          active: true,
          validFrom: { lte: new Date() },
          validUntil: { gte: new Date() },
        },
      });

      if (coupon) {
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
          throw new BadRequestException('Cupom esgotado');
        }
        if (coupon.minValue && subtotal < coupon.minValue) {
          throw new BadRequestException(
            `Valor mínimo do pedido não atingido: R$ ${coupon.minValue.toFixed(2)}`,
          );
        }

        discount =
          coupon.type === 'PERCENTAGE'
            ? Math.round((subtotal * coupon.value) / 100)
            : coupon.value;
        appliedCouponId = coupon.id;
      }
    }

    // Calcular total
    const total = subtotal + deliveryFee + serviceFee - discount;

    // Validar métodos de pagamento
    if (!createOrderDto.payments?.length) {
      throw new BadRequestException('Ao menos uma forma de pagamento é obrigatória');
    }

    // Validar total dos pagamentos
    const totalPaid = createOrderDto.payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    if (Math.abs(totalPaid - total) > 1) {
      throw new BadRequestException(
        `O total dos pagamentos (${formatCurrency(totalPaid)}) deve ser igual ao total do pedido (${formatCurrency(total)})`,
      );
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
          status: OrderStatusDto.PENDING,
          branchId,
          customerId: createOrderDto.customerId,
          deliveryType: createOrderDto.deliveryType,
          subtotal: money(subtotal),
          deliveryFee: money(deliveryFee),
          serviceFee: money(serviceFee),
          discount: money(discount),
          total: money(total),
          estimatedTime,
          couponId: appliedCouponId,
          customerAddressId: createOrderDto.addressId || null,
          notes: createOrderDto.notes || null,
          userId: userId,
          tableNumber: createOrderDto.tableNumber || null,
          tableId: createOrderDto.tableId || null,
          items: {
            create: itemsData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: money(item.price),
              notes: item.notes,
              preparationStatus: 'PENDING',
              dispatchStatus: 'PENDING',
              complements: item.complements?.length
                ? {
                    create: item.complements.map((comp) => ({
                      complementId: comp.complementId,
                      options: {
                        create: comp.options?.map((opt) => ({
                          optionId: opt.optionId,
                          quantity: opt.quantity || 1,
                        })) || [],
                      },
                    })),
                  }
                : undefined,
            })),
          },
          payments: {
            create: createOrderDto.payments.map((p) => {
              const calculatedChange =
                p.amountGiven && p.amountGiven > (p.amount || 0)
                  ? p.amountGiven - (p.amount || 0)
                  : p.change || 0;
              return {
                type: p.type,
                amount: money(p.amount || 0),
                paymentMethodId: p.paymentMethodId,
                change: calculatedChange,
                amountGiven: p.amountGiven || 0,
                status: 'PENDING',
              };
            }),
          },
        },
      });

      // Atualizar cupom se houver
      if (appliedCouponId) {
        await tx.coupon.update({
          where: { id: appliedCouponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      // Atualizar mesa se houver
      if (created.tableId) {
        await tx.table.update({
          where: { id: created.tableId },
          data: { status: 'OPEN' },
        });
      }

      return created;
    });

    // Buscar pedido completo
    const fullOrder = await this.findOne(order.id, userId);

    // Emitir WebSocket com flag fromPDV para não disparar notificações no NotificationBell
    await this.webSocketGateway.emitOrderUpdate({ ...fullOrder, fromPDV: true }, 'order:created');

    // Imprimir pedido
    await this.printerService.printOrderOnCreate(fullOrder, user.branch);

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
            amountGiven:true,
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

    // Adicionar couponType a cada order para facilitar o uso no frontend
    const dataWithCouponType = data.map((order: any) => ({
      ...order,
      couponType: order.coupon?.type as 'PERCENTAGE' | 'FIXED' | 'FREE_DELIVERY' | undefined,
    }));

    return new PaginatedResponseDto(dataWithCouponType, total, page, limit);
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
            amountGiven:true
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

    // Adicionar couponType ao objeto order para facilitar o uso no frontend
    const orderWithCouponType = {
      ...order,
      couponType: order.coupon?.type as 'PERCENTAGE' | 'FIXED' | 'FREE_DELIVERY' | undefined,
    };

    return orderWithCouponType;
  }

  async update(id: string, dto: UpdateOrderDto, userId: string) {
    const existingOrder = await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, group: true, branchId: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const branchId = user.branchId;

    // 🚫 Não permitir update direto de items
    const { items, payments, ...payload } = dto;

    // Calcular totais se items forem fornecidos
    let calculatedSubtotal = payload.subtotal || existingOrder.subtotal;
    let calculatedDeliveryFee = existingOrder.deliveryFee || 0;
    let calculatedServiceFee = payload.serviceFee || existingOrder.serviceFee || 0;
    let calculatedDiscount = existingOrder.discount || 0;
    let calculatedTotal = payload.total || existingOrder.total;

    if (items && items.length > 0) {
      // Buscar produtos para calcular subtotal
      const productIds = items.map((item) => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          complements: { include: { options: true } },
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Calcular subtotal
      calculatedSubtotal = 0;
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product || !product.active) {
          throw new NotFoundException(`Produto ${item.productId} não encontrado`);
        }

        let itemPrice = product.price;

        if (item.complements?.length) {
          for (const complement of item.complements) {
            for (const option of complement.options || []) {
              const complementOption = product.complements
                .flatMap((c) => c.options)
                .find((o) => o.id === option.optionId);
              if (complementOption?.active) {
                itemPrice += complementOption.price * (option.quantity || 1);
              }
            }
          }
        }

        calculatedSubtotal += itemPrice * item.quantity;
      }

      // Calcular delivery fee se for delivery
      if (payload.deliveryType === DeliveryTypeDto.DELIVERY) {
        calculatedDeliveryFee = payload.deliveryFee || 0;
      }

      // Calcular service fee se for DINE_IN
      if (payload.deliveryType === DeliveryTypeDto.DINE_IN && branchId) {
        const generalConfig = await prisma.generalConfig.findUnique({
          where: { branchId },
        });

        if (generalConfig?.enableServiceFee) {
          const percentage = generalConfig.serviceFeePercentage || 10;
          calculatedServiceFee = Math.round((calculatedSubtotal * percentage) / 100);
        }
      }

      // Calcular total
      calculatedTotal = calculatedSubtotal + calculatedDeliveryFee + calculatedServiceFee - calculatedDiscount;
    }

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

    const updatedOrder = await prisma.$transaction(async (tx) => {

      if (payments) {
        // Delete existing payments
        await tx.orderPayment.deleteMany({
          where: { orderId: id },
        });

        // Create new payments
        for (const payment of payments) {
          const calculatedChange =
            payment.amountGiven && payment.amountGiven > (payment.amount || 0)
              ? payment.amountGiven - (payment.amount || 0)
              : payment.change || 0;
          await tx.orderPayment.create({
            data: {
              type: payment.type,
              amount: money(payment.amount || 0),
              paymentMethodId: payment.paymentMethodId,
              change: calculatedChange,
              amountGiven: payment.amountGiven || null,
              status: 'PENDING',
              orderId: id,
            },
          });
        }
      }
      
      const order = await tx.order.update({
        where: { id },
        data: {
          total: money(calculatedTotal),
          subtotal: money(calculatedSubtotal),
          serviceFee: money(calculatedServiceFee),
          deliveryFee: money(calculatedDeliveryFee),
          customerId: payload.customerId || null,
          deliveryType: payload.deliveryType || existingOrder.deliveryType,
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

      // Update payments if provided
      

      return order;
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

  async generateRandomOrders(userId: string, count: number = 100) {
    // Verificar se o usuário existe e tem acesso à filial
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

    const branchId = user.branchId;

    // Buscar clientes da branch
    const customers = await prisma.customer.findMany({
      where: { branchId },
    });

    if (customers.length === 0) {
      throw new BadRequestException('Nenhum cliente encontrado na filial');
    }

    // Buscar produtos ativos da branch
    const products = await prisma.product.findMany({
      where: { 
        branchId,
        active: true,
      },
    });

    if (products.length === 0) {
      throw new BadRequestException('Nenhum produto encontrado na filial');
    }

    // Buscar métodos de pagamento da branch
    const branchPaymentMethods = await prisma.branchPaymentMethod.findMany({
      where: { branchId },
      include: { paymentMethod: true },
    });

    if (branchPaymentMethods.length === 0) {
      throw new BadRequestException('Nenhum método de pagamento encontrado na filial');
    }

    const paymentMethods = branchPaymentMethods.map(bpm => bpm.paymentMethod);

    // Tipo para itens do pedido
    interface OrderItemInput {
      productId: string;
      quantity: number;
      price: number;
      notes?: string;
    }

    // Obter o último orderNumber
    const lastOrder = await prisma.order.findFirst({
      where: { branchId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let currentOrderNumber = lastOrder?.orderNumber ? lastOrder.orderNumber + 1 : 1;

    // Opções para sorteio
    const deliveryTypes: DeliveryType[] = ['PICKUP', 'DELIVERY', 'DINE_IN'];
    const statuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED'];
    const paymentStatuses = ['PENDING', 'PAID'];

    // Gerar pedidos aleatórios em lotes de 50 para evitar timeout
    console.log(`Iniciando geração de ${count} pedidos aleatórios...`);
    const batchSize = 50;
    const createdOrders: any[] = [];

    for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
      const startIdx = batch * batchSize;
      const endIdx = Math.min(startIdx + batchSize, count);
      const batchCount = endIdx - startIdx;

      console.log(`Processando lote ${batch + 1}/${Math.ceil(count / batchSize)} (${startIdx + 1} a ${endIdx})...`);

      const batchOrders = await prisma.$transaction(
        async (tx) => {
          const orders: any[] = [];

          for (let i = startIdx; i < endIdx; i++) {
            console.log(`Criando pedido ${i + 1}/${count}...`);
            // Sortear cliente (20% chance de não ter cliente)
            const customer = Math.random() > 0.2
              ? customers[Math.floor(Math.random() * customers.length)]
              : null;

            // Sortear deliveryType
            const deliveryType = deliveryTypes[Math.floor(Math.random() * deliveryTypes.length)];

            // Sortear 1-5 produtos
            const numProducts = Math.floor(Math.random() * 5) + 1;
            const selectedProducts: OrderItemInput[] = [];
            const shuffledProducts = [...products].sort(() => Math.random() - 0.5);

            for (let j = 0; j < numProducts; j++) {
              const product = shuffledProducts[j];
              const quantity = Math.floor(Math.random() * 5) + 1; // 1-5
              selectedProducts.push({
                productId: product.id,
                quantity,
                price: product.price,
                notes: undefined,
              });
            }

            // Calcular total e subtotal
            const subtotal = selectedProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const deliveryFee = deliveryType === 'DELIVERY' ? Math.floor(Math.random() * 1000) + 500 : 0; // 5-15 reais se delivery
            const serviceFee = deliveryType === 'DINE_IN' ? Math.floor(subtotal * 0.1) : 0; // 10% se dine-in
            const discount = Math.random() > 0.7 ? Math.floor(Math.random() * 500) : 0; // 30% chance de desconto
            const total = subtotal + deliveryFee + serviceFee - discount;

            // Sortear data do pedido (últimos 90 dias)
            const daysAgo = Math.floor(Math.random() * 90);
            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - daysAgo);
            createdAt.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

            // Sortear status (80% chance de ser entregue)
            const status = Math.random() > 0.2
              ? 'DELIVERED'
              : statuses[Math.floor(Math.random() * statuses.length)];

            // Sortear paymentStatus
            const paymentStatus = status === 'DELIVERED' ? 'PAID' : paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];

            // Sortear paymentMethod
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

            // Criar pedido seguindo o padrão do método create
            const order = await tx.order.create({
              data: {
                orderNumber: currentOrderNumber,
                status: status as OrderStatus,
                deliveryType: deliveryType,
                paymentStatus,
                paidAmount: paymentStatus === 'PAID' ? total : 0,
                total: money(total),
                subtotal: money(subtotal),
                deliveryFee: money(deliveryFee),
                serviceFee: money(serviceFee),
                discount: money(discount),
                customerId: customer?.id || null,
                branchId,
                userId: userId,
                createdAt,
                items: {
                  create: selectedProducts.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: money(item.price),
                    notes: item.notes || null,
                    preparationStatus: 'PENDING',
                    dispatchStatus: 'PENDING',
                  })),
                },
              },
            });
            console.log(`Pedido ${i + 1}/${count} criado com ID: ${order.id}`);

            // Criar pagamento se o pedido estiver pago
            if (paymentStatus === 'PAID') {
              await tx.orderPayment.create({
                data: {
                  orderId: order.id,
                  type: paymentMethod.type as PaymentMethodType,
                  amount: total,
                  status: 'PAID',
                  paymentMethodId: paymentMethod.id,
                  change: paymentMethod.type === 'CASH' ? Math.floor(Math.random() * 500) : 0,
                },
              });
            }

            orders.push(order);
            currentOrderNumber++;
          }

          return orders;
        },
        { timeout: 30000 } // 30 segundos por lote
      );

      createdOrders.push(...batchOrders);
      console.log(`Lote ${batch + 1} concluído. Total criados: ${createdOrders.length}`);
    }

    for(const item of createdOrders) {
       const fullCreatedOrder = await this.findOne(item.id, userId);
    await this.webSocketGateway.emitOrderUpdate(fullCreatedOrder, 'order:created');

    }

    return {
      message: `Gerados ${count} pedidos aleatórios com sucesso`,
      orders: createdOrders.length,
    };
  }
}
