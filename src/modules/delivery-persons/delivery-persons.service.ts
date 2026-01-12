import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto';
import { UpdateDeliveryPersonDto } from './dto/update-delivery-person.dto';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';

@Injectable()
export class DeliveryPersonsService {
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
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
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

    return prisma.deliveryPerson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
          },
        },
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
            name: true,
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
              name: true,
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
            name: true,
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

    return prisma.deliveryPerson.findMany({
      where: {
        branchId: user.branchId,
        active: true,
        isOnline: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
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
      data: { isOnline },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
}
