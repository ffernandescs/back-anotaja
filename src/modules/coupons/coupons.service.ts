import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, CreateCouponDto, DayOfWeek, DeliveryType } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class CouponsService {
  async create(createCouponDto: CreateCouponDto) {
    const {
      code,
      name,
      type,
      value,
      minValue,
      maxDiscount,
      maxUses,
      validFrom,
      validUntil,
      availableDays,
      deliveryTypes,
      minimumOrderValue,
      onlyNewCustomers,
      allowMultipleUsesPerCustomer,
      branchId,
      paymentMethodIds,
      categoryIds,
      productIds,
      branchIds,
      active,
    } = createCouponDto;

    // Validar se já existe cupom com o mesmo código
    const existingCoupon = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        branchId: branchId || null,
      },
    });

    if (existingCoupon) {
      throw new BadRequestException('Já existe um cupom com este código');
    }

    // Validar percentual
    if (type === CouponType.PERCENTAGE && value > 100) {
      throw new BadRequestException('Percentual não pode ser maior que 100%');
    }

    // Validar datas se fornecidas
    if (validFrom && validUntil) {
      const validFromDate = new Date(validFrom);
      const validUntilDate = new Date(validUntil);

      if (validFromDate >= validUntilDate) {
        throw new BadRequestException(
          'Data de início deve ser anterior à data de término',
        );
      }
    }

    // Validar que pelo menos um período foi definido (datas ou dias da semana)
    if (!validFrom && !validUntil && (!availableDays || availableDays.length === 0)) {
      throw new BadRequestException(
        'Defina um período de validade (datas ou dias da semana)',
      );
    }

    // Validar métodos de pagamento informados (ids de BranchPaymentMethod)
    if (paymentMethodIds && paymentMethodIds.length > 0) {
      const count = await prisma.branchPaymentMethod.count({
        where: {
          id: {
            in: paymentMethodIds,
          },
        },
      });

      if (count !== paymentMethodIds.length) {
        throw new BadRequestException('Alguma forma de pagamento informada é inválida');
      }
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        name,
        type,
        value,
        minValue: minValue || null,
        maxDiscount: maxDiscount || null,
        maxUses: maxUses || null,
        usedCount: 0,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        availableDays: availableDays && availableDays.length > 0 ? JSON.stringify(availableDays) : null,
        deliveryTypes: deliveryTypes && deliveryTypes.length > 0 ? JSON.stringify(deliveryTypes) : null,
        minimumOrderValue: minimumOrderValue || null,
        onlyNewCustomers: onlyNewCustomers || false,
        allowMultipleUsesPerCustomer: allowMultipleUsesPerCustomer || false,
        branchId: branchId || null,
        active: active !== undefined ? active : true,
        paymentMethods: paymentMethodIds && paymentMethodIds.length > 0 ? {
          create: paymentMethodIds.map(id => ({ paymentMethodId: id })),
        } : undefined,
        categories: categoryIds && categoryIds.length > 0 ? {
          create: categoryIds.map(id => ({ categoryId: id })),
        } : undefined,
        products: productIds && productIds.length > 0 ? {
          create: productIds.map(id => ({ productId: id })),
        } : undefined,
        branches: branchIds && branchIds.length > 0 ? {
          create: branchIds.map(id => ({ branchId: id })),
        } : undefined,
      },
      include: {
        branch: true,
        paymentMethods: {
          include: {
            paymentMethod: {
              include: {
                paymentMethod: true,
              },
            },
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        products: {
          include: {
            product: true,
          },
        },
        branches: {
          include: {
            branch: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    return { coupon };
  }

  async findAll(branchId?: string, active?: boolean) {
    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (active !== undefined) {
      where.active = active;
    }

    const coupons = await prisma.coupon.findMany({
      where,
      include: {
        branch: true,
        paymentMethods: {
          include: {
            paymentMethod: {
              include: {
                paymentMethod: true,
              },
            },
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        products: {
          include: {
            product: true,
          },
        },
        branches: {
          include: {
            branch: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { coupons };
  }

  async findOne(id: string) {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        branch: true,
        paymentMethods: {
          include: {
            paymentMethod: {
              include: {
                paymentMethod: true,
              },
            },
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        products: {
          include: {
            product: true,
          },
        },
        branches: {
          include: {
            branch: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    return { coupon };
  }

  async update(id: string, updateCouponDto: UpdateCouponDto) {
    const existingCoupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!existingCoupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    const {
      code,
      name,
      type,
      value,
      minValue,
      maxDiscount,
      maxUses,
      validFrom,
      validUntil,
      availableDays,
      deliveryTypes,
      minimumOrderValue,
      onlyNewCustomers,
      allowMultipleUsesPerCustomer,
      branchId,
      paymentMethodIds,
      categoryIds,
      productIds,
      branchIds,
      active,
    } = updateCouponDto;

    // Validar código duplicado (se estiver mudando)
    if (code && code.toUpperCase() !== existingCoupon.code) {
      const duplicateCoupon = await prisma.coupon.findFirst({
        where: {
          code: code.toUpperCase(),
          branchId: branchId !== undefined ? branchId : existingCoupon.branchId,
          id: { not: id },
        },
      });

      if (duplicateCoupon) {
        throw new BadRequestException('Já existe um cupom com este código');
      }
    }

    // Validar percentual
    if (type === CouponType.PERCENTAGE && value && value > 100) {
      throw new BadRequestException('Percentual não pode ser maior que 100%');
    }

    // Validar datas
    if (validFrom && validUntil) {
      const validFromDate = new Date(validFrom);
      const validUntilDate = new Date(validUntil);

      if (validFromDate >= validUntilDate) {
        throw new BadRequestException(
          'Data de início deve ser anterior à data de término',
        );
      }
    }

    const updateData: any = {};

    if (code !== undefined) updateData.code = code.toUpperCase();
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (value !== undefined) updateData.value = value;
    if (minValue !== undefined) updateData.minValue = minValue;
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount;
    if (maxUses !== undefined) updateData.maxUses = maxUses;
    if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
    if (availableDays !== undefined) updateData.availableDays = availableDays && availableDays.length > 0 ? JSON.stringify(availableDays) : null;
    if (deliveryTypes !== undefined) updateData.deliveryTypes = deliveryTypes && deliveryTypes.length > 0 ? JSON.stringify(deliveryTypes) : null;
    if (minimumOrderValue !== undefined) updateData.minimumOrderValue = minimumOrderValue;
    if (onlyNewCustomers !== undefined) updateData.onlyNewCustomers = onlyNewCustomers;
    if (allowMultipleUsesPerCustomer !== undefined) updateData.allowMultipleUsesPerCustomer = allowMultipleUsesPerCustomer;
    if (branchId !== undefined) updateData.branchId = branchId;
    if (active !== undefined) updateData.active = active;

    // Atualizar relações se fornecidas
    if (paymentMethodIds !== undefined) {
      await prisma.couponPaymentMethod.deleteMany({
        where: { couponId: id },
      });
      if (paymentMethodIds && paymentMethodIds.length > 0) {
        await prisma.couponPaymentMethod.createMany({
          data: paymentMethodIds.map(pmId => ({ couponId: id, paymentMethodId: pmId })),
        });
      }
    }

    if (categoryIds !== undefined) {
      await prisma.couponCategory.deleteMany({
        where: { couponId: id },
      });
      if (categoryIds && categoryIds.length > 0) {
        await prisma.couponCategory.createMany({
          data: categoryIds.map(catId => ({ couponId: id, categoryId: catId })),
        });
      }
    }

    if (productIds !== undefined) {
      await prisma.couponProduct.deleteMany({
        where: { couponId: id },
      });
      if (productIds && productIds.length > 0) {
        await prisma.couponProduct.createMany({
          data: productIds.map(prodId => ({ couponId: id, productId: prodId })),
        });
      }
    }

    if (branchIds !== undefined) {
      await prisma.couponBranch.deleteMany({
        where: { couponId: id },
      });
      if (branchIds && branchIds.length > 0) {
        await prisma.couponBranch.createMany({
          data: branchIds.map(brId => ({ couponId: id, branchId: brId })),
        });
      }
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: updateData,
      include: {
        branch: true,
        paymentMethods: {
          include: {
            paymentMethod: {
              include: {
                paymentMethod: true,
              },
            },
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        products: {
          include: {
            product: true,
          },
        },
        branches: {
          include: {
            branch: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    return { coupon };
  }

  async remove(id: string) {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    // Verificar se o cupom foi usado em pedidos
    if (coupon._count.orders > 0) {
      throw new BadRequestException(
        `Este cupom não pode ser excluído pois foi usado em ${coupon._count.orders} pedido(s)`,
      );
    }

    await prisma.coupon.delete({
      where: { id },
    });

    return { message: 'Cupom excluído com sucesso' };
  }

  async validateCouponForStore(data: {
    code: string;
    branchId: string;
    customerId?: string;
    deliveryType?: string;
    paymentMethodId?: string;
    productIds?: string[];
    subtotal: number;
  }) {
    const { code, branchId, customerId, deliveryType, paymentMethodId, productIds, subtotal } = data;

    // Buscar cupom
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        active: true,
      },
      include: {
        paymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        products: {
          include: {
            product: true,
          },
        },
        branches: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!coupon) {
      throw new BadRequestException('Cupom não encontrado ou inativo');
    }

    // Validar filiais
    if (coupon.branches && coupon.branches.length > 0) {
      const validBranch = coupon.branches.some(cb => cb.branchId === branchId);
      if (!validBranch) {
        throw new BadRequestException('Cupom não válido para esta filial');
      }
    }

    // Validar período de datas
    if (coupon.validFrom && coupon.validUntil) {
      const now = new Date();
      const validFrom = new Date(coupon.validFrom);
      const validUntil = new Date(coupon.validUntil);

      if (now < validFrom || now > validUntil) {
        throw new BadRequestException('Cupom fora do período de validade');
      }
    }

    // Validar dias da semana
    if (coupon.availableDays) {
      const availableDays = JSON.parse(coupon.availableDays);
      const today = new Date().getDay();
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayName = dayNames[today];

      if (!availableDays.includes(todayName)) {
        throw new BadRequestException('Cupom não disponível neste dia da semana');
      }
    }

    // Validar tipo de pedido
    if (coupon.deliveryTypes && deliveryType) {
      const deliveryTypes = JSON.parse(coupon.deliveryTypes);
      if (!deliveryTypes.includes(deliveryType)) {
        throw new BadRequestException('Cupom não válido para este tipo de pedido');
      }
    }

    // Validar valor mínimo do pedido
    if (coupon.minimumOrderValue && subtotal < coupon.minimumOrderValue) {
      const minValue = (coupon.minimumOrderValue / 100).toFixed(2);
      throw new BadRequestException(`Valor mínimo do pedido: R$ ${minValue}`);
    }

    // Validar apenas novos clientes
    if (coupon.onlyNewCustomers && customerId) {
      const customerOrders = await prisma.order.count({
        where: {
          customerId,
          status: { notIn: ['CANCELLED'] },
        },
      });

      if (customerOrders > 0) {
        throw new BadRequestException('Cupom válido apenas para novos clientes');
      }
    }

    // Validar múltiplos usos por cliente
    if (!coupon.allowMultipleUsesPerCustomer && customerId) {
      const customerUsedCoupon = await prisma.order.count({
        where: {
          customerId,
          couponId: coupon.id,
          status: { notIn: ['CANCELLED'] },
        },
      });

      if (customerUsedCoupon > 0) {
        throw new BadRequestException('Você já utilizou este cupom');
      }
    }

    // Validar forma de pagamento
    if (coupon.paymentMethods && coupon.paymentMethods.length > 0 && paymentMethodId) {
      const validPayment = coupon.paymentMethods.some(
        pm => pm.paymentMethodId === paymentMethodId
      );
      if (!validPayment) {
        throw new BadRequestException('Cupom não válido para esta forma de pagamento');
      }
    }

    // Validar categorias de produtos
    if (coupon.categories && coupon.categories.length > 0 && productIds && productIds.length > 0) {
      const categoryIds = coupon.categories.map(c => c.categoryId);
      const validProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          categoryId: { in: categoryIds },
        },
      });

      if (validProducts.length === 0) {
        throw new BadRequestException('Cupom não válido para os produtos do carrinho');
      }
    }

    // Validar produtos específicos
    if (coupon.products && coupon.products.length > 0 && productIds && productIds.length > 0) {
      const validProductIds = coupon.products.map(p => p.productId);
      const hasValidProduct = productIds.some(id => validProductIds.includes(id));

      if (!hasValidProduct) {
        throw new BadRequestException('Cupom não válido para os produtos do carrinho');
      }
    }

    // Validar máximo de usos
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Cupom esgotado');
    }

    // Calcular desconto
    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (subtotal * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else if (coupon.type === 'FIXED') {
      discount = coupon.value;
    } else if (coupon.type === 'FREE_DELIVERY') {
      discount = 0; // Será tratado no cálculo do frete
    }

    // Garantir que desconto não seja maior que subtotal
    discount = Math.min(discount, subtotal);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        value: coupon.value,
        discount,
      },
    };
  }
}
