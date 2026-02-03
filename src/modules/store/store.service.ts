import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Customer, Prisma, StockMovement } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  DeliveryTypeDto,
  OrderStatusDto,
} from '../orders/dto/create-order-item.dto';
import { SubscriptionStatusDto } from '../subscription/dto/create-subscription.dto';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { CalculateDeliveryFeeDto } from './dto/calculate-delivery-fee.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import {
  CreateStoreOrderDto,
  PaymentTypeDto,
} from './dto/create-store-order.dto';
import { BranchSchedule, StoreHomepageDto } from './dto/store-homepage.dto';
import { StoreLoginDto } from './dto/store-login.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { CepResult, GeoData, OrderForStock } from './types';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';
interface PlanLimits {
  branches: number;
  users: number;
  products: number;
  ordersPerMonth: number;
  deliveryPersons: number;
}

interface PlanFeatures {
  delivery: boolean;
  stock: boolean;
  reports: boolean;
  coupons: boolean;
  api: boolean;
  analytics: boolean;
  support: boolean;
  custom: boolean;
}
type LatLng = { lat: number; lng: number };

const isValidCoord = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v);
@Injectable()
export class StoreService {
  constructor(
    private webSocketGateway: OrdersWebSocketGateway,
    private jwtService: JwtService,
  ) {}

  /**
   * Obter dados da loja identificada por subdomain ou branchId
   */
  async getBranch(subdomain?: string, branchId?: string) {
    if (branchId) {
      return prisma.branch.findUnique({
        where: { id: branchId },
        include: {
          openingHours: true,
          paymentMethods: true,

          address: true,
          _count: {
            select: {
              products: { where: { active: true } },
              categories: { where: { active: true } },
            },
          },
        },
      });
    }

    if (subdomain) {
      return prisma.branch.findFirst({
        where: {
          subdomain,
          active: true,
        },
        include: {
          company: {
            include: { address: true },
          },
          address: true,
          _count: {
            select: {
              products: { where: { active: true } },
              categories: { where: { active: true } },
            },
          },
        },
      });
    }

    return null;
  }

