import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCouponDto: CreateCouponDto) {
    const { code, type, value, minValue, maxDiscount, maxUses, validFrom, validUntil, branchId, active } = createCouponDto;

    // Validar se já existe cupom com o mesmo código
    const existingCoupon = await this.prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        branchId: branchId || null,
      },
    });

    if (existingCoupon) {
      throw new BadRequestException('Já existe um cupom com este código');
    }

    // Validar percentual
    if (type === 'PERCENTAGE' && value > 100) {
      throw new BadRequestException('Percentual não pode ser maior que 100%');
    }

    // Validar datas
    const validFromDate = new Date(validFrom);
    const validUntilDate = new Date(validUntil);

    if (validFromDate >= validUntilDate) {
      throw new BadRequestException('Data de início deve ser anterior à data de término');
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value,
        minValue: minValue || null,
        maxDiscount: maxDiscount || null,
        maxUses: maxUses || null,
        usedCount: 0,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        branchId: branchId || null,
        active: active !== undefined ? active : true,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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

    const coupons = await this.prisma.coupon.findMany({
      where,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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
    const existingCoupon = await this.prisma.coupon.findUnique({
      where: { id },
    });

    if (!existingCoupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    const { code, type, value, minValue, maxDiscount, maxUses, validFrom, validUntil, branchId, active } = updateCouponDto;

    // Validar código duplicado (se estiver mudando)
    if (code && code.toUpperCase() !== existingCoupon.code) {
      const duplicateCoupon = await this.prisma.coupon.findFirst({
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
    if (type === 'PERCENTAGE' && value && value > 100) {
      throw new BadRequestException('Percentual não pode ser maior que 100%');
    }

    // Validar datas
    if (validFrom && validUntil) {
      const validFromDate = new Date(validFrom);
      const validUntilDate = new Date(validUntil);

      if (validFromDate >= validUntilDate) {
        throw new BadRequestException('Data de início deve ser anterior à data de término');
      }
    }

    const updateData: any = {};

    if (code !== undefined) updateData.code = code.toUpperCase();
    if (type !== undefined) updateData.type = type;
    if (value !== undefined) updateData.value = value;
    if (minValue !== undefined) updateData.minValue = minValue;
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount;
    if (maxUses !== undefined) updateData.maxUses = maxUses;
    if (validFrom !== undefined) updateData.validFrom = new Date(validFrom);
    if (validUntil !== undefined) updateData.validUntil = new Date(validUntil);
    if (branchId !== undefined) updateData.branchId = branchId;
    if (active !== undefined) updateData.active = active;

    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: updateData,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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
    const coupon = await this.prisma.coupon.findUnique({
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

    await this.prisma.coupon.delete({
      where: { id },
    });

    return { message: 'Cupom excluído com sucesso' };
  }
}
