import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import {
  BranchAssignPaymentDto,
  CreatePaymentMethodDto,
} from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  // 🔹 Master cria método de pagamento
  async create(dto: CreatePaymentMethodDto, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
 
    return prisma.paymentMethod.create({
      data: {
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll() {
    return prisma.paymentMethod.findMany({ where: { isActive: true } });
  }

  async findOne(id: string) {
    const pm = await prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) throw new NotFoundException('Método de pagamento não encontrado');
    return pm;
  }

  async update(id: string, dto: UpdatePaymentMethodDto, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    
    await this.findOne(id);

    return prisma.paymentMethod.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    await this.findOne(id);

    return prisma.paymentMethod.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // 🔹 Branch associa métodos a si mesma
  async assignToBranch(userId: string, payments: BranchAssignPaymentDto[]) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const branchId = user.branchId;
    if (!branchId) throw new NotFoundException('Branch não encontrada');
    for (const p of payments) {
      await prisma.branchPaymentMethod.upsert({
        where: {
          branchId_paymentMethodId: {
            branchId,
            paymentMethodId: p.paymentMethodId,
          },
        },
        update: {
          forDineIn: p.forDineIn ?? false,
          forDelivery: p.forDelivery ?? false,
        },
        create: {
          branchId,
          paymentMethodId: p.paymentMethodId,
          forDineIn: p.forDineIn ?? false,
          forDelivery: p.forDelivery ?? false,
        },
      });
    }

    if (!user.companyId) throw new NotFoundException('Empresa não encontrada');

    await prisma.company.update({
      where: { id: user.companyId },
      data: { onboardingStep: 'COMPLETED', onboardingCompleted: true },
    });
    return prisma.branchPaymentMethod.findMany({
      where: { branchId },
      include: { paymentMethod: true },
    });
  }

  async getBranchPayments(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const branchId = user.branchId;
    if (!branchId) throw new NotFoundException('Branch não encontrada');
    return prisma.branchPaymentMethod.findMany({
      where: { branchId },
      include: { paymentMethod: true },
    });
  }
}
