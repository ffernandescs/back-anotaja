import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Company, Prisma, StockMovement } from 'generated/prisma';
import { prisma } from '../../../lib/prisma';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { CalculateDeliveryFeeDto } from './dto/calculate-delivery-fee.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
import { StoreHomepageDto } from './dto/store-homepage.dto';
import { StoreLoginDto } from './dto/store-login.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import {
  BranchWithRelations,
  CepResult,
  GeoData,
  LatLng,
  OrderForStock,
} from './types';
import {
  DeliveryTypeDto,
  OrderStatusDto,
} from '../orders/dto/create-order-item.dto';
import { SubscriptionStatusDto } from '../subscription/dto/create-subscription.dto';
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
    const branch = await prisma.branch.findUnique({
      where: { id: branchId || subdomain },
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

    // agora branch: BranchWithRelations
    return branch as BranchWithRelations;
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
    // Buscar categorias ativas com produtos
    const categories = await prisma.category.findMany({
      where: {
        branchId: branch.id,
        active: true,
      },
      include: {
        products: {
          where: {
            active: true,
          },
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
        name: branch.name,
        address: address,
        phone: branch.phone,
        email: branch.email,
        subdomain: branch.subdomain || '',
        logoUrl: branch.logoUrl,
        bannerUrl: branch.bannerUrl,
        primaryColor: branch.primaryColor,
        openingHours: branch.openingHours || null,
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
        productsCount: branch._count.products,
        categoriesCount: branch._count.categories,
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        featured: category.featured,
        _count: {
          products: category._count?.products || 0,
        },
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
    const branch = await this.getBranch(subdomain, branchId);
    const company = branch.company as Company;

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
        name: branch.name,
        companyAddresses: address,
        phone: branch.phone,
        email: branch.email,
        subdomain: branch.subdomain,
        logoUrl: branch.logoUrl,
        bannerUrl: branch.bannerUrl,
        primaryColor: branch.primaryColor,
        openingHours: branch.openingHours || null,
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
        productsCount: branch._count.products,
        categoriesCount: branch._count.categories,
      },
    };
  }

  /**
   * Obter categorias da loja
   */
  async getCategories(subdomain?: string, branchId?: string) {
    const branch = await this.getBranch(subdomain, branchId);

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
  async createOrder(
    createOrderDto: CreateStoreOrderDto,
    subdomain?: string,
    branchId?: string,
  ) {
    // Obter branch
    const branch = await this.getBranch(subdomain, branchId);

    if (!branch.company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Validar assinatura
    const { limits, features } = await this.validateSubscription(
      branch.company.id,
    );

    // Validar limite de pedidos mensais
    await this.validateOrderLimit(branch.company.id, limits);

    // Validar feature de delivery
    if (
      createOrderDto.deliveryType === DeliveryTypeDto.DELIVERY &&
      !features.delivery
    ) {
      throw new ForbiddenException(
        'Plano não inclui recurso de entregas. Faça upgrade do seu plano.',
      );
    }

    // Validar feature de cupons
    if (createOrderDto.couponCode && !features.coupons) {
      throw new ForbiddenException(
        'Plano não inclui recurso de cupons. Faça upgrade do seu plano.',
      );
    }

    // Validar telefone para DELIVERY e PICKUP
    if (
      createOrderDto.deliveryType !== DeliveryTypeDto.DINE_IN &&
      (!createOrderDto.customerPhone ||
        createOrderDto.customerPhone.length < 10)
    ) {
      throw new BadRequestException(
        'Telefone do cliente é obrigatório e deve ter pelo menos 10 caracteres',
      );
    }

    // Validar endereço para DELIVERY
    if (createOrderDto.deliveryType === DeliveryTypeDto.DELIVERY) {
      if (
        !createOrderDto.address ||
        createOrderDto.address.length < 5 ||
        !createOrderDto.city ||
        !createOrderDto.state ||
        !createOrderDto.zipCode ||
        createOrderDto.zipCode.length < 8
      ) {
        throw new BadRequestException(
          'Endereço completo é obrigatório para entrega',
        );
      }
    }

    // Validar forma de pagamento
    if (
      !createOrderDto.paymentMethod &&
      (!createOrderDto.payments || createOrderDto.payments.length === 0)
    ) {
      throw new BadRequestException(
        'Selecione pelo menos uma forma de pagamento',
      );
    }

    // Buscar cupom se fornecido
    let couponId: string | undefined;
    if (createOrderDto.couponCode) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          code: createOrderDto.couponCode.toUpperCase().trim(),
          branchId: branch.id,
          active: true,
        },
      });
      if (coupon) {
        couponId = coupon.id;
      }
    }

    // Gerar número sequencial global do pedido
    const lastOrder = await prisma.order.findFirst({
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const nextOrderNumber = lastOrder?.orderNumber
      ? lastOrder.orderNumber + 1
      : 1;

    // Validar produtos, complementos e opções
    const productQuantities = new Map<string, number>();
    const optionQuantities = new Map<string, number>();
    const ingredientQuantities = new Map<string, number>();

    for (const item of createOrderDto.items) {
      // Verificar se o produto existe
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          ingredients: true,
        },
      });

      if (!product) {
        throw new NotFoundException(
          `Produto não encontrado: ${item.productId}`,
        );
      }

      if (product.branchId !== branch.id) {
        throw new BadRequestException(
          `Produto não pertence a esta filial: ${item.productId}`,
        );
      }

      // Acumular quantidade do produto
      productQuantities.set(
        item.productId,
        (productQuantities.get(item.productId) || 0) + item.quantity,
      );

      // Acumular insumos da ficha técnica
      if (product.ingredients && product.ingredients.length > 0) {
        for (const ingredient of product.ingredients) {
          const totalQuantity = item.quantity * ingredient.quantity;
          ingredientQuantities.set(
            ingredient.ingredientId,
            (ingredientQuantities.get(ingredient.ingredientId) || 0) +
              totalQuantity,
          );
        }
      }

      // Validar complementos e opções
      if (item.complements && item.complements.length > 0) {
        for (const complement of item.complements) {
          const complementExists = await prisma.productComplement.findUnique({
            where: { id: complement.complementId },
          });
          if (!complementExists) {
            throw new NotFoundException(
              `Complemento não encontrado: ${complement.complementId}`,
            );
          }

          if (complement.options && complement.options.length > 0) {
            for (const option of complement.options) {
              const optionExists = await prisma.complementOption.findUnique({
                where: { id: option.optionId },
              });
              if (!optionExists) {
                throw new NotFoundException(
                  `Opção não encontrada: ${option.optionId}`,
                );
              }

              optionQuantities.set(
                option.optionId,
                (optionQuantities.get(option.optionId) || 0) + item.quantity,
              );
            }
          }
        }
      }
    }

    // Determinar paymentMethod (usar o primeiro pagamento com valor > 0 se houver múltiplos)
    const finalPaymentMethod =
      createOrderDto.payments && createOrderDto.payments.length > 0
        ? createOrderDto.payments.find((p) => p.amount > 0)?.type ||
          createOrderDto.payments[0].type
        : createOrderDto.paymentMethod;

    // Criar pedido com status PENDING e paymentStatus PENDING
    const order = await prisma.order.create({
      data: {
        branchId: branch.id,
        couponId,
        orderNumber: nextOrderNumber,
        customerId: createOrderDto.customerId || null,
        deliveryType: createOrderDto.deliveryType,

        tableNumber: createOrderDto.tableNumber || null,
        tableId: createOrderDto.tableId || null,
        notes: createOrderDto.notes || null,
        subtotal: createOrderDto.subtotal,
        deliveryFee: createOrderDto.deliveryFee,
        serviceFee: createOrderDto.serviceFee || 0,
        discount: createOrderDto.discount,
        total: createOrderDto.total,
        status: OrderStatusDto.PENDING,
        paymentStatus: 'PENDING',
        paidAmount: 0,

        payments:
          createOrderDto.payments && createOrderDto.payments.length > 0
            ? {
                create: createOrderDto.payments
                  .filter((payment) => payment.amount > 0) // Filtrar apenas pagamentos com valor > 0
                  .map((payment) => ({
                    type: payment.type,
                    paymentMethodId: payment.paymentMethodId,
                    amount: payment.amount,
                    change:
                      payment.type === 'CASH' && createOrderDto.change
                        ? createOrderDto.change
                        : 0,
                  })),
              }
            : undefined,
        items: {
          create: createOrderDto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            notes: item.notes || null,
            preparationStatus: 'PENDING',
            dispatchStatus: 'PENDING',
            additions:
              item.additions && item.additions.length > 0
                ? {
                    create: item.additions.map((add) => ({
                      additionId: add.additionId,
                    })),
                  }
                : undefined,
            complements:
              item.complements && item.complements.length > 0
                ? {
                    create: item.complements
                      .filter(
                        (complement) =>
                          complement.options && complement.options.length > 0,
                      )
                      .map((complement) => {
                        // Agrupar opções repetidas e contar quantidade
                        const optionsMap = new Map<string, number>();
                        complement.options.forEach((option) => {
                          const currentQuantity =
                            optionsMap.get(option.optionId) || 0;
                          optionsMap.set(option.optionId, currentQuantity + 1);
                        });

                        const optionsWithQuantity = Array.from(
                          optionsMap.entries(),
                        ).map(([optionId, quantity]) => ({
                          optionId,
                          quantity,
                        }));

                        return {
                          complementId: complement.complementId,
                          options: {
                            create: optionsWithQuantity,
                          },
                        };
                      }),
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
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
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
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // Registrar movimentações de estoque (em background, não bloquear criação do pedido)
    this.registerStockMovements(
      branch.id,
      {
        id: order.id,
        orderNumber: order.orderNumber ?? undefined, // transforma null em undefined
      },
      productQuantities,
      optionQuantities,
      ingredientQuantities,
    ).catch((error) => {
      console.error('Erro ao registrar movimentações de estoque:', error);
      // Não falhar criação do pedido se houver erro de estoque
    });

    // Incrementar contador de uso do cupom
    if (couponId) {
      prisma.coupon
        .update({
          where: { id: couponId },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        })
        .catch((error) => {
          console.error('Erro ao incrementar contador de uso do cupom:', error);
        });
    }

    // Buscar pedido completo para emitir no WebSocket
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
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
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // Emitir evento WebSocket com pedido completo
    if (fullOrder) {
      this.webSocketGateway.emitOrderUpdate(
        {
          id: fullOrder.id,
          status: fullOrder.status,
          branchId: fullOrder.branchId,
          deliveryPersonId: fullOrder.deliveryPersonId,
          tableId: fullOrder.tableId,
          total: fullOrder.total,
          deliveryType: fullOrder.deliveryType,
          createdAt: fullOrder.createdAt,
          orderNumber: fullOrder.orderNumber,
          items: fullOrder.items,
          branch: fullOrder.branch,
          payments: fullOrder.payments,
        },
        'order:created',
      );
    }

    return { order };
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
    subdomain?: string,
    branchId?: string,
    customerPhone?: string,
  ) {
    const branch = await this.getBranch(subdomain, branchId);

    // Tipando corretamente o filtro
    const where: Prisma.OrderWhereInput = {
      branchId: branch.id,
    };

    if (customerPhone) {
      // Filtra usando a relação com customer
      where.customer = {
        phone: customerPhone,
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: true, // incluir dados do cliente se quiser
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

    return { orders };
  }

  /**
   * Buscar pedido específico da loja (público)
   */
  async getOrderById(orderId: string, subdomain?: string, branchId?: string) {
    const branch = await this.getBranch(subdomain, branchId);

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

    const address = await prisma.customerAddress.create({
      data: {
        ...createAddressDto,
        branchId: createAddressDto.branchId,
        customerId,
      },
    });

    return { address };
  }

  /**
   * Atualizar endereço do cliente
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

    const address = await prisma.customerAddress.update({
      where: { id: addressId },
      data: updateAddressDto,
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
  async calculateDeliveryFee(
    calculateFeeDto: CalculateDeliveryFeeDto,
    subdomain?: string,
    branchId?: string,
  ) {
    const branch = await this.getBranch(subdomain, branchId);

    const {
      zipCode,
      address,
      city,
      state,
      lat: providedLat,
      lng: providedLng,
      subtotal = 0,
    } = calculateFeeDto;

    let finalLat: number | undefined = providedLat;
    let finalLng: number | undefined = providedLng;

    // Geocodificação se coordenadas não forem fornecidas
    if (!finalLat || !finalLng) {
      if (address && city && state) {
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts && (!finalLat || !finalLng)) {
          try {
            const fullAddress =
              `${address}, ${city}, ${state}, ${zipCode ?? ''}, Brasil`
                .replace(/\s+/g, ' ')
                .trim();

            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
              { headers: { 'User-Agent': 'AnotaJa/1.0' } },
            );

            if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);

            // Parse como unknown
            const rawData: unknown = await res.json();

            // Função type guard para validar que é GeoData[]
            function isGeoDataArray(value: unknown): value is GeoData[] {
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

            // Valida antes de usar
            if (!isGeoDataArray(rawData))
              throw new Error('Invalid geocoding response');

            const data = rawData; // agora TypeScript sabe que é GeoData[]

            if (data.length > 0) {
              finalLat = parseFloat(data[0].lat);
              finalLng = parseFloat(data[0].lon);
            }
          } catch (err) {
            console.error(`Geocoding attempt ${attempts + 1} failed:`, err);
            attempts++;
            if (attempts < maxAttempts)
              await new Promise((r) => setTimeout(r, 1000));
          }
        }

        // Se não conseguiu pelo endereço, tentar apenas CEP
        if (!finalLat || (!finalLng && zipCode && zipCode.length >= 8)) {
          try {
            if (zipCode && zipCode.length >= 8) {
              const cepOnly = zipCode.replace(/\D/g, ''); // seguro porque zipCode já foi checado
              const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cepOnly}&country=Brasil&limit=1`,
                { headers: { 'User-Agent': 'AnotaJa/1.0' } },
              );

              if (res.ok) {
                const data: Array<{ lat: string; lon: string }> =
                  (await res.json()) as Array<{ lat: string; lon: string }>;

                if (data.length > 0) {
                  finalLat = parseFloat(data[0].lat);
                  finalLng = parseFloat(data[0].lon);
                }
              }
            }
          } catch (err) {
            console.error('CEP geocoding error:', err);
          }
        }
      }
    }

    // Buscar áreas, rotas e áreas de exclusão
    const [deliveryAreas, deliveryRoutes, exclusionAreas] = await Promise.all([
      prisma.deliveryArea.findMany({
        where: { branchId: branch.id, active: true },
        orderBy: { level: 'desc' },
      }),
      prisma.deliveryRoute.findMany({
        where: { branchId: branch.id, active: true },
        orderBy: { level: 'desc' },
      }),
      prisma.deliveryExclusionArea.findMany({
        where: { branchId: branch.id, active: true },
      }),
    ]);

    if (deliveryAreas.length === 0 && deliveryRoutes.length === 0) {
      return {
        deliveryFee: 0,
        available: false,
        message: 'Endereço fora da área de entrega',
      };
    }

    // Funções auxiliares
    const calculateDistance = (
      lat1: number,
      lng1: number,
      lat2: number,
      lng2: number,
    ): number => {
      const R = 6371e3;
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lng2 - lng1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    const isPointInPolygon = (
      point: { lat: number; lng: number },
      polygon: Array<{ lat: number; lng: number }>,
    ): boolean => {
      if (polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng;
        const yi = polygon[i].lat;
        const xj = polygon[j].lng;
        const yj = polygon[j].lat;

        const intersect =
          yi > point.lat !== yj > point.lat &&
          point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
      }
      return inside;
    };

    const calculateDistanceToSegment = (
      point: { lat: number; lng: number },
      start: { lat: number; lng: number },
      end: { lat: number; lng: number },
    ): number => {
      const A = point.lat - start.lat;
      const B = point.lng - start.lng;
      const C = end.lat - start.lat;
      const D = end.lng - start.lng;
      const dot = A * C + B * D;
      const lenSq = C ** 2 + D ** 2;
      const param = lenSq !== 0 ? dot / lenSq : -1;
      const xx =
        param < 0 ? start.lat : param > 1 ? end.lat : start.lat + param * C;
      const yy =
        param < 0 ? start.lng : param > 1 ? end.lng : start.lng + param * D;
      return calculateDistance(point.lat, point.lng, xx, yy);
    };

    const isPointNearRoute = (
      point: { lat: number; lng: number },
      route: Array<{ lat: number; lng: number }>,
      maxDistance = 100,
    ): boolean => {
      if (route.length < 2) return false;
      return route
        .slice(0, -1)
        .some(
          (p, i) =>
            calculateDistanceToSegment(point, p, route[i + 1]) <= maxDistance,
        );
    };

    // Verificar áreas de exclusão
    if (finalLat && finalLng) {
      for (const exclusion of exclusionAreas) {
        if (
          exclusion.type === 'CIRCLE' &&
          exclusion.centerLat !== null &&
          exclusion.centerLng !== null &&
          exclusion.radius !== null
        ) {
          if (
            calculateDistance(
              finalLat,
              finalLng,
              exclusion.centerLat,
              exclusion.centerLng,
            ) <= exclusion.radius
          ) {
            return {
              deliveryFee: 0,
              available: false,
              message: 'Entrega não disponível nesta área',
            };
          }
        } else if (exclusion.type === 'POLYGON' && exclusion.polygon) {
          try {
            // Verifica se é um array
            // Garantir que parsed seja um array de objetos desconhecidos
            const fullAddress =
              `${address}, ${city}, ${state}, ${zipCode ?? ''}, Brasil`
                .replace(/\s+/g, ' ')
                .trim();

            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
              { headers: { 'User-Agent': 'AnotaJa/1.0' } },
            );

            if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);

            // res.json() retorna unknown
            const rawData: unknown = await res.json();

            // Type guard para validar JSON
            function isGeoDataArray(value: unknown): value is GeoData[] {
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

            // valida a resposta
            if (!isGeoDataArray(rawData))
              throw new Error('Invalid geocoding response');

            const data = rawData; // agora TypeScript sabe que é GeoData[] seguro

            if (data.length > 0) {
              // TypeScript agora sabe que lat e lon são strings
              finalLat = parseFloat(data[0].lat);
              finalLng = parseFloat(data[0].lon);
            }
          } catch (err) {
            console.error('Error parsing exclusion polygon:', err);
          }
        }
      }
    }

    // Encontrar rota ou área correspondente
    const matchedRoute =
      finalLat && finalLng
        ? deliveryRoutes.find((route) => {
            try {
              const coords = JSON.parse(route.coordinates) as Array<{
                lat: number;
                lng: number;
              }>;
              return isPointNearRoute(
                { lat: finalLat, lng: finalLng },
                coords,
                200,
              );
            } catch {
              return false;
            }
          })
        : null;

    const matchedArea =
      !matchedRoute && finalLat && finalLng
        ? deliveryAreas.find((area) => {
            if (
              area.type === 'CIRCLE' &&
              area.centerLat &&
              area.centerLng &&
              area.radius
            ) {
              return (
                calculateDistance(
                  finalLat,
                  finalLng,
                  area.centerLat,
                  area.centerLng,
                ) <= area.radius
              );
            } else if (area.type === 'POLYGON' && area.polygon) {
              try {
                // JSON.parse retorna unknown
                const rawPolygon: unknown = JSON.parse(area.polygon);

                // Valida se é um array de LatLng
                function isLatLngArray(value: unknown): value is LatLng[] {
                  return (
                    Array.isArray(value) &&
                    value.every(
                      (p) =>
                        p &&
                        typeof p === 'object' &&
                        'lat' in p &&
                        'lng' in p &&
                        typeof (p as Record<string, unknown>).lat ===
                          'number' &&
                        typeof (p as Record<string, unknown>).lng === 'number',
                    )
                  );
                }

                if (!isLatLngArray(rawPolygon)) return false;

                const polygon = rawPolygon; // agora seguro

                return isPointInPolygon(
                  { lat: finalLat, lng: finalLng },
                  polygon,
                );
              } catch {
                return false;
              }
            }
            return false;
          })
        : null;

    const matched = matchedRoute || matchedArea;
    if (!matched)
      return {
        deliveryFee: 0,
        available: false,
        message: 'Endereço fora da área de entrega',
      };

    if (matched.minOrderValue && subtotal < matched.minOrderValue) {
      return {
        deliveryFee: matched.deliveryFee,
        available: false,
        minOrderValue: matched.minOrderValue,
        message: `Pedido mínimo de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(matched.minOrderValue)}`,
      };
    }

    return {
      deliveryFee: matched.deliveryFee,
      available: true,
      estimatedTime: matched.estimatedTime,
      areaName: matched.name,
      type: matchedRoute ? 'route' : 'area',
    };
  }

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
      branchId: user.branchId || undefined,
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
}
