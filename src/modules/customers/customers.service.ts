import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { JwtService } from '@nestjs/jwt';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { GeocodingService } from '../geocoding/geocoding.service';
import { StoreService } from '../store/store.service';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class CustomersService {
  constructor(
    private jwtService: JwtService,
    private readonly geocodingService: GeocodingService,
    private readonly storeService: StoreService,
  ) {}

  async create(dto: CreateCustomerDto, subdomain?: string) {
    const { name, phone, email, addresses } = dto;

    // Busca a branch pelo subdomain
    const branch = await prisma.branch.findUnique({
      where: { subdomain },
    });
    if (!branch) throw new NotFoundException('Filial não encontrada');

    // Verifica se o telefone já existe na mesma filial
    const existing = await prisma.customer.findUnique({
      where: { phone_branchId: { phone, branchId: branch.id } },
    });
    if (existing) throw new ConflictException('Telefone já cadastrado');

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email,
        branchId: branch.id,
      },
      include: { addresses: true },
    });

    // Gera JWT incluindo branchId no payload (igual ao login)
    const token = this.jwtService.sign(
      {
        userId: customer.id,
        phone: customer.phone,
        branchId: customer.branchId,
      },
      { secret: process.env.JWT_CUSTOMER_SECRET, expiresIn: '7d' },
    );

    return { token, customer };
  }

  async adminCreate(dto: CreateCustomerDto, userId: string) {
    const { name, phone, email, addresses } = dto;

    // Busca a branch do usuário autenticado
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('Usuário ou filial não encontrada');
    }

    // Verifica se o telefone já existe na mesma filial
    const existing = await prisma.customer.findUnique({
      where: { phone_branchId: { phone, branchId: user.branchId } },
    });
    if (existing) throw new ConflictException('Telefone já cadastrado');

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email,
        branchId: user.branchId,
      },
      include: { addresses: true },
    });

    return customer;
  }

  async createAddressCustomer(
    dto: CreateCustomerAddressDto,
    customerId: string,
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const cleanZipCode = dto.zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;

    const number = dto.number || '';

    try {
      const coordinates = await this.geocodingService.getCoordinates(
        dto.street,
        number,
        dto.city,
        cleanZipCode,
        dto.state,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      }
    } catch (error) {
      // Log opcional
      console.warn('Erro ao buscar coordenadas:', error);
    }

    if (lat === null || lng === null) {
      throw new BadRequestException(
        'Não foi possível geocodificar o endereço. Verifique CEP e número.',
      );
    }

    // Validar cobertura antes de salvar
    const coverage = await this.storeService.calculateDeliveryFee(
      {
        zipCode: cleanZipCode,
        address: dto.street,
        city: dto.city,
        state: dto.state,
        lat,
        lng,
        subtotal: 0,
      },
      undefined,
      customer.branchId,
    );

    if (!coverage.available) {
      throw new BadRequestException(
        coverage.message || 'Endereço fora da área de entrega',
      );
    }

    return prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            branchId: customer.branchId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.create({
        data: {
          ...dto,
          customerId: customer.id,
          branchId: customer.branchId,
          lat,
          lng,
        },
      });
    });
  }

  async deleteAddressCustomer(customerId: string, addressId: string) {
    const deletedAddress = await prisma.customerAddress.delete({
      where: { id: addressId, customerId },
    });

    if (!deletedAddress) {
      throw new NotFoundException('Endereço não encontrado');
    }

    return deletedAddress;
  }

  async updateAddressCustomer(
    addressId: string,
    dto: CreateCustomerAddressDto,
    userId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId, },
    });

    if (!userId) {
      throw new NotFoundException('Usuario não encontrado');
    }

    const address = await prisma.customerAddress.findFirst({
      where: {
        id: addressId,
      },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    const cleanZipCode = dto.zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;
    const number = dto.number || '';

    try {
      const coordinates = await this.geocodingService.getCoordinates(
        dto.street,
        number,
        dto.city,
        cleanZipCode,
        dto.state,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      }
    } catch (error) {
      console.warn('Erro ao buscar coordenadas (update):', error);
    }

    if (lat === null || lng === null) {
      throw new BadRequestException(
        'Não foi possível geocodificar o endereço. Verifique CEP e número.',
      );
    }

    const coverage = await this.storeService.calculateDeliveryFee(
      {
        zipCode: cleanZipCode,
        address: dto.street,
        city: dto.city,
        state: dto.state,
        lat,
        lng,
        subtotal: 0,
      },
      undefined,
      user?.branchId ??'',
    );

    if (!coverage.available) {
      throw new BadRequestException(
        coverage.message || 'Endereço fora da área de entrega',
      );
    }

    return prisma.$transaction(async (tx) => {
      // Se estiver marcando este endereço como padrão
      if (dto.isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            branchId: user?.branchId ?? '',
            isDefault: true,
            NOT: { id: addressId },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.update({
        where: { id: addressId },
        include: {
          customer: true,
        },
        data: {
          ...dto,
        },
      });
    });
  }

  async findAll(userId: string, query?: QueryCustomersDto) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const page = query?.page ?? 1;
    const limit = query?.limit;
    const hasLimit = limit !== undefined;
    const sortOrder = query?.sortOrder ?? 'desc';
    const search = query?.search;

    // Campos permitidos para ordenação
    const allowedSortFields = ['name', 'phone', 'email', 'createdAt', 'updatedAt'];
    const orderField = query?.sortBy && allowedSortFields.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';

    // Filtro de busca
    const where: any = { branchId: user.branchId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          addresses: { orderBy: { isDefault: 'desc' } },
          _count: { select: { orders: true } },
        },
        orderBy: { [orderField]: sortOrder },
        ...(hasLimit && { skip: (page - 1) * limit }),
        ...(hasLimit && { take: limit }),
      }),
      prisma.customer.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, page, limit ?? total);
  }

  async findAllCustomerAddresses(customerId: string) {
    return prisma.customerAddress.findMany({
      where: { customerId },
    });
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user || !user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    const customer = await prisma.customer.findFirst({
      where: { id, branchId: user.branchId },
      include: { addresses: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const customer = await this.findOne(id, userId);

    return prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        branchId: customer.branchId,
      },
      include: { addresses: true },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    return prisma.customer.delete({
      where: { id },
    });
  }

  async login(dto: LoginCustomerDto, subdomain: string | undefined) {
    // Verifica se a filial existe
    const branch = await prisma.branch.findUnique({
      where: { subdomain },
    });

    if (!branch) {
      throw new NotFoundException('Filial não encontrada');
    }

    // Busca o cliente pelo telefone E branchId para garantir associação correta
    const customer = await prisma.customer.findFirst({
      where: {
        phone: dto.phone,
        branchId: branch.id,
      },
    });

    // Se não existir, retorna erro
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Gera JWT incluindo branchId no payload
    const token = this.jwtService.sign(
      {
        userId: customer.id,
        phone: customer.phone,
        branchId: customer.branchId,
      },
      { secret: process.env.JWT_CUSTOMER_SECRET, expiresIn: '7d' },
    );

    return { token, customer };
  }

  /**
   * Define um endereço como padrão
   */

  async getCustomerById(id: string) {
    return await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        orders: true,
        addresses: true,
      },
    });
  }

  async getCustomerMetrics(customerId: string, userId: string) {
    // Valida acesso
    const customer = await this.findOne(customerId, userId);

    // Busca orders com items, payments e coupon em paralelo
    const [orders, addresses] = await Promise.all([
      prisma.order.findMany({
        where: { customerId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, image: true, price: true } },
            },
          },
          payments: true,
          customerAddress: true,
          coupon: { select: { id: true, code: true, type: true, value: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customerAddress.findMany({
        where: { customerId },
        orderBy: { isDefault: 'desc' },
      }),
    ]);

    const now = new Date();
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === 'DELIVERED');
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

    // Métricas financeiras (baseado em pedidos entregues)
    const totalSpent = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const averageTicket = completedOrders.length > 0 ? Math.round(totalSpent / completedOrders.length) : 0;
    const maxOrderValue = completedOrders.length > 0 ? Math.max(...completedOrders.map((o) => o.total)) : 0;

    // Primeiro e último pedido
    const firstOrderDate = orders.length > 0 ? orders[orders.length - 1].createdAt : null;
    const lastOrderDate = orders.length > 0 ? orders[0].createdAt : null;

    // Dias como cliente
    const daysSinceFirstOrder = firstOrderDate
      ? Math.floor((now.getTime() - new Date(firstOrderDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Dias desde último pedido
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor((now.getTime() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Frequência mensal
    const monthsAsCustomer = Math.max(1, Math.ceil(daysSinceFirstOrder / 30));
    const ordersPerMonth = totalOrders > 0 ? +(totalOrders / monthsAsCustomer).toFixed(1) : 0;

    // Breakdown por tipo de entrega
    const deliveryTypeBreakdown = orders.reduce(
      (acc, o) => {
        acc[o.deliveryType] = (acc[o.deliveryType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Breakdown por status
    const statusBreakdown = orders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Métodos de pagamento
    const allPayments = orders.flatMap((o) => o.payments || []);
    const paymentMethodBreakdown = allPayments.reduce(
      (acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Métricas de cupom
    const ordersWithCoupon = orders.filter((o) => o.couponId);
    const totalCouponsUsed = ordersWithCoupon.length;
    const couponBreakdown: Record<string, number> = {};
    let totalDiscountFromCoupons = 0;

    for (const order of ordersWithCoupon) {
      if (order.coupon) {
        couponBreakdown[order.coupon.code] = (couponBreakdown[order.coupon.code] || 0) + 1;
        // Calcular desconto aproximado baseado no tipo e valor do cupom
        if (order.coupon.type === 'PERCENTAGE') {
          totalDiscountFromCoupons += Math.round((order.total * order.coupon.value) / 100);
        } else if (order.coupon.type === 'FIXED') {
          totalDiscountFromCoupons += order.coupon.value;
        }
      }
    }

    // Cupom mais usado
    const mostUsedCoupon = Object.entries(couponBreakdown).sort(([, a], [, b]) => b - a)[0];

    // Top produtos (por quantidade)
    const productMap = new Map<string, { id: string; name: string; image: string | null; quantity: number; totalSpent: number }>();
    for (const order of completedOrders) {
      for (const item of order.items) {
        const existing = productMap.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          existing.totalSpent += item.price * item.quantity;
        } else {
          productMap.set(item.productId, {
            id: item.productId,
            name: item.product.name,
            image: item.product.image || null,
            quantity: item.quantity,
            totalSpent: item.price * item.quantity,
          });
        }
      }
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Pedidos por mês (últimos 6 meses)
    const monthlyOrders: { month: string; count: number; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const monthOrders = orders.filter((o) => {
        const od = new Date(o.createdAt);
        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
      });
      monthlyOrders.push({
        month: monthLabel,
        count: monthOrders.length,
        total: monthOrders.reduce((s, o) => s + o.total, 0),
      });
    }

    // Pedidos recentes (últimos 5)
    const recentOrders = orders.slice(0, 5).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      deliveryType: o.deliveryType,
      total: o.total,
      itemsCount: o.items.length,
      createdAt: o.createdAt,
    }));

    // Horários preferidos
    const hourDistribution: Record<number, number> = {};
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
    }
    const preferredHour = Object.entries(hourDistribution).sort(([, a], [, b]) => b - a)[0];

    // Dia da semana preferido
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dayDistribution: Record<number, number> = {};
    for (const order of orders) {
      const day = new Date(order.createdAt).getDay();
      dayDistribution[day] = (dayDistribution[day] || 0) + 1;
    }
    const preferredDay = Object.entries(dayDistribution).sort(([, a], [, b]) => b - a)[0];

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      addresses,
      metrics: {
        totalOrders,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        cancellationRate: totalOrders > 0 ? +((cancelledOrders.length / totalOrders) * 100).toFixed(1) : 0,
        totalSpent,
        averageTicket,
        maxOrderValue,
        ordersPerMonth,
        daysSinceFirstOrder,
        daysSinceLastOrder,
        firstOrderDate,
        lastOrderDate,
        preferredHour: preferredHour ? { hour: +preferredHour[0], count: preferredHour[1] } : null,
        preferredDay: preferredDay ? { day: dayNames[+preferredDay[0]], count: preferredDay[1] } : null,
        totalCouponsUsed,
        totalDiscountFromCoupons,
        mostUsedCoupon: mostUsedCoupon ? { code: mostUsedCoupon[0], count: mostUsedCoupon[1] } : null,
      },
      breakdowns: {
        deliveryType: deliveryTypeBreakdown,
        status: statusBreakdown,
        paymentMethod: paymentMethodBreakdown,
      },
      topProducts,
      monthlyOrders,
      recentOrders,
    };
  }

  async setDefaultAddress(
    customerId: string,
    addressId: string,
    userId: string,
  ) {
    await this.findOne(customerId, userId);

    return prisma.$transaction([
      prisma.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      }),
      prisma.customerAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);
  }
}
