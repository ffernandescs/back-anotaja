import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto';
import { UpdateDeliveryPersonDto } from './dto/update-delivery-person.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';

const DELIVERY_PASSWORD_EXPIRES_IN_MINUTES = Number(
  process.env.DELIVERY_PASSWORD_EXPIRES_IN_MINUTES ?? 10,
);

const DELIVERY_ONLINE_TIMEOUT_MINUTES = Number(
  process.env.DELIVERY_ONLINE_TIMEOUT_MINUTES ?? 3,
);

@Injectable()
export class DeliveryPersonsService {
  private getOnlineTimeoutDate() {
    const timeoutMs = DELIVERY_ONLINE_TIMEOUT_MINUTES * 60 * 1000;
    return new Date(Date.now() - timeoutMs);
  }

  private async clearStaleOnline(branchId: string) {
    const staleDate = this.getOnlineTimeoutDate();
    await prisma.deliveryPerson.updateMany({
      where: {
        branchId,
        isOnline: true,
        OR: [{ lastOnlineAt: null }, { lastOnlineAt: { lt: staleDate } }],
      },
      data: { isOnline: false },
    });
  }

  async create(
    createDeliveryPersonDto: CreateDeliveryPersonDto,
    userId: string,
  ) {
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

    // Verificar se já existe um entregador com o mesmo telefone na filial
    const existingDeliveryPerson = await prisma.deliveryPerson.findFirst({
      where: {
        phone: createDeliveryPersonDto.phone,
        branchId: user.branchId,
      },
    });

    if (existingDeliveryPerson) {
      throw new ConflictException(
        'Já existe um entregador com este telefone nesta filial',
      );
    }

    // Criar o entregador
    const deliveryPerson = await prisma.deliveryPerson.create({
      data: {
        ...createDeliveryPersonDto,
        branchId: user.branchId, // Sempre usar branchId do usuário logado
        active: createDeliveryPersonDto.active ?? true,
        isOnline: createDeliveryPersonDto.isOnline ?? false,
      },
      include: {
        branch: true,
        _count: {
          select: {
            deliveryOrders: true,
            deliveryAssignments: true,
          },
        },
      },
    });

    return deliveryPerson;
  }

  async findAll(
    userId: string,
    active?: boolean | string,
    isOnline?: boolean | string,
  ) {
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

    // Tipando corretamente o filtro
    const where: Prisma.DeliveryPersonWhereInput = {
      branchId: user.branchId,
    };

    // Filtro por entregadores ativos
    if (active !== undefined) {
      where.active = typeof active === 'boolean' ? active : active === 'true';
    }

    // Filtro por entregadores online
    if (isOnline !== undefined) {
      where.isOnline =
        typeof isOnline === 'boolean' ? isOnline : isOnline === 'true';
    }

    await this.clearStaleOnline(user.branchId);

    return prisma.deliveryPerson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        _count: {
          select: {
            deliveryOrders: true,
            deliveryAssignments: true,
          },
        },
      },
    });
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

    const deliveryPerson = await prisma.deliveryPerson.findUnique({
      where: {
        id,
        branchId: user.branchId, // Sempre filtrar por branchId do usuário
      },
      include: {
        branch: true,
        deliveryOrders: {
          where: {
            status: {
              in: ['PREPARING', 'READY', 'DELIVERING'],
            },
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
          take: 10,
        },
        _count: {
          select: {
            deliveryOrders: true,
            deliveryAssignments: true,
          },
        },
      },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Entregador não encontrado');
    }

    return deliveryPerson;
  }

  async update(
    id: string,
    updateDeliveryPersonDto: UpdateDeliveryPersonDto,
    userId: string,
  ) {
    // Verificar se o entregador existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // Se estiver atualizando o telefone, verificar se não existe outro com o mesmo telefone
    if (updateDeliveryPersonDto.phone) {
      const existingDeliveryPerson = await prisma.deliveryPerson.findFirst({
        where: {
          phone: updateDeliveryPersonDto.phone,
          branchId: user.branchId,
          id: { not: id },
        },
      });

      if (existingDeliveryPerson) {
        throw new ConflictException(
          'Já existe um entregador com este telefone nesta filial',
        );
      }
    }

    return prisma.deliveryPerson.update({
      where: { id },
      data: updateDeliveryPersonDto,
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        _count: {
          select: {
            deliveryOrders: true,
            deliveryAssignments: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    // Verificar se o entregador existe e se o usuário tem permissão

    // Verificar se há pedidos associados
    const ordersCount = await prisma.order.count({
      where: {
        deliveryPersonId: id,
        status: {
          in: ['PREPARING', 'READY', 'DELIVERING'],
        },
      },
    });

    if (ordersCount > 0) {
      // Não deletar, apenas desativar
      return prisma.deliveryPerson.update({
        where: { id },
        data: { active: false },
        include: {
          branch: {
            select: {
              id: true,
              branchName: true,
            },
          },
        },
      });
    }

    return prisma.deliveryPerson.delete({
      where: { id },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
      },
    });
  }

  async findOnline(userId: string) {
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

    await this.clearStaleOnline(user.branchId);

    const staleDate = this.getOnlineTimeoutDate();

    return prisma.deliveryPerson.findMany({
      where: {
        branchId: user.branchId,
        active: true,
        isOnline: true,
        lastOnlineAt: { gte: staleDate },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        _count: {
          select: {
            deliveryOrders: true,
          },
        },
      },
    });
  }

  async updateOnlineStatus(id: string, isOnline: boolean, userId: string) {
    // Verificar se o entregador existe e se o usuário tem permissão
    await this.findOne(id, userId);

    return prisma.deliveryPerson.update({
      where: { id },
      data: {
        isOnline,
        lastOnlineAt: isOnline ? new Date() : null,
      },
      include: {
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
      },
    });
  }

  async generatePassword(
    userId: string,
    deliveryPersonId: string,
    type: 'password' | 'qrcode',
  ) {
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

    const deliveryPerson = await prisma.deliveryPerson.findFirst({
      where: {
        id: deliveryPersonId,
        branchId: user.branchId,
      },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Entregador não encontrado');
    }

    const password = Math.floor(100000 + Math.random() * 900000).toString();
    const qrCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + DELIVERY_PASSWORD_EXPIRES_IN_MINUTES,
    );

    await prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: {
        deliveryPassword: type === 'password' ? password : undefined,
        deliveryQrCode: type === 'qrcode' ? qrCode : undefined,
        deliveryPasswordExpiresAt: expiresAt,
      },
    });

    return {
      deliveryPersonId: deliveryPerson.id,
      type,
      code: type === 'password' ? password : qrCode,
      qrCode: type === 'qrcode' ? qrCode : undefined,
      expiresAt,
    };
  }
}
