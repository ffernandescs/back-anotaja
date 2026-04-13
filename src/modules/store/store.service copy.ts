import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Customer, CustomerType, OrderChannel, Prisma, ServiceType, StockMovement } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { CouponsService } from '../coupons/coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
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
import console from 'console';
import { UpdateOrderDto } from '../orders/dto/update-order.dto';
import { NormalizedOrder } from '../orders/dto/order-normalized.type';
import { DeliveryTypeDto, OrderStatusDto } from '../orders/dto/create-order-item.dto';
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
    private couponsService: CouponsService,
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

    // Verificar status da subscription da empresa
    const subscription = await prisma.subscription.findUnique({
      where: { companyId: branch.companyId },
      include: { plan: true },
    });

    let canReceiveOrders = true;
    let subscriptionReason: 'SUSPENDED' | 'TRIAL_EXPIRED' | null = null;

    if (subscription) {
      // Verificar se está suspensa
      if (subscription.status === 'SUSPENDED') {
        canReceiveOrders = false;
        subscriptionReason = 'SUSPENDED';
      }

      // Verificar se trial expirou
      if (subscription.plan.type === 'TRIAL' && subscription.endDate) {
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now > endDate) {
          canReceiveOrders = false;
          subscriptionReason = 'TRIAL_EXPIRED';
        }
      }
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

    // Buscar configurações gerais da filial
    const generalConfig = await prisma.generalConfig.findUnique({
      where: { branchId: branch.id },
    });

    // ================================
    // Estoque atual (produtos e opções)
    // ================================
    const productIds = categories.flatMap((category) =>
      category.products.map((product) => product.id),
    );
    const allOptionIds = categories.flatMap((category) =>
      category.products.flatMap((product) =>
        product.complements.flatMap((complement) => complement.options.map((opt) => opt.id)),
      ),
    );

    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        branchId: branch.id,
        OR: [
          { productId: { in: productIds } },
          { optionId: { in: allOptionIds } },
        ],
      },
      select: {
        productId: true,
        optionId: true,
        variation: true,
      },
    });

    const productStockMap = new Map<string, number>();
    const optionStockMap = new Map<string, number>();

    stockMovements.forEach((movement) => {
      if (movement.productId) {
        productStockMap.set(
          movement.productId,
          (productStockMap.get(movement.productId) || 0) + movement.variation,
        );
      }
      if (movement.optionId) {
        optionStockMap.set(
          movement.optionId,
          (optionStockMap.get(movement.optionId) || 0) + movement.variation,
        );
      }
    });

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
        generalConfig: generalConfig
          ? {
              enableDelivery: generalConfig.enableDelivery,
              enableDineIn: generalConfig.enableDineIn,
              enablePickup: generalConfig.enablePickup,
            }
          : {
              enableDelivery: true,
              enableDineIn: true,
              enablePickup: true,
            },
      },
      subscription: subscription ? {
        status: subscription.status,
        canReceiveOrders,
        reason: subscriptionReason,
      } : undefined,
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
          currentStock: product.stockControlEnabled
            ? productStockMap.get(product.id) || 0
            : null,
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
              stockControlEnabled: option.stockControlEnabled,
              minStock: option.minStock,
              currentStock: option.stockControlEnabled
                ? optionStockMap.get(option.id) || 0
                : null,
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

  private normalize(dto: UpdateOrderDto): NormalizedOrder {
  if (!dto.deliveryType) {
    throw new BadRequestException('deliveryType é obrigatório');
  }

  if (!dto.items?.length) {
    throw new BadRequestException('items são obrigatórios');
  }

  if (!dto.payments?.length) {
    throw new BadRequestException('payments são obrigatórios');
  }

  return {
    deliveryType: dto.deliveryType,
    items: dto.items,
    payments: dto.payments,
  };
}
  /**
   * Helper function to calculate current stock for products
   */
  private async calculateStockForProducts(productIds: string[], branchId: string): Promise<Record<string, number>> {
    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        branchId,
        productId: { in: productIds },
      },
      select: {
        productId: true,
        quantity: true,
        type: true,
      },
    });

    const stockByProduct: Record<string, number> = {};
    stockMovements.forEach((movement) => {
      if (!movement.productId) return;
      const currentStock = stockByProduct[movement.productId] || 0;
      const movementQty = movement.type === 'ENTRADA' ? movement.quantity : -movement.quantity;
      stockByProduct[movement.productId] = Math.max(0, currentStock + movementQty);
    });

    return stockByProduct;
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
        products: {
          where: { active: true },
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
          },
        },
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

    // Calcular estoque atual dos produtos
    const productIds = categories.flatMap((category) =>
      category.products.map((product) => product.id),
    );

    const stockByProduct = await this.calculateStockForProducts(productIds, branch.id);

    return {
      categories: categories.map((category) => ({
        ...category,
        products: category.products.map((product) => ({
          ...product,
          currentStock: stockByProduct[product.id] || 0,
        })),
      })),
    };
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
                stockControlEnabled: true,
                minStock: true,
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });

    // Buscar movimentações de estoque para produtos e opções
    const productIds = products.map((p) => p.id);
    const allOptionIds: string[] = [];
    products.forEach((p) => {
      p.complements.forEach((c) => {
        c.options.forEach((o) => allOptionIds.push(o.id));
      });
    });

    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        branchId: branch.id,
        OR: [
          { productId: { in: productIds } },
          { optionId: { in: allOptionIds } },
        ],
      },
      select: {
        productId: true,
        optionId: true,
        variation: true,
      },
    });

    // Calcular estoque atual por produto
    const productStockMap = new Map<string, number>();
    const optionStockMap = new Map<string, number>();

    stockMovements.forEach((m) => {
      if (m.productId) {
        productStockMap.set(
          m.productId,
          (productStockMap.get(m.productId) || 0) + m.variation,
        );
      }
      if (m.optionId) {
        optionStockMap.set(
          m.optionId,
          (optionStockMap.get(m.optionId) || 0) + m.variation,
        );
      }
    });

    // Adicionar currentStock aos produtos e opções
    const productsWithStock = products.map((product) => ({
      ...product,
      currentStock: product.stockControlEnabled
        ? productStockMap.get(product.id) || 0
        : null,
      complements: product.complements.map((complement) => ({
        ...complement,
        options: complement.options.map((option) => ({
          ...option,
          currentStock: option.stockControlEnabled
            ? optionStockMap.get(option.id) || 0
            : null,
        })),
      })),
    }));

    return { products: productsWithStock };
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
   * Buscar CEP no ViaCEP e geocodificar para lat/lng
   */
  async lookupCep(
    cep: string,
    extra?: {
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    },
  ) {
    const sanitizedCep = (cep || '').replace(/\D/g, '');
    if (sanitizedCep.length !== 8) {
      throw new BadRequestException('CEP inválido');
    }

    const viaCepRes = await fetch(`https://viacep.com.br/ws/${sanitizedCep}/json/`);
    if (!viaCepRes.ok) {
      throw new BadRequestException('Erro ao consultar CEP');
    }

    const viaCepData: any = await viaCepRes.json();
    if (viaCepData?.erro) {
      throw new NotFoundException('CEP não encontrado');
    }

    // Prefer dados preenchidos pelo cliente para maior precisão
    const street = extra?.street || viaCepData.logradouro || '';
    const neighborhood = extra?.neighborhood || viaCepData.bairro || '';
    const city = extra?.city || viaCepData.localidade || '';
    const state = extra?.state || viaCepData.uf || '';
    const number = extra?.number;

    const coords = await this.geocodeAddress(street, number, city, state, sanitizedCep, neighborhood);

    return {
      zipCode: sanitizedCep,
      street,
      neighborhood,
      city,
      state,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  }

  /**
   * Validar se a loja está aberta
   */
  private async validateStoreOpen(branchId: string): Promise<void> {
    const openingHours = await prisma.branchSchedule.findMany({
      where: { branchId },
    });

    if (openingHours.length > 0) {
      // Usar timezone do Brasil para comparação correta de horários
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const nowDate = new Date(now);
      const daysOfWeek = [
        'sunday','monday','tuesday','wednesday','thursday','friday','saturday',
      ];
      const currentDay = daysOfWeek[nowDate.getDay()];

      const todaySchedule =
        openingHours.find(
          (h) =>
            h.date &&
            new Date(h.date).toDateString() === nowDate.toDateString(),
        ) || openingHours.find((h) => h.day === currentDay);

      if (todaySchedule) {
        if (todaySchedule.closed) {
          throw new BadRequestException(
            'Loja fechada. Não é possível realizar pedidos no momento.',
          );
        }

        const currentTime = `${nowDate.getHours().toString().padStart(2, '0')}:${nowDate.getMinutes().toString().padStart(2, '0')}`;

        if (
          currentTime < todaySchedule.open ||
          currentTime > todaySchedule.close
        ) {
          throw new BadRequestException(
            `Loja fechada. Horário de funcionamento: ${todaySchedule.open} às ${todaySchedule.close}`,
          );
        }
      }
    }
  }

  /**
   * Validar cliente
   */
private async validateCustomer(
  customerId?: string,
  customerPhone?: string,
  branchId?: string,
  isPdv?: boolean,
): Promise<Customer | null> {

  let customer: Customer | null = null;

  // =========================
  // 🧾 PDV MODE (SEM CLIENTE)
  // =========================
  if (isPdv) {
    if (customerId) {
      customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new NotFoundException('Cliente não encontrado');
      }

      if (branchId && customer.branchId !== branchId) {
        throw new BadRequestException('Cliente não pertence a esta filial');
      }

      return customer;
    }

    if (customerPhone && branchId) {
      customer = await prisma.customer.findFirst({
        where: { phone: customerPhone, branchId },
      });

      if (customer) return customer;
    }

    // 🔥 PDV: SEM CLIENTE MESMO
    return null;
  }

  // =========================
  // ❌ NON-PDV (OBRIGATÓRIO)
  // =========================
  if (customerId) {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    if (branchId && customer.branchId !== branchId) {
      throw new BadRequestException('Cliente não pertence a esta filial');
    }

    return customer;
  }

  if (customerPhone && branchId) {
    customer = await prisma.customer.findFirst({
      where: { phone: customerPhone, branchId },
    });

    if (!customer) {
      throw new BadRequestException(
        'Cliente não encontrado. Faça login ou cadastro primeiro.',
      );
    }

    return customer;
  }

  throw new BadRequestException(
    'customerId ou customerPhone é obrigatório',
  );
}

  /**
   * Validar produtos e complementos (pertencem à mesma branch)
   */
  private async validateProductsAndComplements(
    items: any[],
    branchId: string,
  ): Promise<{ productMap: Map<string, any>; optionMap: Map<string, any> }> {
    const productIds = items.map((i) => i.productId).filter((id): id is string => id !== undefined);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        complements: { include: { options: true } },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validar se produtos pertencem à mesma branch
    for (const product of products) {
      if (product.branchId !== branchId) {
        throw new BadRequestException(`Produto "${product.name}" não pertence a esta filial`);
      }
    }

    // Buscar opções de complemento
    const allOptionIds: string[] = [];
    for (const item of items) {
      if (item.complements) {
        for (const comp of item.complements) {
          for (const opt of comp.options) {
            if (opt.optionId) {
              allOptionIds.push(opt.optionId);
            }
          }
        }
      }
    }

    const complementOptions = allOptionIds.length
      ? await prisma.complementOption.findMany({
          where: { id: { in: allOptionIds } },
        })
      : [];

    const optionMap = new Map(complementOptions.map((o) => [o.id, o]));

    // Validar se opções pertencem à mesma branch
    for (const option of complementOptions) {
      if (option.branchId !== branchId) {
        throw new BadRequestException(`Opção "${option.name}" não pertence a esta filial`);
      }
    }

    return { productMap, optionMap };
  }

  /**
   * Calcular subtotal dos itens
   */
  private calculateSubtotal(
    items: any[],
    productMap: Map<string, any>,
    optionMap: Map<string, any>,
  ): { subtotal: number; itemsData: any[] } {
    let subtotal = 0;

    const itemsData = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.active)
        throw new NotFoundException(`Produto ${item.productId} não encontrado`);

      let itemPrice = product.price;

      if (item.complements?.length) {
        for (const complement of item.complements) {
          for (const option of complement.options) {
            const complementOption = optionMap.get(option.optionId);
            if (complementOption?.active)
              itemPrice += complementOption.price * (option.quantity || 1);
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

    return { subtotal, itemsData };
  }

  /**
   * Validar e aplicar cupom
   */
  private async validateAndApplyCoupon(
    couponId: string | undefined,
    branchId: string,
    customerId: string | null | undefined,
    subtotal: number,
    manualDiscount?: number,
  ): Promise<{ discount: number; appliedCouponId: string | null }> {
    let discount = 0;
    let appliedCouponId: string | null = null;

    // Se discount foi fornecido manualmente, usar esse valor
    if (manualDiscount !== undefined) {
      discount = manualDiscount;
      // Manter a associação do cupom mesmo com desconto manual
      if (couponId) {
        appliedCouponId = couponId;
      }
    } else if (couponId) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          id: couponId,
          branchId: branchId,
          active: true,
          validFrom: { lte: new Date() },
          validUntil: { gte: new Date() },
        },
      });

      if (!coupon) {
        throw new BadRequestException('Cupom inválido ou expirado');
      }

      // Validar se cupom pode ser usado pelo mesmo cliente
      if (!coupon.allowMultipleUsesPerCustomer) {
        const existingOrder = await prisma.order.findFirst({
          where: {
            couponId: coupon.id,
            customerId,
          },
        });
        if (existingOrder) {
          throw new BadRequestException('Este cupom já foi utilizado por este cliente');
        }
      }

      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
        throw new BadRequestException('Cupom esgotado');
      if (coupon.minValue && subtotal < coupon.minValue)
        throw new BadRequestException(
          `Valor mínimo do pedido não atingido: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coupon.minValue)}`,
        );

      discount =
        coupon.type === 'PERCENTAGE'
          ? Math.round((subtotal * coupon.value) / 100)
          : coupon.value;
      appliedCouponId = coupon.id;
    }

    return { discount, appliedCouponId };
  }

  /**
   * Validar métodos de pagamento
   */
  private async validatePaymentMethods(
    payments: any[],
    branchId: string,
  ): Promise<void> {
    if (!payments?.length)
      throw new BadRequestException(
        'Ao menos uma forma de pagamento é obrigatória',
      );

    const paymentMethodIds = payments.map((p) => p.paymentMethodId);

    const branchPaymentMethods = await prisma.branchPaymentMethod.findMany({
      where: { id: { in: paymentMethodIds }, branchId },
      include: { paymentMethod: true },
    });

    const paymentMethodMap = new Map(
      branchPaymentMethods.map((pm) => [pm.id, pm]),
    );

    for (const payment of payments) {
      const pm = paymentMethodMap.get(payment.paymentMethodId);
      if (!pm?.paymentMethod.isActive)
        throw new BadRequestException(
          'Método de pagamento inválido ou inativo',
        );
    }
  }

  /**
   * Validar estoque disponível
   */
  private async validateStock(
    branchId: string,
    productQuantities: Map<string, number>,
    optionQuantities: Map<string, number>,
    ingredientQuantities: Map<string, number>,
  ): Promise<{
    stockProducts: any[];
    stockOptions: any[];
    stockIngredients: any[];
  }> {
    // Buscar produtos, opções e ingredientes com stockControlEnabled
    const [stockProducts, stockOptions, stockIngredients] = await Promise.all([
      productQuantities.size
        ? prisma.product.findMany({
            where: { id: { in: Array.from(productQuantities.keys()) } },
            select: { id: true, name: true, stockControlEnabled: true },
          })
        : [],
      optionQuantities.size
        ? prisma.complementOption.findMany({
            where: { id: { in: Array.from(optionQuantities.keys()) } },
            select: { id: true, name: true, stockControlEnabled: true },
          })
        : [],
      ingredientQuantities.size
        ? prisma.ingredient.findMany({
            where: { id: { in: Array.from(ingredientQuantities.keys()) } },
            select: { id: true, name: true, stockControlEnabled: true },
          })
        : [],
    ]);

    // Buscar movimentações de estoque atuais
    const productStockMovements = await prisma.stockMovement.findMany({
      where: {
        branchId,
        OR: [
          { productId: { in: Array.from(productQuantities.keys()) } },
          { optionId: { in: Array.from(optionQuantities.keys()) } },
        ],
      },
      select: {
        productId: true,
        optionId: true,
        variation: true,
      },
    });

    const currentProductStock = new Map<string, number>();
    const currentOptionStock = new Map<string, number>();

    productStockMovements.forEach((m) => {
      if (m.productId) {
        currentProductStock.set(
          m.productId,
          (currentProductStock.get(m.productId) || 0) + m.variation,
        );
      }
      if (m.optionId) {
        currentOptionStock.set(
          m.optionId,
          (currentOptionStock.get(m.optionId) || 0) + m.variation,
        );
      }
    });

    // Validar produtos
    for (const product of stockProducts) {
      if (!product.stockControlEnabled) continue;
      const requestedQty = productQuantities.get(product.id) || 0;
      const availableStock = currentProductStock.get(product.id) || 0;
      
      if (availableStock < requestedQty) {
        throw new BadRequestException(
          `Produto "${product.name}" sem estoque suficiente. Disponível: ${availableStock}, Solicitado: ${requestedQty}`,
        );
      }
    }

    // Validar opções
    for (const option of stockOptions) {
      if (!option.stockControlEnabled) continue;
      const requestedQty = optionQuantities.get(option.id) || 0;
      const availableStock = currentOptionStock.get(option.id) || 0;
      
      if (availableStock < requestedQty) {
        throw new BadRequestException(
          `Opção "${option.name}" sem estoque suficiente. Disponível: ${availableStock}, Solicitado: ${requestedQty}`,
        );
      }
    }

    return { stockProducts, stockOptions, stockIngredients };
  }

  /**
   * Calcular quantidades de produtos, opções e ingredientes
   */
  private calculateQuantities(
    itemsData: any[],
  ): {
    productQuantities: Map<string, number>;
    optionQuantities: Map<string, number>;
    ingredientQuantities: Map<string, number>;
  } {
    const productQuantities = new Map<string, number>();
    const optionQuantities = new Map<string, number>();
    const ingredientQuantities = new Map<string, number>();

    for (const item of itemsData) {
      productQuantities.set(
        item.productId,
        (productQuantities.get(item.productId) || 0) + item.quantity,
      );

      if (item.complements) {
        for (const comp of item.complements) {
          for (const opt of comp.options) {
            optionQuantities.set(
              opt.optionId,
              (optionQuantities.get(opt.optionId) || 0) + (opt.quantity || 1),
            );
          }
        }
      }
    }

    return { productQuantities, optionQuantities, ingredientQuantities };
  }

  /**
   * Calcular todos os valores do pedido (subtotal, delivery fee, service fee, discount, total)
   */
  private async calculateOrderValues(
    branchId: string,
    deliveryType: DeliveryTypeDto,
    addressId: string | undefined,
    subtotal: number,
    subdomain?: string,
    branchIdParam?: string,
  ): Promise<{
    deliveryFee: number;
    serviceFee: number;
    estimatedTime: number | null;
  }> {
    let deliveryFee = 0;
    let serviceFee = 0;
    let estimatedTime: number | null = null;

    // Calcular delivery fee
    if (deliveryType === DeliveryTypeDto.DELIVERY) {
      if (!addressId) {
        throw new BadRequestException(
          'Endereço completo é obrigatório para delivery',
        );
      }
      
      const customerAddress = await prisma.customerAddress.findUnique({
        where: { id: addressId },
      });
      if (!customerAddress)
        throw new BadRequestException(
          'Endereço completo é obrigatório para delivery',
        );

      const feeResult = await this.calculateDeliveryFee(
        {
          address: customerAddress.street,
          city: customerAddress.city,
          state: customerAddress.state,
          zipCode: customerAddress.zipCode,
          lat: customerAddress?.lat || undefined,
          lng: customerAddress?.lng || undefined,
          subtotal,
        },
        subdomain,
        branchIdParam,
      );

      if (!feeResult.available)
        throw new BadRequestException(
          feeResult.message || 'Delivery não disponível para este endereço',
        );

      deliveryFee = feeResult.deliveryFee;
      estimatedTime = feeResult.estimatedTime || null;
    }

    // Calcular taxa de serviço
    if (deliveryType === DeliveryTypeDto.DINE_IN) {
      const generalConfig = await prisma.generalConfig.findUnique({
        where: { branchId },
      });
      
      if (generalConfig?.enableServiceFee) {
        const percentage = generalConfig.serviceFeePercentage || 10;
        serviceFee = Math.round((subtotal * percentage) / 100);
      }
    }

    return { deliveryFee, serviceFee, estimatedTime };
  }

  /**
   * Criar pedido na loja (checkout)
   */
