import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { prisma } from '../../../lib/prisma';
import { CreateBillSplitDto } from './dto/create-billsplit.dto';
import { BillSplitStatus, BillSplitType } from './types';

@Injectable()
export class BillSplitsService {
  async create(dto: CreateBillSplitDto, userId: string) {
    // 1️⃣ Verifica usuário e filial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.branchId)
      throw new ForbiddenException('Usuário não está associado a uma filial');

    // 2️⃣ Verifica pedido
    const order = await prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.billSplitId) {
      await prisma.orderPayment.deleteMany({
        where: {
          orderId: order.id, // aqui deletamos tudo da order
        },
      });
      await prisma.billSplit.delete({
        where: { id: order.billSplitId },
      });
      await prisma.billSplitPerson.deleteMany({
        where: { billSplitId: order.billSplitId },
      });
      await prisma.billSplitItem.deleteMany({
        where: {
          billSplitPerson: { billSplitId: order.billSplitId },
        },
      });
    }
    // 3️⃣ Cria BillSplit
    const billSplit = await prisma.billSplit.create({
      data: {
        orderId: dto.orderId,
        tableId: order.tableId,
        splitType: dto.splitType,
        numberOfPeople: dto.numberOfPeople,
        branchId: user.branchId,
        userId: userId,
        status: BillSplitStatus.COMPLETED,
      },
    });

    await prisma.order.update({
      where: { id: dto.orderId },
      data: { billSplitId: billSplit.id },
    });

    const persons: Prisma.BillSplitPersonCreateManyInput[] = [];

    for (const payment of dto.payments || []) {
      const person = await this.createBillSplitPerson(billSplit.id, {
        name: payment.personName,
        orderId: dto.orderId,
        status: BillSplitStatus.COMPLETED,
        total: payment.amount || 0,
      });

      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: payment.paymentMethodId || '' },
      });
      if (!paymentMethod)
        throw new NotFoundException('Método de pagamento não encontrado');

      await prisma.orderPayment.create({
        data: {
          orderId: dto.orderId,
          billSplitPersonId: person.id,
          amount: payment.amount || 0,
          paymentMethodId: payment.paymentMethodId || '',
          change: payment.change || 0,
          status: 'PAID',
          type: paymentMethod.name,
        },
      });

      const personUpdated = await prisma.billSplitPerson.findUnique({
        where: { id: person.id },
        include: { payments: true },
      });

      if (!personUpdated) throw new NotFoundException('Pessoa não encontrada');

      persons.push(personUpdated);

      // Cria pagamentos, se houver
    }

    const orderData = await prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
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
            name: true,
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

    // 5️⃣ Distribuição do total do pedido

    return { billSplit, persons, order: orderData };
  }

  async findOne(id: string) {
    const billSplit = await prisma.billSplit.findUnique({
      where: { id },
      include: {
        persons: {
          include: { items: { include: { orderItem: true } }, payments: true },
        },
        orders: true,
      },
    });
    if (!billSplit) throw new NotFoundException('Divisão não encontrada');
    return billSplit;
  }

  async createBillSplitPerson(
    billSplitId: string,
    dto: {
      name: string;
      orderId: string;
      status: BillSplitStatus;
      total: number;
    },
  ) {
    return prisma.billSplitPerson.create({
      data: {
        name: dto.name,
        orderId: dto.orderId,
        billSplitId: billSplitId,
        status: dto.status,
        total: dto.total,
      },
    });
  }

  async createBillSplitItem(
    billSplitPersonId: string,
    dto: { orderItemId: string; quantity: number; status: BillSplitStatus },
  ) {
    return prisma.billSplitItem.create({
      data: {
        billSplitPersonId: billSplitPersonId,
        quantity: dto.quantity,
        orderItemId: dto.orderItemId,
        status: dto.status,
      },
    });
  }
}
