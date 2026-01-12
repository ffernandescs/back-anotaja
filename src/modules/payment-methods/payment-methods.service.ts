import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class PaymentMethodsService {
  async findAll(
    userId: string,
    filters: {
      forDineIn?: string;
      forDelivery?: string;
      isActive?: string;
    },
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const where: {
      branchId: string;
      forDineIn?: boolean;
      forDelivery?: boolean;
      isActive?: boolean;
    } = {
      branchId: user.branchId,
    };

    if (filters.forDineIn !== undefined) {
      where.forDineIn = filters.forDineIn === 'true';
    }

    if (filters.forDelivery !== undefined) {
      where.forDelivery = filters.forDelivery === 'true';
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return paymentMethods;
  }

  async create(dto: CreatePaymentMethodDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId) {
      throw new NotFoundException('Usuário não está associado a uma filial');
    }

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        ...dto,
        branchId: user.branchId,
        isActive: dto.isActive ?? true,
      },
    });

    return paymentMethod;
  }
}