  /**
   * Obter dados completos da homepage da loja (loja + categorias com produtos + pedidos se fornecido telefone)
   */
  async getHomepage(
    subdomain?: string,
    branchId?: string,
    customerPhone?: string,
  ): Promise<StoreHomepageDto> {
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    // Buscar categorias ativas que tenham pelo menos 1 produto ativo
    const categories = await prisma.category.findMany({
      where: {
        branchId: branch.id,
        active: true,
        products: { some: { active: true } }, // <--- filtra categorias com produtos ativos
      },
      include: {
        products: {
          where: { active: true },
          include: {
            additions: {
              where: { active: true },
            },
            complements: {
              where: { active: true },
              include: {
                options: {
                  where: { active: true },
                  orderBy: { displayOrder: 'asc' },
                },
              },
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        },
        _count: {
          select: {
            products: { where: { active: true } },
          },
        },
      },
      orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    });

    const address = await prisma.branchAddress.findUnique({
      where: { id: branch.addressId || undefined },
    });
    if (!address) {
      throw new NotFoundException('Endereço da loja não encontrado');
    }

    // Formas de pagamento apenas para delivery
    const paymentMethodsDelivery = await prisma.branchPaymentMethod.findMany({
      where: { branchId: branch.id, forDelivery: true },
      include: { paymentMethod: true },
    });

    const openingHours = await prisma.branchSchedule.findMany({
      where: { branchId: branch.id },
      select: {
        id: true,
        day: true,
        open: true,
        close: true,
        closed: true,
        date: true,
      },
    });

    const openingHoursDTO: BranchSchedule[] = openingHours.map((item) => ({
      ...item,
      date: item.date ? item.date.toISOString() : null,
    }));

    return {
      branch: {
        address: address,
        id: branch.id,
        name: branch.branchName,
        phone: branch.phone,
        email: branch.email,
        subdomain: branch.subdomain || '',
        logoUrl: branch.logoUrl,
        bannerUrl: branch.bannerUrl,
        primaryColor: branch.primaryColor,
        socialMedia: branch.socialMedia,
        document: branch.document,
        paymentMethods: paymentMethodsDelivery,
        openingHours: openingHoursDTO,
        description: branch.description,
        instagram: branch.instagram,
        minOrderValue: branch.minOrderValue,
        checkoutMessage: branch.checkoutMessage,
        latitude: branch.latitude,
        longitude: branch.longitude,
        rating: branch.rating,
        ratingsCount: branch.ratingsCount,
        productsCount: branch._count.products,
        categoriesCount: branch._count.categories,
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        featured: category.featured,
        _count: { products: category._count?.products || 0 },
        products: category.products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          promotionalPrice: product.promotionalPrice,
          promotionalPeriodType: product.promotionalPeriodType,
          promotionalStartDate:
            product.promotionalStartDate?.toISOString() || null,
          promotionalEndDate: product.promotionalEndDate?.toISOString() || null,
          promotionalDays: product.promotionalDays,
          image: product.image,
          featured: product.featured,
          active: product.active,
          stockControlEnabled: product.stockControlEnabled,
          minStock: product.minStock,
          installmentEnabled: product.installmentEnabled,
          maxInstallments: product.maxInstallments,
          minInstallmentValue: product.minInstallmentValue,
          installmentInterestRate: product.installmentInterestRate,
          installmentOnPromotionalPrice: product.installmentOnPromotionalPrice,
          filterMetadata: product.filterMetadata,
          additions: product.additions.map((addition) => ({
            id: addition.id,
            name: addition.name,
            price: addition.price,
            active: addition.active,
            minQuantity: addition.minQuantity,
          })),
          complements: product.complements.map((complement) => ({
            id: complement.id,
            name: complement.name,
            minOptions: complement.minOptions,
            maxOptions: complement.maxOptions,
            required: complement.required,
            allowRepeat: complement.allowRepeat,
            active: complement.active,
            displayOrder: complement.displayOrder,
            options: complement.options.map((option) => ({
              id: option.id,
              name: option.name,
              price: option.price,
              active: option.active,
              displayOrder: option.displayOrder,
            })),
          })),
        })),
      })),
      orders: customerPhone
        ? await this.getOrdersForHomepage(branch.id, customerPhone)
        : undefined,
    };
  }

  /**
   * Buscar pedidos do cliente para incluir na homepage
   */
  private async getOrdersForHomepage(branchId: string, customerPhone: string) {
    const orders = await prisma.order.findMany({
      where: {
        branchId,
        customer: {
          phone: customerPhone,
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limitar a 50 pedidos mais recentes
    });

    // Converter Date para string e OrderStatus para string
    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as string,
      total: order.total,
      createdAt: order.createdAt.toISOString(),
      items: order.items,
    }));
  }

  /**
   * Obter informações básicas da loja
   */
  async getInfo(subdomain?: string, branchId?: string) {
    const branch = await prisma.branch.findFirst({
      where: {
        subdomain,
        id: branchId,
      },
      include: {
        company: true,
      },
    });
    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }
    const company = branch.company;

    const address = await prisma.companyAddress.findUnique({
      where: { id: branch.addressId || undefined },
    });
    if (!address) {
      throw new NotFoundException('Endereço da loja não encontrado');
    }

    return {
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        phone: company.phone,
      },
      branch: {
        id: branch.id,
        name: branch.branchName,
        companyAddresses: address,
        phone: branch.phone,
        email: branch.email,
        subdomain: branch.subdomain,
        logoUrl: branch.logoUrl,
        bannerUrl: branch.bannerUrl,
        primaryColor: branch.primaryColor,
        socialMedia: branch.socialMedia,
        document: branch.document,
        description: branch.description,
        instagram: branch.instagram,
        minOrderValue: branch.minOrderValue,
        checkoutMessage: branch.checkoutMessage,
        latitude: branch.latitude,
        longitude: branch.longitude,
        rating: branch.rating,
        ratingsCount: branch.ratingsCount,
      },
    };
  }

  /**
   * Obter categorias da loja
   */
  async getCategories(subdomain?: string, branchId?: string) {
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    const categories = await prisma.category.findMany({
      where: {
        branchId: branch.id,
        active: true,
      },
      include: {
        _count: {
          select: {
            products: {
              where: { active: true },
            },
          },
        },
      },
      orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    });

    return { categories };
  }

  /**
   * Obter produtos da loja
   */
  async getProducts(
    subdomain?: string,
    branchId?: string,
    categoryId?: string,
  ) {
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    const where: Prisma.ProductWhereInput = {
      branchId: branch.id,
      active: true,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        promotionalPrice: true,
        promotionalPeriodType: true,
        promotionalStartDate: true,
        promotionalEndDate: true,
        promotionalDays: true,
        image: true,
        featured: true,
        active: true,
        stockControlEnabled: true,
        minStock: true,
        installmentEnabled: true,
        maxInstallments: true,
        minInstallmentValue: true,
        installmentInterestRate: true,
        installmentOnPromotionalPrice: true,
        filterMetadata: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        additions: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            price: true,
            active: true,
            minQuantity: true,
          },
        },
        complements: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            minOptions: true,
            maxOptions: true,
            required: true,
            allowRepeat: true,
            active: true,
            displayOrder: true,
            options: {
              where: { active: true },
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                name: true,
                price: true,
                active: true,
                displayOrder: true,
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });

    return { products };
  }

  /**
   * Validar assinatura e plano da empresa
   */
  private async validateSubscription(companyId: string): Promise<{
    isActive: boolean;
    limits: PlanLimits;
    features: PlanFeatures;
  }> {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new ForbiddenException('Empresa não possui assinatura ativa');
    }

    if (subscription.status !== 'ACTIVE') {
      throw new ForbiddenException('Assinatura não está ativa');
    }

    // Parsear limites
    let limits: PlanLimits = {
      branches: 1,
      users: 3,
      products: 50,
      ordersPerMonth: 100,
      deliveryPersons: 5,
    };
    if (subscription.plan.limits) {
      try {
        limits = JSON.parse(subscription.plan.limits) as PlanLimits;
      } catch {
        // valores padrão permanecem
      }
    }

    // Parsear recursos
    let features: PlanFeatures = {
      delivery: false,
      stock: false,
      reports: false,
      coupons: false,
      api: false,
      analytics: false,
      support: false,
      custom: false,
    };
    if (subscription.plan.features) {
      try {
        const featuresArray = JSON.parse(
          subscription.plan.features,
        ) as string[];
        features = {
          delivery: featuresArray.includes('delivery'),
          stock: featuresArray.includes('stock'),
          reports: featuresArray.includes('reports'),
          coupons: featuresArray.includes('coupons'),
          api: featuresArray.includes('api'),
          analytics: featuresArray.includes('analytics'),
          support: featuresArray.includes('support'),
          custom: featuresArray.includes('custom'),
        };
      } catch {
        // Usar valores padrão
      }
    }

    const status = subscription.status as SubscriptionStatusDto;

    return {
      isActive: status === SubscriptionStatusDto.ACTIVE,
      limits,
      features,
    };
  }

  /**
   * Validar limite de pedidos mensais
   */
  private async validateOrderLimit(
    companyId: string,
    limits: PlanLimits,
  ): Promise<void> {
    if (limits.ordersPerMonth === -1) {
      // Ilimitado
      return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const ordersCount = await prisma.order.count({
      where: {
        branch: {
          companyId,
        },
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    if (ordersCount >= limits.ordersPerMonth) {
      throw new ForbiddenException(
        `Limite de pedidos mensais atingido (${ordersCount}/${limits.ordersPerMonth})`,
      );
    }
  }

  /**
   * Criar pedido na loja (checkout)
   */
  /**
   * Criar pedido na loja (checkout)
   */

  /**
   * Criar pedido na loja (checkout)
   */
async createOrder(
  createOrderDto: CreateStoreOrderDto,
  subdomain?: string,
  branchId?: string,
) {
  // 1. Obter branch
  const branch = await this.getBranch(subdomain, branchId);
  if (!branch) {
    throw new NotFoundException('Loja não encontrada');
  }

  // 2. Validar horário de funcionamento
  const openingHours = await prisma.branchSchedule.findMany({
    where: { branchId: branch.id },
  });

  if (openingHours.length > 0) {
    const now = new Date();
    const daysOfWeek = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ];
    const currentDay = daysOfWeek[now.getDay()];

    const todaySchedule =
      openingHours.find(h => h.date && new Date(h.date).toDateString() === now.toDateString()) ||
      openingHours.find(h => h.day === currentDay);

    if (todaySchedule) {
      if (todaySchedule.closed) {
        throw new BadRequestException('Loja fechada. Não é possível realizar pedidos no momento.');
      }

      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      if (currentTime < todaySchedule.open || currentTime > todaySchedule.close) {
        throw new BadRequestException(
          `Loja fechada. Horário de funcionamento: ${todaySchedule.open} às ${todaySchedule.close}`,
        );
      }
    }
  }

  // 3. Validar assinatura da empresa
  const { limits } = await this.validateSubscription(branch.companyId);
  await this.validateOrderLimit(branch.companyId, limits);

  const { deliveryType, customerId, customerPhone, couponCode, items, addressId, payments, change } = createOrderDto;

  // 4. Validar cliente
  let customer: Customer | null = null;

  if (customerId) {
    customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
  } else if (customerPhone) {
    customer = await prisma.customer.findFirst({ where: { phone: customerPhone, branchId: branch.id } });
    if (!customer) throw new BadRequestException('Cliente não encontrado. Faça login ou cadastro primeiro.');
  } else {
    throw new BadRequestException('customerId ou customerPhone é obrigatório');
  }

  // 5. Buscar produtos e calcular subtotal
  let subtotal = 0;
  const itemsData = await Promise.all(
    items.map(async item => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { complements: { include: { options: true } } },
      });

      if (!product || !product.active) throw new NotFoundException(`Produto ${item.productId} não encontrado`);

      let itemPrice = product.price;

      if (item.complements?.length) {
        for (const complement of item.complements) {
          for (const option of complement.options) {
            const complementOption = await prisma.complementOption.findUnique({ where: { id: option.optionId } });
            if (complementOption?.active) itemPrice += complementOption.price * (option.quantity || 1);
          }
        }
      }

      subtotal += itemPrice * item.quantity;

      return { productId: product.id, quantity: item.quantity, price: itemPrice, notes: item.notes, complements: item.complements };
    }),
  );

  // 6. Calcular delivery fee
  let deliveryFee = 0;
  let estimatedTime: number | null = null;

  if (deliveryType === DeliveryTypeDto.DELIVERY) {
    const customerAddress = await prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!customerAddress) throw new BadRequestException('Endereço completo é obrigatório para delivery');

    const feeResult = await this.calculateDeliveryFee(
      {
        address: customerAddress.street,
        city: customerAddress.city,
        state: customerAddress.state,
        zipCode: customerAddress.zipCode,
        lat: customerAddress?.lat ||undefined,
        lng: customerAddress?.lng||undefined,
        subtotal,
      },
      subdomain,
      branchId,
    );

    if (!feeResult.available) throw new BadRequestException(feeResult.message || 'Delivery não disponível para este endereço');

    deliveryFee = feeResult.deliveryFee;
    estimatedTime = feeResult.estimatedTime || null;
  }

  // 7. Calcular taxa de serviço (10% para dine-in)
  const serviceFee = deliveryType === DeliveryTypeDto.DINE_IN ? Math.round(subtotal * 0.1) : 0;

  // 8. Aplicar cupom
  let discount = 0;
  let couponId: string | null = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: couponCode,
        branchId: branch.id,
        active: true,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
      },
    });

    if (coupon) {
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Cupom esgotado');
      if (coupon.minValue && subtotal < coupon.minValue) throw new BadRequestException(
        `Valor mínimo do pedido não atingido: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coupon.minValue)}`,
      );

      discount = coupon.type === 'PERCENTAGE' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
      couponId = coupon.id;

      await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
    }
  }

  // 9. Calcular total
  const total = subtotal + deliveryFee + serviceFee - discount;

  // 10. Validar pagamentos
  if (!payments?.length) throw new BadRequestException('Ao menos uma forma de pagamento é obrigatória');

  for (const payment of payments) {
    const paymentMethod = await prisma.branchPaymentMethod.findFirst({
      where: { id: payment.paymentMethodId, branchId: branch.id },
      include: { paymentMethod: true },
    });
    if (!paymentMethod?.paymentMethod.isActive) throw new BadRequestException('Método de pagamento inválido ou inativo');
  }

  // 11. Criar pedido dentro de transação segura
  const order = await prisma.$transaction(async tx => {
    const lastOrder = await tx.order.findFirst({ where: { branchId: branch.id }, orderBy: { orderNumber: 'desc' } });
    const orderNumber = (lastOrder?.orderNumber || 0) + 1;

    return await tx.order.create({
      data: {
        orderNumber,
        branchId: branch.id,
        customerId: customer.id,
        status: 'PENDING',
        deliveryType: deliveryType as any,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        total,
        estimatedTime,
        couponId,
        customerAddressId: addressId,
        items: { create: itemsData.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes,
          complements: item.complements?.length ? {
            create: item.complements.map(comp => ({
              complementId: comp.complementId,
              options: { create: comp.options.map(opt => ({ optionId: opt.optionId, quantity: opt.quantity || 1 })) },
            })),
          } : undefined,
        })) },
        payments: { create: payments.map(p => ({
          type: p.type,
          amount: total,
          paymentMethodId: p.paymentMethodId,
          change: p.type === PaymentTypeDto.CASH ? change || 0 : 0,
          status: 'PENDING',
        })) },
      },
      include: {
        customer: true,
        customerAddress: true,
        items: {
          include: {
            product: true,
            complements: { include: { complement: true, options: { include: { option: true } } } },
          },
        },
        payments: true,
        coupon: true,
      },
    });
  });

  // 12. Emitir WebSocket
  this.webSocketGateway.emitOrderUpdate(order, 'order:created');

  // 13. Registrar movimentações de estoque
  const productQuantities = new Map<string, number>();
  const optionQuantities = new Map<string, number>();
  const ingredientQuantities = new Map<string, number>();

  for (const item of order.items) {
    productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + item.quantity);

    for (const comp of item.complements || []) {
      for (const opt of comp.options || []) {
        optionQuantities.set(opt.optionId, (optionQuantities.get(opt.optionId) || 0) + opt.quantity);
      }
    }
  }

  const productIngredients = await prisma.productIngredient.findMany({
    where: { productId: { in: Array.from(productQuantities.keys()) } },
  });

  for (const pi of productIngredients) {
    const productQty = productQuantities.get(pi.productId) || 0;
    const ingredientQty = pi.quantity * productQty;
    ingredientQuantities.set(pi.ingredientId, (ingredientQuantities.get(pi.ingredientId) || 0) + ingredientQty);
  }

  await this.registerStockMovements(branch.id, order, productQuantities, optionQuantities, ingredientQuantities);

  // 14. Retornar payload final
  return {
    success: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      total: order.total,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      discount: order.discount,
      estimatedTime: order.estimatedTime,
      createdAt: order.createdAt.toISOString(),
      customer: { id: order.customer?.id, name: order.customer?.name, phone: order.customer?.phone },
      items: order.items.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes,
        product: { id: item.product.id, name: item.product.name, image: item.product.image },
        complements: item.complements?.map(comp => ({
          id: comp.id,
          complement: { id: comp.complement.id, name: comp.complement.name },
          options: comp.options.map(opt => ({
            id: opt.id,
            quantity: opt.quantity,
            option: { id: opt.option.id, name: opt.option.name, price: opt.option.price },
          })),
        })),
      })),
      payments: order.payments.map(p => ({ id: p.id, type: p.type, amount: p.amount, change: p.change, status: p.status })),
      coupon: order.coupon ? { id: order.coupon.id, code: order.coupon.code } : null,
    },
  };
}


  async calculateDeliveryFee(
    calculateFeeDto: CalculateDeliveryFeeDto,
    subdomain?: string,
    branchId?: string,
  ) {
    const branch = await this.getBranch(subdomain, branchId);

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
    const [areas, routes, exclusions] = await Promise.all([
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
      console.error('[DELIVERY_OUT_OF_AREA]', {
        branchId: branch.id,
        address,
        city,
        state,
        zipCode,
        lat: finalLat,
        lng: finalLng,
        subtotal,
      });

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

  async createOrderMany(
    createOrderDto: CreateStoreOrderDto[],
    subdomain?: string,
    branchId?: string,
  ) {
    const result: {
      success: boolean;
      order: any; // ou o tipo correto se você já tiver
    }[] = [];

    for (const order of createOrderDto) {
      result.push(await this.createOrder(order, subdomain, branchId));
    }

    return result;
  }

  /**
   * Registrar movimentações de estoque
   */
  private async registerStockMovements(
    branchId: string,
    order: OrderForStock,
    productQuantities: Map<string, number>,
    optionQuantities: Map<string, number>,
    ingredientQuantities: Map<string, number>,
  ) {
    const stockMovements: Prisma.PrismaPromise<StockMovement>[] = [];

    // Produtos
    if (productQuantities.size > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: Array.from(productQuantities.keys()) } },
        select: {
          id: true,
          name: true,
          stockControlEnabled: true,
        },
      });

      for (const product of products) {
        if (!product.stockControlEnabled) continue;
        const quantity = productQuantities.get(product.id) || 0;
        if (quantity <= 0) continue;

        stockMovements.push(
          prisma.stockMovement.create({
            data: {
              type: 'EXIT',
              quantity,
              variation: -quantity,
              description: `Venda de produto - Pedido #${order.orderNumber ?? order.id.slice(0, 8)} - ${product.name}`,
              productId: product.id,
              branchId,
            },
          }),
        );
      }
    }

    // Opções de complemento
    if (optionQuantities.size > 0) {
      const options = await prisma.complementOption.findMany({
        where: { id: { in: Array.from(optionQuantities.keys()) } },
        select: {
          id: true,
          name: true,
          stockControlEnabled: true,
        },
      });

      for (const option of options) {
        if (!option.stockControlEnabled) continue;
        const quantity = optionQuantities.get(option.id) || 0;
        if (quantity <= 0) continue;

        stockMovements.push(
          prisma.stockMovement.create({
            data: {
              type: 'EXIT',
              quantity,
              variation: -quantity,
              description: `Consumo de opção de complemento - Pedido #${order.orderNumber ?? order.id.slice(0, 8)} - ${option.name}`,
              optionId: option.id,
              branchId,
            },
          }),
        );
      }
    }

    // Insumos da ficha técnica
    if (ingredientQuantities.size > 0) {
      const ingredients = await prisma.ingredient.findMany({
        where: { id: { in: Array.from(ingredientQuantities.keys()) } },
        select: {
          id: true,
          name: true,
          stockControlEnabled: true,
        },
      });

      for (const ingredient of ingredients) {
        if (!ingredient.stockControlEnabled) continue;
        const quantity = ingredientQuantities.get(ingredient.id) || 0;
        if (quantity <= 0) continue;

        stockMovements.push(
          prisma.stockMovement.create({
            data: {
              type: 'EXIT',
              quantity,
              variation: -quantity,
              description: `Consumo de insumo (ficha técnica) - Pedido #${order.orderNumber ?? order.id.slice(0, 8)} - ${ingredient.name}`,
              ingredientId: ingredient.id,
              branchId,
            },
          }),
        );
      }
    }

    if (stockMovements.length > 0) {
      // Agora funciona porque são Prisma.PrismaPromise<StockMovement>
      await prisma.$transaction(stockMovements);
    }
  }

  /**
   * Listar pedidos da loja (público, por telefone do cliente)
   */

  async getOrders(
    subdomain: string | undefined,
    query?: GetOrdersQueryDto,
    customerId?: string,
  ) {
    if (!query) {
      query = {};
    }

    const branch = await this.getBranch(subdomain);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    // ⭐ PAGINAÇÃO
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // ⭐ WHERE TIPADO CORRETAMENTE
    const where: Prisma.OrderWhereInput = {
      branchId: branch.id,

      ...(customerId && { customerId }),

      ...(query.status && {
        status: query.status, // ✅ agora funciona
      }),

      ...(query.search && {
        OR: [
          {
            id: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          ...(isNaN(Number(query.search))
            ? []
            : [
                {
                  orderNumber: {
                    equals: Number(query.search),
                  },
                },
              ]),
          {
            items: {
              some: {
                product: {
                  name: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          {
            customer: {
              name: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          },
        ],
      }),
    };

    // ⭐ BUSCA + COUNT EM PARALELO
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              branchId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  name: true,
                  image: true,
                },
              },
              additions: {
                include: {
                  addition: {
                    select: {
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
                      name: true,
                    },
                  },
                  options: {
                    include: {
                      option: {
                        select: {
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
              code: true,
            },
          },
          payments: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),

      prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Buscar pedido específico da loja (público)
   */
  async getOrderById(orderId: string, subdomain?: string, branchId?: string) {
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
        branchId: branch.id,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryType: true,
        total: true,
        subtotal: true,
        deliveryFee: true,
        discount: true,
        estimatedTime: true,
        notes: true,
        customerId: true,
        tableNumber: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
        customerAddress: true,
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            notes: true,
            product: {
              select: {
                name: true,
                image: true,
              },
            },
            additions: {
              select: {
                id: true,
                addition: {
                  select: {
                    name: true,
                    price: true,
                  },
                },
              },
            },
            complements: {
              select: {
                id: true,
                complement: {
                  select: {
                    name: true,
                  },
                },
                options: {
                  select: {
                    id: true,
                    quantity: true,
                    option: {
                      select: {
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
        payments: true,
        paymentStatus: true,
        coupon: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  /**
   * Buscar dados do cliente autenticado
   * Busca pelo userId do token (mais seguro)
   * Retorna também endereços e pedidos do cliente
   */
  async getMe(customerId: string, branchId?: string) {
    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Buscar endereços do cliente
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    // Filtrar pedidos do cliente
    const orderWhere: Prisma.OrderWhereInput = {
      customerId, // usa o id do usuário
    };

    if (branchId) {
      orderWhere.branchId = branchId; // agora é seguro, tipado
    }

    const orders = await prisma.order.findMany({
      where: orderWhere,
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limitar a 50 pedidos mais recentes
    });

    return {
      user,
      addresses,
      orders,
    };
  }

  /**
   * Listar endereços do cliente
   */
  async getCustomerAddresses(customerId: string) {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return { addresses };
  }

  /**
   * Criar endereço do cliente
   */
  /**
   * Geocodificar endereço usando Nominatim (OpenStreetMap)
   * Retorna as coordenadas lat/lng
   */
  private async geocodeAddress(
    street: string,
    number?: string,
    city?: string,
    state?: string,
    zipCode?: string,
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      // Montar endereço completo
      const addressParts = [
        street,
        number,
        city,
        state,
        zipCode,
        'Brasil',
      ].filter(Boolean);

      const fullAddress = addressParts.join(', ').replace(/\s+/g, ' ').trim();


      // Chamar API Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
        {
          headers: {
            'User-Agent': 'AnotaJa/1.0',
          },
        },
      );

      if (!response.ok) {
        console.error('Geocoding API error:', response.status);
        return null;
      }

      const data: unknown = await response.json();

      // Validação de tipo
      function isGeoDataArray(value: unknown): value is Array<{
        lat: string;
        lon: string;
      }> {
        return (
          Array.isArray(value) &&
          value.every(
            (item) =>
              item &&
              typeof item === 'object' &&
              'lat' in item &&
              'lon' in item &&
              typeof (item as Record<string, unknown>).lat === 'string' &&
              typeof (item as Record<string, unknown>).lon === 'string',
          )
        );
      }

      if (!isGeoDataArray(data)) {
        console.error('Invalid geocoding response format');
        return null;
      }

      if (data.length === 0) {
        return null;
      }

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);


      return { lat, lng };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Criar endereço do cliente
   * Geocodifica automaticamente para obter lat/lng
   */
  async createCustomerAddress(
    customerId: string,
    createAddressDto: CreateCustomerAddressDto,
  ) {
    // Se for default, remover default dos outros
    if (createAddressDto.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // 🔥 Geocodificar endereço se lat/lng não foram fornecidos
    let lat = createAddressDto.lat;
    let lng = createAddressDto.lng;

    if (!lat || !lng) {

      const coordinates = await this.geocodeAddress(
        createAddressDto.street,
        createAddressDto.number || undefined,
        createAddressDto.city,
        createAddressDto.state,
        createAddressDto.zipCode,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      } else {
        console.warn('Could not geocode address, saving without coordinates');
      }
    }

    // Criar endereço com coordenadas
    const address = await prisma.customerAddress.create({
      data: {
        ...createAddressDto,
        lat: lat || null,
        lng: lng || null,
        branchId: createAddressDto.branchId,
        customerId,
      },
    });

    return { address };
  }

  /**
   * Atualizar endereço do cliente
   * Re-geocodifica se o endereço mudou
   */
  async updateCustomerAddress(
    addressId: string,
    customerId: string,
    updateAddressDto: UpdateCustomerAddressDto,
  ) {
    // Verificar se o endereço pertence ao usuário
    const existingAddress = await prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!existingAddress || existingAddress.customerId !== customerId) {
      throw new NotFoundException('Endereço não encontrado');
    }

    // Se for default, remover default dos outros
    if (updateAddressDto.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    // 🔥 Re-geocodificar se campos relevantes mudaram
    let lat =
      updateAddressDto.lat !== undefined
        ? updateAddressDto.lat
        : existingAddress.lat;
    let lng =
      updateAddressDto.lng !== undefined
        ? updateAddressDto.lng
        : existingAddress.lng;

    const addressChanged =
      (updateAddressDto.street &&
        updateAddressDto.street !== existingAddress.street) ||
      (updateAddressDto.number &&
        updateAddressDto.number !== existingAddress.number) ||
      (updateAddressDto.city &&
        updateAddressDto.city !== existingAddress.city) ||
      (updateAddressDto.state &&
        updateAddressDto.state !== existingAddress.state) ||
      (updateAddressDto.zipCode &&
        updateAddressDto.zipCode !== existingAddress.zipCode);

    if (addressChanged && !updateAddressDto.lat && !updateAddressDto.lng) {

      const coordinates = await this.geocodeAddress(
        updateAddressDto.street || existingAddress.street,
        updateAddressDto.number || existingAddress.number || undefined,
        updateAddressDto.city || existingAddress.city,
        updateAddressDto.state || existingAddress.state,
        updateAddressDto.zipCode || existingAddress.zipCode,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      } else {
        console.warn(
          'Could not re-geocode address, keeping existing coordinates',
        );
      }
    }

    // Atualizar endereço com coordenadas
    const address = await prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        ...updateAddressDto,
        lat: lat || null,
        lng: lng || null,
      },
    });

    return { address };
  }

  /**
   * Deletar endereço do cliente
   */
  async deleteCustomerAddress(addressId: string, customerId: string) {
    // Verificar se o endereço pertence ao usuário
    const existingAddress = await prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!existingAddress || existingAddress.customerId !== customerId) {
      throw new NotFoundException('Endereço não encontrado');
    }

    await prisma.customerAddress.delete({
      where: { id: addressId },
    });

    return { success: true };
  }

  /**
   * Calcular frete de entrega
   */
  /**
   * Calcular frete de entrega (CORRIGIDO)
   *
   * Mudanças:
   * 1. Considera o level (maior prioridade primeiro)
   * 2. Valores já estão em centavos no banco (20,00 = 2000)
   * 3. Retorna a área com maior level quando há sobreposição
   */

  /**
   * Login do cliente na loja
   */
  async storeLogin(
    storeLoginDto: StoreLoginDto,
    subdomain?: string,
    branchId?: string,
  ) {
    const { phone } = storeLoginDto;

    // Buscar branch se necessário
    let finalBranchId = branchId;
    if (!finalBranchId && subdomain) {
      const branch = await prisma.branch.findUnique({
        where: { subdomain },
      });

      if (branch && branch.active) {
        finalBranchId = branch.id;
      }
    }

    // Buscar usuário existente
    const user = await prisma.user.findUnique({
      where: { phone },
      include: {
        company: true,
        branch: true,
      },
    });

    // Se não existir, retornar erro para redirecionar para cadastro
    if (!user) {
      throw new NotFoundException(
        'Cliente não encontrado. Você ainda não está cadastrado.',
      );
    }

    // Gerar token JWT
    const payload = {
      sub: user.id,
      userId: user.id, // Manter compatibilidade com frontend
      phone: user.phone,
      role: user.role,
      email: user.email || undefined,
      companyId: user.companyId || undefined,
      // Garantir branchId no token para clientes (loja) usarem WS por filial
      branchId: user.branchId || finalBranchId || undefined,
    };

    const token = this.jwtService.sign(payload);

    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      token,
      user: userWithoutPassword,
    };
  }

  /**
   * Buscar anúncios ativos da loja
   */
  async getAnnouncements(subdomain?: string, branchId?: string) {
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch) {
      throw new NotFoundException(
        'Loja não encontrada para o subdomínio ou filial informada',
      );
    }

    const now = new Date();
    const currentDay = now
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();

    const announcements = await prisma.announcement.findMany({
      where: {
        branchId: branch.id,
        active: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const activeAnnouncements = announcements.filter((announcement) => {
      // Verificar período de exibição
      if (announcement.displayPeriod) {
        try {
          const rawPeriod: unknown = JSON.parse(announcement.displayPeriod);

          // Validar estrutura esperada
          if (
            rawPeriod &&
            typeof rawPeriod === 'object' &&
            'startDate' in rawPeriod &&
            'endDate' in rawPeriod &&
            'startTime' in rawPeriod &&
            'endTime' in rawPeriod
          ) {
            const period = rawPeriod as {
              startDate?: string;
              endDate?: string;
              startTime?: string;
              endTime?: string;
            };

            const startDate = period.startDate
              ? new Date(period.startDate)
              : null;
            const endDate = period.endDate ? new Date(period.endDate) : null;

            if (startDate && now < startDate) return false;
            if (endDate && now > endDate) return false;

            if (period.startTime && period.endTime) {
              const currentTime = now.toTimeString().slice(0, 5); // HH:MM
              if (
                currentTime < period.startTime ||
                currentTime > period.endTime
              ) {
                return false;
              }
            }
          }
        } catch (e) {
          console.error('Erro ao parsear displayPeriod:', e);
        }
      }

      // Verificar dias da semana
      if (announcement.displayDays) {
        try {
          const rawDays: unknown = JSON.parse(announcement.displayDays);

          if (
            Array.isArray(rawDays) &&
            rawDays.every((d) => typeof d === 'string')
          ) {
            const days = rawDays;
            if (days.length > 0 && !days.includes(currentDay)) {
              return false;
            }
          }
        } catch (e) {
          console.error('Erro ao parsear displayDays:', e);
        }
      }

      return true;
    });

    return { announcements: activeAnnouncements };
  }

  /**
   * Buscar endereço por CEP usando ViaCEP
   */
  async searchCep(zipCode: string) {
    // Remover caracteres não numéricos
    const cleanCep = zipCode.replace(/\D/g, '');

    // Validar CEP (deve ter 8 dígitos)
    if (cleanCep.length !== 8) {
      throw new BadRequestException('CEP deve ter 8 dígitos');
    }

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cleanCep}/json/`,
        {
          headers: { 'User-Agent': 'AnotaJa/1.0' },
        },
      );

      if (!response.ok) {
        throw new BadRequestException('Erro ao buscar CEP');
      }

      const rawResult: unknown = await response.json();

      // Validar estrutura do JSON
      if (
        !rawResult ||
        typeof rawResult !== 'object' ||
        !('cep' in rawResult) ||
        !('logradouro' in rawResult) ||
        !('bairro' in rawResult) ||
        !('localidade' in rawResult) ||
        !('uf' in rawResult)
      ) {
        throw new BadRequestException('Resposta inválida da API de CEP');
      }

      const result = rawResult as CepResult;

      if (result.erro) {
        throw new NotFoundException('CEP não encontrado');
      }

      return {
        cep: result.cep,
        logradouro: result.logradouro || '',
        complemento: result.complemento || '',
        bairro: result.bairro || '',
        localidade: result.localidade || '',
        uf: result.uf || '',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException('Erro ao buscar CEP. Tente novamente.');
    }
  }

  /**
   * Validar cupom de desconto
   */
  async validateCoupon(
    code: string,
    subtotal: number,
    subdomain?: string,
    branchId?: string,
  ) {
    const branch = await this.getBranch(subdomain, branchId);
    if (!branch) {
      throw new NotFoundException('Loja não encontrada');
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        branchId: branch.id,
        active: true,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
      },
    });

    if (!coupon) {
      return {
        valid: false,
        message: 'Cupom inválido ou expirado',
      };
    }

    // Validar uso do cupom
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return {
        valid: false,
        message: 'Cupom esgotado',
      };
    }

    // Validar valor mínimo - só avisa se o subtotal atual não atingir
    if (coupon.minValue && subtotal < coupon.minValue) {
      const valorFaltante = coupon.minValue - subtotal;
      return {
        valid: false,
        message: `Adicione mais ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorFaltante)} para atingir o pedido mínimo de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coupon.minValue)}`,
      };
    }

    // Calcular desconto
    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = Math.round((subtotal * coupon.value) / 100);
      // Aplicar desconto máximo se houver
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.value;
    }

    return {
      valid: true,
      discount,
      message: `Cupom aplicado com sucesso! Desconto de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(discount)}`,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },
    };
  }
}
