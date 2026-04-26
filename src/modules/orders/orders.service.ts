import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { PrinterService } from '../printer/printer.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { prisma } from '../../../lib/prisma';
import { DeliveryTypeDto } from './dto/create-order-item.dto';
import { OrderStatus, Prisma, CashMovementType, PaymentMethodType, DeliveryType, OrderItem, StockMovement, OrderChannel, ServiceType, CustomerType } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CalculateDeliveryFeeDto } from '../store/dto/calculate-delivery-fee.dto';
import { LatLng } from '../store/types';
import { StoreService } from '../store/store.service';

const isValidCoord = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v);
@Injectable()
export class OrdersService {
  constructor(
    private webSocketGateway: OrdersWebSocketGateway,
    private printerService: PrinterService,
    private storeService: StoreService,
    private whatsappService: WhatsAppService,
  ) {
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
    // Chamar storeService.createOrder com branchId (sem subdomain para admin/PDV)
    const result = await this.storeService.createOrder(createOrderDto, undefined, branchId);

    return result;
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

    // Sempre usar branchId do usuário logado
    const branchId = user.branchId;

    // Chamar storeService.createOrder com branchId (sem subdomain para admin/PDV)
    const result = await this.storeService.createOrder(createOrderDto, undefined, branchId);

    return result;
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
      if (Object.values(OrderStatus).includes(query.status)) {
        where.status = query.status;
      } else {
        throw new BadRequestException(`Status inválido: ${query.status}`);
      }
    } else if (query.statuses) {
      const statusArray = query.statuses
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) =>
          Object.values(OrderStatus).includes(s as OrderStatus),
        )
        .map((s) => s as OrderStatus);

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

    // Paginação — se limit não for informado, retorna todos os registros sem paginação
    const hasLimit = query.limit !== undefined;
    const page = query.page || 1;
    const limit = hasLimit ? query.limit! : undefined;
    const skip = hasLimit ? (page - 1) * limit! : undefined;

    const total = await prisma.order.count({ where });
    const data = await prisma.order.findMany({
      where,
      ...(skip !== undefined && { skip }),
      ...(limit !== undefined && { take: limit }),
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
      couponCode: order.coupon?.code as string | undefined,
    }));

    return new PaginatedResponseDto(dataWithCouponType, total, page, limit ?? total);
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
      couponCode: order.coupon?.code as string | undefined,
    };

    return orderWithCouponType;
  }

  
  async calculateDeliveryFee(
      calculateFeeDto: CalculateDeliveryFeeDto,
      branchId?: string,
    ) {
      let branch = await prisma.branch.findUnique({where: {id:branchId}});
  
      if (!branch) {
        throw new NotFoundException('Loja não encontrada');
      }
  
      const {
        zipCode,
        address,
        city,
        state,
        lat: providedLat,
        lng: providedLng,
        subtotal = 0,
      } = calculateFeeDto;
  
      // ===============================
      // 1️⃣ NORMALIZAR COORDENADAS
      // ===============================
      let finalLat = isValidCoord(providedLat) ? providedLat : undefined;
      let finalLng = isValidCoord(providedLng) ? providedLng : undefined;
  
      // ===============================
      // 2️⃣ GEOCODING (SE NECESSÁRIO)
      // ===============================
      if (!isValidCoord(finalLat) || !isValidCoord(finalLng)) {
        if (!address || !city || !state) {
          return {
            available: false,
            deliveryFee: 0,
            message: 'Endereço incompleto para localizar no mapa',
          };
        }
  
        try {
          const query = `${address}, ${city}, ${state}, ${zipCode ?? ''}, Brasil`
            .replace(/\s+/g, ' ')
            .trim();
  
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              query,
            )}&limit=1`,
            { headers: { 'User-Agent': 'AnotaJa/1.0' } },
          );
  
          if (!res.ok) throw new Error('Geocoding failed');
  
          const data = (await res.json()) as Array<{
            lat: string;
            lon: string;
          }>;
  
          if (data.length === 0) {
            return {
              available: false,
              deliveryFee: 0,
              message: 'Endereço não localizado no mapa',
            };
          }
  
          finalLat = parseFloat(data[0].lat);
          finalLng = parseFloat(data[0].lon);
        } catch (err) {
          return {
            available: false,
            deliveryFee: 0,
            message: 'Erro ao localizar endereço',
          };
        }
      }
  
      // 🔥 GARANTIA FINAL
      if (!isValidCoord(finalLat) || !isValidCoord(finalLng)) {
        return {
          available: false,
          deliveryFee: 0,
          message: 'Coordenadas inválidas',
        };
      }
  
      const point = { lat: finalLat, lng: finalLng };
  
      // ===============================
      // 3️⃣ BUSCAR CONFIGURAÇÕES
      // level MENOR = maior prioridade
      // ===============================
      let [areas, routes, exclusions] = await Promise.all([
        prisma.deliveryArea.findMany({
          where: { branchId: branch.id, active: true },
          orderBy: { level: 'asc' },
        }),
        prisma.deliveryRoute.findMany({
          where: { branchId: branch.id, active: true },
          orderBy: { level: 'asc' },
        }),
        prisma.deliveryExclusionArea.findMany({
          where: { branchId: branch.id, active: true },
        }),
      ]);
  
      // ===============================
      // 4️⃣ FUNÇÕES GEOGRÁFICAS
      // ===============================
      const haversine = (a: LatLng, b: LatLng) => {
        const R = 6371000;
        const toRad = (v: number) => (v * Math.PI) / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
  
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(a.lat)) *
            Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
  
        return 2 * R * Math.asin(Math.sqrt(h));
      };
  
      const isPointInPolygon = (p: LatLng, poly: LatLng[]) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].lng;
          const yi = poly[i].lat;
          const xj = poly[j].lng;
          const yj = poly[j].lat;
  
          const intersect =
            yi > p.lat !== yj > p.lat &&
            p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
  
          if (intersect) inside = !inside;
        }
        return inside;
      };
  
      // ===============================
      // 5️⃣ EXCLUSÕES
      // ===============================
      for (const ex of exclusions) {
        if (ex.type === 'CIRCLE' && ex.centerLat && ex.centerLng && ex.radius) {
          if (
            haversine(point, {
              lat: ex.centerLat,
              lng: ex.centerLng,
            }) <= ex.radius
          ) {
            return {
              available: false,
              deliveryFee: 0,
              message: 'Entrega não disponível nesta área',
            };
          }
        }
  
        if (ex.type === 'POLYGON' && ex.polygon) {
          const poly = JSON.parse(ex.polygon) as LatLng[];
          if (isPointInPolygon(point, poly)) {
            return {
              available: false,
              deliveryFee: 0,
              message: 'Entrega não disponível nesta área',
            };
          }
        }
      }
  
      // ===============================
      // 6️⃣ ROTAS (PRIMEIRO MATCH GANHA)
      // ===============================
      const matchedRoute = routes.find((route) => {
        try {
          const coords = JSON.parse(route.coordinates) as LatLng[];
          return coords.some(
            (_, i) => i < coords.length - 1 && haversine(point, coords[i]) <= 200,
          );
        } catch {
          return false;
        }
      });
  
      // ===============================
      // 7️⃣ ÁREAS (SE NÃO PEGAR ROTA)
      // ===============================
      const matchedArea =
        !matchedRoute &&
        areas.find((area) => {
          if (
            area.type === 'CIRCLE' &&
            area.centerLat &&
            area.centerLng &&
            area.radius
          ) {
            return (
              haversine(point, {
                lat: area.centerLat,
                lng: area.centerLng,
              }) <= area.radius
            );
          }
  
          if (area.type === 'POLYGON' && area.polygon) {
            const poly = JSON.parse(area.polygon) as LatLng[];
            return isPointInPolygon(point, poly);
          }
  
          return false;
        });
  
      const matched = matchedRoute || matchedArea;
  
      if (!matched) {
  
        return {
          available: false,
          deliveryFee: 0,
          message: 'Endereço fora da área de entrega',
        };
      }
  
      // ===============================
      // 8️⃣ PEDIDO MÍNIMO (APENAS INFORMATIVO)
      // ===============================
      // Nota: Não bloqueia a seleção do endereço, apenas informa o valor mínimo
      // A validação real do pedido mínimo acontece no createOrder
  
      // ===============================
      // 9️⃣ SUCESSO - SEMPRE DISPONÍVEL SE DENTRO DA ÁREA
      // ===============================
      return {
        available: true,
        deliveryFee: matched.deliveryFee,
        estimatedTime: matched.estimatedTime,
        areaName: matched.name,
        areaLevel: matched.level,
        type: matchedRoute ? 'route' : 'area',
      };
    }

async update(id: string, dto: UpdateOrderDto, userId: string, ) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, group: true, branchId: true },
  });

  if (!user?.branchId) {
    throw new ForbiddenException('Usuário não está associado a uma filial');
  }

  const existingOrder = await prisma.order.findUnique({
    where: { id },
  });

  const serviceType = existingOrder?.serviceType || 'TAKEAWAY';

  if (!existingOrder) {
    throw new NotFoundException('Pedido não encontrado');
  }

  return await this.storeService.updateOrder(
    id,
    dto,
    undefined,
    user.branchId,
  );
}


  async updateStatus(id: string, status: OrderStatus, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        group: true,
        branchId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Buscar pedido atual para comparação
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        branch: true,
        customer: true,
        customerAddress: true,
        items: {
          include: {
            product: true,
          },
        },
        deliveryPerson: true,
      },
    });

    if (!existingOrder) {
      throw new NotFoundException('Pedido não encontrado');
    }

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
        customer: true,
        customerAddress: true,
        deliveryPerson: true,
      },
    });

    if (
      status === OrderStatus.DELIVERED &&
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

    // ─── WhatsApp Notifications ─────────────────────────────────────
    // Notify customer about status change
    if (existingOrder.status !== status && existingOrder.branchId) {
      await this.notifyCustomer(existingOrder.branchId, updatedOrder, status);
    }

    // Notify delivery person when status changes to DELIVERING
    if (status === OrderStatus.DELIVERING && updatedOrder.deliveryPerson?.phone) {
      await this.notifyDeliveryPerson(
        existingOrder.branchId,
        updatedOrder,
        updatedOrder.deliveryPerson.phone,
      );
    }

    return updatedOrder;
  }

  async remove(id: string, userId: string) {
    // Verificar se o pedido existe e se o usuário tem permissão
    const order = await this.findOne(id, userId);

    // Só pode cancelar pedidos pendentes ou confirmados
    const status = order.status as OrderStatus;

    if (
      status !== OrderStatus.PENDING &&
      status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Apenas pedidos pendentes ou confirmados podem ser cancelados',
      );
    }

    const cancelledOrder = await prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
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

 async updateOrderPayments(
  orderId: string,
  dto: CreatePaymentDto | CreatePaymentDto[],
  userId: string,
) {
  const payments = Array.isArray(dto) ? dto : [dto];

  const order = await this.findOne(orderId, userId);

  if (order.status === 'CANCELLED') {
    throw new BadRequestException('Pedido cancelado');
  }

   if (order.status === 'COMPLETED') {
    throw new BadRequestException('Pedido finalizado');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.branchId) {
    throw new ForbiddenException('Sem filial');
  }

  // 🔥 SOMENTE EDITA PAGAMENTOS
  await prisma.orderPayment.deleteMany({ where: { orderId } });

  await prisma.orderPayment.createMany({
    data: payments.map((p) => ({
      orderId,
      paymentMethodId: p.paymentMethodId,
      type: p.type,
      amount: p.amount,
      amountGiven: p.amountGiven,
      change:
        p.change != null && p.change > 0
          ? p.change
          : p.type === 'CASH' && p.amountGiven != null && p.amountGiven > p.amount
            ? p.amountGiven - p.amount
            : 0,
    })),
  });

  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      paidAmount,
      // ❌ NÃO ALTERA STATUS AQUI
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

  this.webSocketGateway.emitOrderUpdate(updated);

  return updated;
}

  async markOrderAsPaid(orderId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await this.findOne(orderId, userId);

    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'Não é possível marcar pedidos cancelados como pagos',
      );
    }

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('Pedido já está marcado como pago');
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // 🚨 NÃO abre caixa automático (melhor prática)
    const openCashSession = await tx.cashSession.findFirst({
      where: {
        branchId: user.branchId,
        openedBy: userId,
        status: 'OPEN',
      },
    });


    if (!openCashSession) {
      throw new BadRequestException({
        message: 'Nenhuma sessão de caixa aberta. Por favor, abra uma sessão para marcar o pedido como pago.',
        action: 'OPEN_CASH_SESSION_REQUIRED',
      });
    }

    // Atualiza pedido
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        paidAmount: order.total,
      },
      include: {
        payments: true,
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

    // 🚨 Proteção contra duplicidade
    const alreadyExists = await tx.cashMovement.findFirst({
      where: {
        orderId,
        type: CashMovementType.SALE,
      },
    });

    if (alreadyExists) {
      return updatedOrder;
    }

    // 🔄 Coleta pagamentos corretamente (USANDO updatedOrder)
    const directPayments =
      updatedOrder.payments?.length > 0
        ? updatedOrder.payments.map((p: any) => ({
            amount: p.amount,
            method: p.type,
          }))
        : [];

  const splitPersons = updatedOrder.billSplit?.persons ?? [];

  const splitPayments = splitPersons.flatMap((person: any) =>
    (person.payments ?? []).map((p: any) => ({
      amount: p.amount,
      method: p.type,
    }))
  );

   const fallbackPaymentMethod =
  directPayments[0]?.method ??
  splitPayments[0]?.method ??
  PaymentMethodType.CASH;

const paymentsForMovement =
  splitPayments.length > 0
    ? splitPayments
    : directPayments.length > 0
    ? directPayments
    : [
        {
          amount: updatedOrder.total,
          method: fallbackPaymentMethod,
        },
      ];

    // 🔧 Normalizador
    const normalizePaymentMethod = (method: any): PaymentMethodType => {
      const value = String(method || '').toLowerCase();

      if (['pix'].includes(value)) return PaymentMethodType.PIX;
      if (['dinheiro', 'cash'].includes(value)) return PaymentMethodType.CASH;
      if (
        [
          'credito',
          'crédito',
          'credit',
          'credit_card',
          'cartão de crédito',
        ].includes(value)
      )
        return PaymentMethodType.CREDIT;
      if (
        [
          'debito',
          'débito',
          'debit',
          'debit_card',
          'cartão de débito',
        ].includes(value)
      )
        return PaymentMethodType.DEBIT;
      if (['online'].includes(value)) return PaymentMethodType.ONLINE;

      return PaymentMethodType.CASH;
    };

    // 💰 Criar TODAS as movimentações (🔥 aqui está a correção)
    for (const payment of paymentsForMovement) {
      const paymentMethod = normalizePaymentMethod(payment.method);

      const affectsCash = paymentMethod === PaymentMethodType.CASH;

      await tx.cashMovement.create({
        data: {
          cashSessionId: openCashSession.id,
          type: CashMovementType.SALE,
          amount: payment.amount,
          userId: userId,
          orderId: orderId,
          paymentMethod: paymentMethod,
          description: `Pedido #${
            order.orderNumber || orderId.slice(0, 8)
          } - ${paymentMethod}`,
        },
      });
    }

    return updatedOrder;
  });
}

  async testPrint(order: any, branch: any): Promise<void> {
    await this.printerService.printOrder(order, branch);
  }

  
  async generateRandomOrders(userId: string, count: number = 100) {
    const randomEnum = <T extends object>(e: T): T[keyof T] => {
      const values = Object.values(e);
      return values[Math.floor(Math.random() * values.length)];
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

  if (!user?.branchId) {
    throw new ForbiddenException('Usuário não está associado a uma filial');
  }

  const branchId = user.branchId;

  const customers = await prisma.customer.findMany({ where: { branchId } });

  const products = await prisma.product.findMany({
    where: { branchId, active: true },
  });

  const branchPaymentMethods = await prisma.branchPaymentMethod.findMany({
    where: { branchId },
    include: { paymentMethod: true },
  });

  const paymentMethods = branchPaymentMethods.map((bpm) => bpm.paymentMethod);

  if (!products.length) throw new BadRequestException('Sem produtos');
  if (!paymentMethods.length) throw new BadRequestException('Sem pagamentos');

  const deliveryTypes: DeliveryType[] = ['PICKUP', 'DELIVERY', 'DINE_IN'];
  const statuses: OrderStatus[] = [
    'PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'READY',
    'DELIVERING',
    'DELIVERED',
  ];

  const lastOrder = await prisma.order.findFirst({
    where: { branchId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });

  let currentOrderNumber = (lastOrder?.orderNumber ?? 0) + 1;

  const createdOrders: any[] = [];

  const batchSize = 50;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const start = batch * batchSize;
    const end = Math.min(start + batchSize, count);

    const batchOrders = await prisma.$transaction(
      async (tx) => {
        const result: any[] = [];

        for (let i = start; i < end; i++) {
          const customer =
            Math.random() > 0.2
              ? customers[Math.floor(Math.random() * customers.length)]
              : null;

          const deliveryType =
            deliveryTypes[Math.floor(Math.random() * deliveryTypes.length)];

          const shuffled = [...products].sort(() => Math.random() - 0.5);

          const itemsCount = Math.floor(Math.random() * 4) + 1;

          const items = shuffled.slice(0, itemsCount).map((p) => ({
            productId: p.id,
            quantity: Math.floor(Math.random() * 3) + 1,
            price: p.price,
          }));

          const subtotal = items.reduce(
            (s, it) => s + it.price * it.quantity,
            0,
          );

          const deliveryFee = deliveryType === 'DELIVERY' ? 500 : 0;
          const serviceFee = deliveryType === 'DINE_IN' ? subtotal * 0.1 : 0;
          const discount = Math.random() > 0.7 ? 300 : 0;

          const total = subtotal + deliveryFee + serviceFee - discount;

          const createdAt = new Date(
            Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 180,
          );

          const status =
            Math.random() > 0.2
              ? 'DELIVERED'
              : statuses[Math.floor(Math.random() * statuses.length)];

          const isPaid = status === 'DELIVERED';

          const order = await tx.order.create({
            data: {
              orderNumber: currentOrderNumber,
              status,
              deliveryType,
              paymentStatus: isPaid ? 'PAID' : 'PENDING',
              paidAmount: isPaid ? total : 0,
              channel:
                Math.random() > 0.7
                  ? OrderChannel.ONLINE
                  : Math.random() > 0.5
                    ? OrderChannel.PDV
                    : OrderChannel.WAITER,

              serviceType:
                Math.random() > 0.5
                  ? ServiceType.TABLE
                  : Math.random() > 0.5
                    ? ServiceType.TAKEAWAY
                    : ServiceType.COMANDA,

              customerType: customer
                ? CustomerType.REGISTERED
                : CustomerType.GUEST,
              subtotal,
              total,
              deliveryFee,
              serviceFee,
              discount,

              branchId,
              userId,

              customerId: customer?.id, // ✅ sem null
              createdAt,

              items: {
                create: items.map((it) => ({
                  productId: it.productId,
                  quantity: it.quantity,
                  price: it.price,
                })),
              },
            },
          });

          if (isPaid) {
            const pm =
              paymentMethods[
                Math.floor(Math.random() * paymentMethods.length)
              ];

            await tx.orderPayment.create({
              data: {
                orderId: order.id,
                type: pm.type,
                paymentMethodId: pm.id,
                amount: total,
                status: 'PAID',
                change:
                  pm.type === 'CASH'
                    ? Math.floor(Math.random() * 300)
                    : 0,
              },
            });
          }

          result.push(order);
          currentOrderNumber++;
        }

        return result;
      },
      { timeout: 30000 },
    );

    createdOrders.push(...batchOrders);
  }

  // 🚀 Websocket (otimizado)
  for (const order of createdOrders) {
    const full = await this.findOne(order.id, userId);
    this.webSocketGateway.emitOrderUpdate(full, 'order:created');
  }

  return {
    message: `Gerados ${count} pedidos`,
    orders: createdOrders.length,
  };
}

  // ─── WhatsApp Notifications ─────────────────────────────────────

  private async sendWhatsAppNotification(
    branchId: string,
    phone: string,
    message: string,
  ) {
    try {
      await this.whatsappService.sendMessage(branchId, phone, message);
      console.log(`[WhatsApp] Message sent to ${phone}`);
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message to ${phone}:`, error);
      // Don't throw error - notification failure shouldn't break order flow
    }
  }

  private formatOrderMessage(order: any, type: 'confirmation' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'): string {
    const orderNumber = order.orderNumber || order.id.slice(0, 8);
    const customerName = order.customer?.name || 'Cliente';
    const total = order.total?.toFixed(2) || '0.00';
    const items = order.items?.map((i: any) => `${i.quantity}x ${i.product?.name}`).join(', ') || '';
    const branchName = order.branch?.branchName || 'Loja';

    switch (type) {
      case 'confirmation':
        return `📱 *Confirmação de Pedido*

Olá ${customerName}!

Seu pedido #${orderNumber} foi *recebido* e está sendo preparado.

🛒 *Itens:* ${items}
💰 *Total:* R$ ${total}

📍 ${branchName}

Agradecemos pela preferência!`;

      case 'ready':
        return `✅ *Pedido Pronto!*

Olá ${customerName}!

Seu pedido #${orderNumber} está *pronto* para retirada.

📍 ${branchName}

Agradecemos pela preferência!`;

      case 'out_for_delivery':
        return `🚀 *Pedido em Rota!*

Olá ${customerName}!

Seu pedido #${orderNumber} *saiu para entrega*.

📍 ${branchName}

Agradecemos pela preferência!`;

      case 'delivered':
        return `✅ *Pedido Entregue!*

Olá ${customerName}!

Seu pedido #${orderNumber} foi *entregue* com sucesso.

📍 ${branchName}

Agradecemos pela preferência!`;

      case 'cancelled':
        return `❌ *Pedido Cancelado*

Olá ${customerName}!

Seu pedido #${orderNumber} foi *cancelado*.

📍 ${branchName}

Se tiver alguma dúvida, entre em contato conosco.`;

      default:
        return '';
    }
  }

  private async notifyCustomer(branchId: string, order: any, status: OrderStatus) {
    const config = await (prisma as any).whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.enabled || !order.customer?.phone) {
      return;
    }

    let shouldSend = false;
    let messageType: 'confirmation' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled' = 'confirmation';

    switch (status) {
      case OrderStatus.CONFIRMED:
        shouldSend = config.orderConfirmationEnabled;
        messageType = 'confirmation';
        break;
      case OrderStatus.READY:
        shouldSend = config.orderReadyEnabled;
        messageType = 'ready';
        break;
      case OrderStatus.DELIVERING:
        shouldSend = config.orderReadyEnabled;
        messageType = 'out_for_delivery';
        break;
      case OrderStatus.DELIVERED:
        shouldSend = config.orderReadyEnabled;
        messageType = 'delivered';
        break;
      case OrderStatus.CANCELLED:
        shouldSend = config.deliveryCancelEnabled;
        messageType = 'cancelled';
        break;
      default:
        shouldSend = false;
    }

    if (shouldSend) {
      const message = this.formatOrderMessage(order, messageType);
      await this.sendWhatsAppNotification(branchId, order.customer.phone, message);
    }
  }

  private async notifyDeliveryPerson(branchId: string, order: any, deliveryPersonPhone: string) {
    const config = await (prisma as any).whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.enabled || !config?.deliveryStartEnabled || !deliveryPersonPhone) {
      return;
    }

    const orderNumber = order.orderNumber || order.id.slice(0, 8);
    const customerName = order.customer?.name || 'Cliente';
    const customerPhone = order.customer?.phone || '';
    const customerAddress = order.customerAddress?.fullAddress || order.customerAddress?.street || 'Endereço não informado';
    const total = order.total?.toFixed(2) || '0.00';

    const message = `🏍️ *Nova Entrega*

📦 *Pedido:* #${orderNumber}
👤 *Cliente:* ${customerName}
📱 *Telefone:* ${customerPhone}
📍 *Endereço:* ${customerAddress}
💰 *Total:* R$ ${total}

Inicie a entrega!`;

    await this.sendWhatsAppNotification(branchId, deliveryPersonPhone, message);
  }
}