async createOrder(
  createOrderDto: CreateStoreOrderDto,
  subdomain?: string,
  branchId?: string,
) {
  const branch = await this.getBranch(subdomain, branchId);
  if (!branch) throw new NotFoundException('Loja não encontrada');

  await this.validateStoreOpen(branch.id);

  const { limits } = await this.validateSubscription(branch.companyId);
  await this.validateOrderLimit(branch.companyId, limits);

  const {
    deliveryType,
    customerId,
    customerPhone,
    couponId,
    items,
    addressId,
    payments,
  } = createOrderDto;

  // =========================================================
  // 🧠 CUSTOMER LOGIC (NOVO PADRÃO)
  // =========================================================
  let customer: Customer | null = null;

  if (customerId) {
    customer = await this.validateCustomer(customerId, customerPhone, branch.id);
  }

  // =========================================================
  // PRODUTOS
  // =========================================================
  const { productMap, optionMap } =
    await this.validateProductsAndComplements(items, branch.id);

  const { subtotal, itemsData } =
    this.calculateSubtotal(items, productMap, optionMap);

  const { deliveryFee, serviceFee, estimatedTime } =
    await this.calculateOrderValues(
      branch.id,
      deliveryType,
      addressId,
      subtotal,
      subdomain,
      branchId,
    );

  // =========================================================
  // CUPOM
  // =========================================================
  const { discount, appliedCouponId } =
    await this.validateAndApplyCoupon(
      couponId,
      branch.id,
      customer?.id,
      subtotal,
      createOrderDto.discount,
    );

  const total = subtotal + deliveryFee + serviceFee - discount;

  await this.validatePaymentMethods(payments, branch.id);

  // =========================================================
  // ESTOQUE
  // =========================================================
  const { productQuantities, optionQuantities } =
    this.calculateQuantities(itemsData);

  const productIngredients = await prisma.productIngredient.findMany({
    where: { productId: { in: Array.from(productQuantities.keys()) } },
  });

  const ingredientQuantities = new Map<string, number>();

  for (const pi of productIngredients) {
    const qty = productQuantities.get(pi.productId) || 0;

    ingredientQuantities.set(
      pi.ingredientId,
      (ingredientQuantities.get(pi.ingredientId) || 0) + pi.quantity * qty,
    );
  }

  const { stockProducts, stockOptions, stockIngredients } =
    await this.validateStock(
      branch.id,
      productQuantities,
      optionQuantities,
      ingredientQuantities,
    );

  // =========================================================
  // TRANSAÇÃO
  // =========================================================
  const order = await prisma.$transaction(async (tx) => {
    const lastOrder = await tx.order.findFirst({
      where: { branchId: branch.id },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    const orderNumber = (lastOrder?.orderNumber || 0) + 1;

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        status: OrderStatusDto.PENDING,

        branchId: branch.id,

        // 👇 NOVO PADRÃO
        channel: createOrderDto.serviceType === "TAKEAWAY" ? OrderChannel.ONLINE : OrderChannel.PDV,
        serviceType: createOrderDto.serviceType || ServiceType.TAKEAWAY,
        customerType: createOrderDto.customerId ? CustomerType.REGISTERED : CustomerType.GUEST,
        // 👇 PERMITE NULL
        customerId: customer?.id ?? null,

        deliveryType,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        total,
        estimatedTime,

        couponId: appliedCouponId,
        customerAddressId: addressId,

        items: {
                         create: itemsData.map((item) => ({
                           productId: item.productId,
                           quantity: item.quantity,
                           price: item.price,
                           notes: item.notes,
                           complements: item.complements?.length
                             ? {
                                 create: item.complements.map((comp) => ({
                                   complementId: comp.complementId,
                                   options: {
                                     create: comp.options.map((opt) => ({
                                       optionId: opt.optionId,
                                       quantity: opt.quantity || 1,
                                     })),
                                   },
                                 })),
                               }
                             : undefined,
                         })),
                       },
                       payments: {
                         create: payments.map((p) => {
                           const amount = p.amount;
                           const amountGiven = p.amountGiven || (p.type === PaymentTypeDto.CASH ? amount : null);
                           const calculatedChange = p.type === PaymentTypeDto.CASH && amountGiven && amountGiven > amount ? amountGiven - amount : 0;
       
                           return {
                             type: p.type,
                             amount,
                             amountGiven,
                             paymentMethodId: p.paymentMethodId,
                             change: calculatedChange,
                             status: 'PENDING',
                           };
                         }),
                       },
      },
    });

    return createdOrder;
  });

  

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      customer: true,
      items: { include: { product: true, complements: {
              include: {
                complement: true,
                options: { include: { option: true } },
              },
            }, } },
      payments: true,
    },
  });

  if (!fullOrder?.id || !fullOrder?.branchId) {
    throw new InternalServerErrorException('Pedido inválido para emissão');
  }

  this.webSocketGateway.emitOrderUpdate(
    {
      ...fullOrder,
      fromPDV: fullOrder.serviceType === ServiceType.TAKEAWAY ? false : true,
    },
    'order:created',
  );

  return {
    success: true,
    order: fullOrder,
  };
}


  async calculateDeliveryFee(
    calculateFeeDto: CalculateDeliveryFeeDto,
    subdomain?: string,
    branchId?: string,
  ) {
    let branch = await this.getBranch(subdomain, branchId);

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
            type: true,
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
    neighborhood?: string,
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      // Montar endereço completo
      const addressParts = [street, number, neighborhood, city, state, zipCode, 'Brasil'].filter(
        Boolean,
      );

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

    // 🔥 Sempre geocodificar no backend para ter mesma origem de coordenadas usada nas áreas
    let lat: number | null = null;
    let lng: number | null = null;

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
    } else if (isValidCoord(createAddressDto.lat) && isValidCoord(createAddressDto.lng)) {
      // fallback: usar coordenadas fornecidas se geocoding falhar
      lat = createAddressDto.lat!;
      lng = createAddressDto.lng!;
    } else {
      console.warn('Could not geocode address, saving without coordinates');
    }

    // Criar endereço com coordenadas
    const address = await prisma.customerAddress.create({
      data: {
        ...createAddressDto,
        lat,
        lng,
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
    let lat = existingAddress.lat;
    let lng = existingAddress.lng;

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

    if (addressChanged) {
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
      } else if (isValidCoord(updateAddressDto.lat) && isValidCoord(updateAddressDto.lng)) {
        lat = updateAddressDto.lat!;
        lng = updateAddressDto.lng!;
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
      groupId: user.groupId,
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
  async validateCoupon(data: ValidateCouponDto & { subdomain?: string; branchId?: string }) {
    const { code, subtotal = 0, subdomain, branchId, deliveryType, paymentMethodId, productIds, customerId } = data;

    const branch = await this.getBranch(subdomain, branchId);
    if (!branch) {
      throw new NotFoundException('Loja não encontrada');
    }

    return this.couponsService.validateCouponForStore({
      code,
      branchId: branch.id,
      customerId,
      deliveryType,
      paymentMethodId,
      productIds,
      subtotal,
    });
  }

  /**
   * Validar horário de funcionamento da loja
   */
  async validateBranchOpeningHours(branchId: string): Promise<void> {
    const openingHours = await prisma.branchSchedule.findMany({
      where: { branchId },
    });

    if (openingHours.length > 0) {
      // Usar timezone do Brasil para comparação correta de horários
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const nowDate = new Date(now);
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = daysOfWeek[nowDate.getDay()];

      const todaySchedule =
        openingHours.find((h) => h.date && new Date(h.date).toDateString() === nowDate.toDateString()) ||
        openingHours.find((h) => h.day === currentDay);

      if (todaySchedule) {
        if (todaySchedule.closed) {
          throw new BadRequestException('Loja fechada. Não é possível realizar pedidos no momento.');
        }

        const currentTime = `${nowDate.getHours().toString().padStart(2, '0')}:${nowDate.getMinutes().toString().padStart(2, '0')}`;

        if (currentTime < todaySchedule.open || currentTime > todaySchedule.close) {
          throw new BadRequestException(
            `Loja fechada. Horário de funcionamento: ${todaySchedule.open} às ${todaySchedule.close}`,
          );
        }
      }
    }
  }

  /**
   * Calcular delivery fee para um pedido
   */
  async calculateDeliveryFeeForOrder(
    addressId: string,
    subtotal: number,
    branchId: string,
  ): Promise<{ deliveryFee: number; estimatedTime: number | null }> {
    const customerAddress = await prisma.customerAddress.findUnique({
      where: { id: addressId },
    });

    if (!customerAddress) {
      throw new BadRequestException('Endereço completo é obrigatório para delivery');
    }

    const feeResult = await this.calculateDeliveryFee(
      {
        address: customerAddress.street,
        city: customerAddress.city,
        state: customerAddress.state,
        zipCode: customerAddress.zipCode,
        lat: customerAddress?.lat || undefined,
        lng: customerAddress?.lng || undefined,
        subtotal,
      },
      undefined,
      branchId,
    );

    if (!feeResult.available) {
      throw new BadRequestException(feeResult.message || 'Delivery não disponível para este endereço');
    }

    return {
      deliveryFee: feeResult.deliveryFee,
      estimatedTime: feeResult.estimatedTime || null,
    };
  }

  /**
   * Calcular service fee para pedidos DINE_IN
   */
  async calculateServiceFeeForOrder(branchId: string, subtotal: number): Promise<number> {
    const generalConfig = await prisma.generalConfig.findUnique({
      where: { branchId },
    });

    if (generalConfig?.enableServiceFee) {
      const percentage = generalConfig.serviceFeePercentage || 10;
      return Math.round((subtotal * percentage) / 100);
    }

    return 0;
  }

  /**
   * Aplicar cupom de desconto
   */
  async applyCouponForOrder(
    couponId: string | null,
    branchId: string,
    subtotal: number,
  ): Promise<{ discount: number; appliedCouponId: string | null }> {
    if (!couponId) {
      return { discount: 0, appliedCouponId: null };
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        id: couponId,
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
          `Valor mínimo do pedido não atingido: ${new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(coupon.minValue)}`,
        );
      }

      const discount =
        coupon.type === 'PERCENTAGE'
          ? Math.round((subtotal * coupon.value) / 100)
          : coupon.value;

      return { discount, appliedCouponId: coupon.id };
    }

    return { discount: 0, appliedCouponId: null };
  }

  /**
   * Validar métodos de pagamento
   */
  async validatePaymentMethodsForOrder(
    payments: any[],
    branchId: string,
  ): Promise<void> {
    if (!payments?.length) {
      throw new BadRequestException('Ao menos uma forma de pagamento é obrigatória');
    }

    const paymentMethodIds = payments.map((p) => p.paymentMethodId);

    const branchPaymentMethods = await prisma.branchPaymentMethod.findMany({
      where: { id: { in: paymentMethodIds }, branchId },
      include: { paymentMethod: true },
    });

    const paymentMethodMap = new Map(branchPaymentMethods.map((pm) => [pm.id, pm]));

    for (const payment of payments) {
      const pm = paymentMethodMap.get(payment.paymentMethodId);
      if (!pm?.paymentMethod.isActive) {
        throw new BadRequestException('Método de pagamento inválido ou inativo');
      }
    }
  }

  /**
   * Atualizar pedido - reutiliza a lógica do createOrder
   */
async updateOrder(
  orderId: string,
  updateOrderDto: UpdateOrderDto,
  subdomain?: string,
  branchId?: string,
) {
  // =====================================================
  // 1. BUSCAR PEDIDO
  // =====================================================
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!existingOrder) {
    throw new NotFoundException('Pedido não encontrado');
  }

  const branch = await this.getBranch(subdomain, existingOrder.branchId);
  if (!branch) throw new NotFoundException('Loja não encontrada');

  await this.validateStoreOpen(branch.id);

  // =====================================================
  // 2. NORMALIZAÇÃO (🔥 GARANTE TIPAGEM SEGURA)
  // =====================================================
  const normalized = this.normalize(updateOrderDto);

  const { deliveryType, items, payments } = normalized;

  const {
    customerId,
    customerPhone,
    couponId,
    addressId,
  } = updateOrderDto;

  // =====================================================
  // 3. CUSTOMER LOGIC
  // =====================================================
  let customer: Customer | null = null;

  if (customerId) {
    customer = await this.validateCustomer(
      customerId,
      customerPhone,
      branch.id,
    );
  }

  // =====================================================
  // 4. PRODUTOS + COMPLEMENTOS
  // =====================================================
  const { productMap, optionMap } =
    await this.validateProductsAndComplements(items, branch.id);

  const { subtotal, itemsData } =
    this.calculateSubtotal(items, productMap, optionMap);

  // =====================================================
  // 5. TAXAS
  // =====================================================
  const { deliveryFee, serviceFee, estimatedTime } =
    await this.calculateOrderValues(
      branch.id,
      deliveryType,
      addressId,
      subtotal,
      subdomain,
      branchId,
    );

  // =====================================================
  // 6. CUPOM
  // =====================================================
  let discount = 0;
  let appliedCouponId: string | null = null;

  if (couponId !== existingOrder.couponId) {
    const result = await this.validateAndApplyCoupon(
      couponId,
      branch.id,
      customer?.id,
      subtotal,
      updateOrderDto.discount,
    );

    discount = result.discount;
    appliedCouponId = result.appliedCouponId;
  } else {
    discount = existingOrder.discount;
    appliedCouponId = existingOrder.couponId;
  }

  const total = subtotal + deliveryFee + serviceFee - discount;

  // =====================================================
  // 7. VALIDA PAGAMENTOS
  // =====================================================
  await this.validatePaymentMethods(payments, branch.id);

  // =====================================================
  // 8. ESTOQUE (CÁLCULO NOVO)
  // =====================================================
  const { productQuantities, optionQuantities } =
    this.calculateQuantities(itemsData);

  const productIngredients = await prisma.productIngredient.findMany({
    where: { productId: { in: Array.from(productQuantities.keys()) } },
  });

  const ingredientQuantities = new Map<string, number>();

  for (const pi of productIngredients) {
    const qty = productQuantities.get(pi.productId) || 0;

    ingredientQuantities.set(
      pi.ingredientId,
      (ingredientQuantities.get(pi.ingredientId) || 0) +
        pi.quantity * qty,
    );
  }

  const { stockProducts, stockOptions, stockIngredients } =
    await this.validateStock(
      branch.id,
      productQuantities,
      optionQuantities,
      ingredientQuantities,
    );

  // =====================================================
  // 9. PEDIDO ANTIGO (ROLLBACK ESTOQUE)
  // =====================================================
  const oldItems = await prisma.orderItem.findMany({
    where: { orderId },
    include: {
      complements: { include: { options: true } },
    },
  });

  const oldProductQuantities = new Map<string, number>();

  for (const item of oldItems) {
    oldProductQuantities.set(
      item.productId,
      (oldProductQuantities.get(item.productId) || 0) +
        item.quantity,
    );
  }

  // =====================================================
  // 10. TRANSAÇÃO
  // =====================================================
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // remove itens antigos
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.orderPayment.deleteMany({ where: { orderId } });

    // rollback estoque
    for (const product of await tx.product.findMany({
      where: { id: { in: Array.from(oldProductQuantities.keys()) } },
    })) {
      const qty = oldProductQuantities.get(product.id) || 0;
      if (!qty) continue;

      await tx.stockMovement.create({
        data: {
          type: 'ENTRY',
          quantity: qty,
          variation: qty,
          description: `Rollback update pedido #${existingOrder.orderNumber}`,
          productId: product.id,
          branchId: branch.id,
        },
      });
    }

    // update order
    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        deliveryType,
        channel: updateOrderDto.serviceType === "TAKEAWAY" ? OrderChannel.ONLINE : OrderChannel.PDV,
        serviceType: updateOrderDto.serviceType || ServiceType.TAKEAWAY,
        customerType: updateOrderDto.customerId ? CustomerType.REGISTERED : CustomerType.GUEST,


        customerId: customer?.id ?? null,
        customerAddressId: addressId,
         items: {
          create: itemsData.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            notes: item.notes,
            complements: item.complements?.length
              ? {
                  create: item.complements.map((comp) => ({
                    complementId: comp.complementId,
                    options: {
                      create: comp.options.map((opt) => ({
                        optionId: opt.optionId,
                        quantity: opt.quantity || 1,
                      })),
                    },
                  })),
                }
              : undefined,
          })),
        },
        couponId: appliedCouponId,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        total,
        estimatedTime,
      },
    });

    // recriar itens
    

    // recriar pagamentos
    for (const payment of payments) {
      await tx.orderPayment.create({
        data: {
          orderId,
          type: payment.type,
          amount: payment.amount,
          paymentMethodId: payment.paymentMethodId,

          amountGiven:
            payment.type === PaymentTypeDto.CASH
              ? payment.amountGiven ?? payment.amount
              : null,

          change:
            payment.type === PaymentTypeDto.CASH &&
            payment.amountGiven &&
            payment.amountGiven > payment.amount
              ? payment.amountGiven - payment.amount
              : 0,

          status: 'PENDING',
        },
      });
    }

    return order;
  });

  // =====================================================
  // 11. FULL ORDER RESPONSE
  // =====================================================
  const fullOrder = await prisma.order.findUnique({
    where: { id: updatedOrder.id },
    include: {
      customer: true,
      items: { include: { product: true, complements: {
              include: {
                complement: true,
                options: { include: { option: true } },
              },
            }, } },
      payments: true,
      coupon: true,
    },
  });

  // =====================================================
  // 12. WEBSOCKET
  // =====================================================
  this.webSocketGateway.emitOrderUpdate(
    {
      id: fullOrder!.id,
      branchId: fullOrder!.branchId,
      status: fullOrder!.status,
      fromPDV: fullOrder!.serviceType === ServiceType.TAKEAWAY ? true : false,
    },
    'order:updated',
  );

  // =====================================================
  // 13. RETURN
  // =====================================================
  return {
    success: true,
    order: fullOrder,
  };
}

  /**
   * Buscar produtos relacionados (cross-sell) para múltiplos produtos do carrinho
   * Retorna os produtos relacionados agrupados por produto principal
   */
  async getCrossSellProducts(productIds: string[], branchId: string) {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    // Buscar todos os produtos relacionados para os IDs fornecidos
    const relatedProducts = await prisma.productRelated.findMany({
      where: {
        productId: { in: productIds },
        // Garantir que o produto relacionado está ativo e na mesma filial
        relatedProduct: {
          active: true,
          branchId: branchId,
        },
      },
      include: {
        relatedProduct: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            active: true,
            description: true,
          },
        },
      },
      orderBy: { priority: 'asc' },
    });

    // Agrupar por productId para facilitar o uso no frontend
    const grouped = productIds.map((productId) => ({
      productId,
      crossSellProducts: relatedProducts
        .filter((rel) => rel.productId === productId)
        .map((rel) => rel.relatedProduct),
    }));

    return grouped;
  }
}
