import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { AutoCreateRoutesDto } from './dto/auto-create-routes.dto';

interface OrderWithAddress {
  id: string;
  orderNumber: number | null;
  customerName: string;
  address: string;
  city: string;
  state: string;
  total: number;
  lat: number;
  lng: number;
  status: string;
}

interface RoutePoint {
  orderId: string;
  lat: number;
  lng: number;
  address: string;
  pointLabel: string;
  isBranch?: boolean;
}

export interface CreatedRoute {
  id: string;
  name: string | null;
  deliveryPersonId: string;
  branchId: string;
  status: string;
  route: string;
  estimatedDistance: number | null;
  estimatedTime: number | null;
  ordersCount: number;
  deliveryPerson: any;
}

export interface AutoCreateRoutesResult {
  success: boolean;
  message: string;
  routes: CreatedRoute[];
  stats: {
    totalOrders: number;
    assignedOrders: number;
    unassignedOrders: number;
    routesCreated: number;
  };
}

@Injectable()
export class DeliveryAssignmentsService {
  // ... outros métodos existentes ...
  // ADICIONE ESTE MÉTODO AQUI ↓
  async findAll(userId: string) {
    // Verificar usuário e permissões
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

    // Buscar todas as rotas da filial
    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        branchId: user.branchId,
      },
      include: {
        deliveryPerson: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            isOnline: true,
          },
        },
        orders: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            customerAddress: {
              select: {
                street: true,
                number: true,
                neighborhood: true,
                city: true,
                state: true,
                zipCode: true,
                lat: true,
                lng: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      assignments,
      total: assignments.length,
    };
  }

  async autoCreateRoutes(dto: AutoCreateRoutesDto, userId: string) {
    // Verificar usuário e permissões
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.branchId || user.branchId !== user.branchId) {
      throw new ForbiddenException(
        'Usuário não tem permissão para esta filial',
      );
    }

    // Buscar configuração de rotas automáticas
    let config = await prisma.autoRouteConfig.findUnique({
      where: { branchId: user.branchId },
    });

    // Se não existir configuração, criar uma com valores padrão
    if (!config) {
      config = await prisma.autoRouteConfig.create({
        data: {
          branchId: user.branchId,
          autoDispatch: false,
          maxDeliveriesPerTrip: 5,
          maxDistanceToGroup: 3000, // 3km
          maxTimeToGroup: 30, // 30 minutos
          deliveryPersonAvailable: 'DELIVERED',
        },
      });
    }

    // Buscar pedidos disponíveis
    const whereClause: Prisma.OrderWhereInput = {
      branchId: user.branchId,
      deliveryType: 'DELIVERY',
      deliveryAssignmentId: null,
      status: {
        in: ['PREPARING', 'READY'],
      },
    };

    // Se orderIds foi fornecido, filtrar por esses IDs
    if (dto.orderIds && dto.orderIds.length > 0) {
      whereClause.id = { in: dto.orderIds };
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        customerAddress: true,
        customer: true,
      },
    });

    if (orders.length === 0) {
      throw new BadRequestException(
        'Nenhum pedido disponível para criar rotas',
      );
    }

    // Filtrar pedidos com coordenadas válidas
    const ordersWithCoords = orders
      .filter(
        (order) =>
          order.customerAddress?.lat &&
          order.customerAddress?.lng &&
          order.customer?.name,
      )
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer!.name,
        address: order.customerAddress!.street || '',
        city: order.customerAddress!.city || '',
        state: order.customerAddress!.state || '',
        total: order.total,
        lat: Number(order.customerAddress!.lat),
        lng: Number(order.customerAddress!.lng),
        status: order.status,
      })) as OrderWithAddress[];

    if (ordersWithCoords.length === 0) {
      throw new BadRequestException(
        'Nenhum pedido com endereço válido encontrado',
      );
    }

    // Buscar entregadores disponíveis
    const availableDeliveryPersons = await this.getAvailableDeliveryPersons(
      user.branchId,
      config.deliveryPersonAvailable,
    );

    if (availableDeliveryPersons.length === 0) {
      throw new BadRequestException('Nenhum entregador disponível');
    }

    // Agrupar pedidos por proximidade
    const groups = this.groupOrdersByProximity(
      ordersWithCoords,
      config.maxDeliveriesPerTrip,
      config.maxDistanceToGroup,
    );

    // Criar rotas para cada grupo
    const createdRoutes: CreatedRoute[] = [];

    for (
      let i = 0;
      i < groups.length && i < availableDeliveryPersons.length;
      i++
    ) {
      const group = groups[i];
      const deliveryPerson = availableDeliveryPersons[i];

      try {
        // Otimizar rota do grupo
        const optimizedRoute = await this.optimizeRoute(group, user.branchId);

        // Criar assignment
        const assignment = await prisma.deliveryAssignment.create({
          data: {
            name: `Rota ${new Date().toLocaleString('pt-BR')}`,
            deliveryPersonId: deliveryPerson.id,
            branchId: user.branchId,
            status: config.autoDispatch ? 'IN_PROGRESS' : 'PENDING',
            route: JSON.stringify(optimizedRoute.route),
            estimatedDistance: optimizedRoute.estimatedDistance,
            estimatedTime: optimizedRoute.estimatedTime,
            startedAt: config.autoDispatch ? new Date() : null,
          },
          include: {
            deliveryPerson: true,
          },
        });

        // Associar pedidos à rota
        await prisma.order.updateMany({
          where: {
            id: { in: group.map((o) => o.id) },
          },
          data: {
            deliveryAssignmentId: assignment.id,
            deliveryPersonId: deliveryPerson.id,
            status: config.autoDispatch ? 'DELIVERING' : undefined,
          },
        });

        createdRoutes.push({
          ...assignment,
          ordersCount: group.length,
        });
      } catch (error) {
        console.error(`Erro ao criar rota para grupo ${i}:`, error);
      }
    }

    // Pedidos não agrupados (se houver mais pedidos que entregadores)
    const assignedOrderIds = groups
      .flat()
      .slice(0, config.maxDeliveriesPerTrip * availableDeliveryPersons.length)
      .map((o) => o.id);

    const unassignedOrders = ordersWithCoords.filter(
      (o) => !assignedOrderIds.includes(o.id),
    );

    return {
      success: true,
      message: `${createdRoutes.length} rota(s) criada(s) com sucesso`,
      routes: createdRoutes,
      stats: {
        totalOrders: ordersWithCoords.length,
        assignedOrders: assignedOrderIds.length,
        unassignedOrders: unassignedOrders.length,
        routesCreated: createdRoutes.length,
      },
    };
  }

  private async getAvailableDeliveryPersons(
    branchId: string,
    availability: 'DELIVERED' | 'COMPLETED',
  ) {
    const deliveryPersons = await prisma.deliveryPerson.findMany({
      where: {
        branchId,
        active: true,
        isOnline: true,
      },
      include: {
        deliveryAssignments: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        },
        deliveryOrders: {
          where: {
            status: { in: ['DELIVERING'] },
          },
        },
      },
    });

    // Filtrar entregadores disponíveis com base na configuração
    return deliveryPersons.filter((dp) => {
      if (availability === 'DELIVERED') {
        // Disponível quando todos pedidos estão entregues
        return dp.deliveryOrders.length === 0;
      } else {
        // Disponível quando não tem rota em andamento
        return dp.deliveryAssignments.length === 0;
      }
    });
  }

  private groupOrdersByProximity(
    orders: OrderWithAddress[],
    maxPerGroup: number,
    maxDistance: number,
  ): OrderWithAddress[][] {
    const groups: OrderWithAddress[][] = [];
    const remaining = [...orders];

    while (remaining.length > 0) {
      const group: OrderWithAddress[] = [];
      const baseOrder = remaining.shift()!;
      group.push(baseOrder);

      // Encontrar pedidos próximos
      const nearby = remaining.filter((order) => {
        const distance = this.calculateDistance(
          baseOrder.lat,
          baseOrder.lng,
          order.lat,
          order.lng,
        );
        return distance <= maxDistance;
      });

      // Adicionar até maxPerGroup pedidos ao grupo
      const toAdd = nearby.slice(0, maxPerGroup - 1);
      group.push(...toAdd);

      // Remover pedidos adicionados
      toAdd.forEach((order) => {
        const index = remaining.indexOf(order);
        if (index > -1) remaining.splice(index, 1);
      });

      groups.push(group);
    }

    return groups;
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371e3; // Raio da Terra em metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async optimizeRoute(orders: OrderWithAddress[], branchId: string) {
    console.log('🗺️ Otimizando rota para', orders.length, 'pedidos');
    console.log('📦 Pedidos recebidos:', orders);

    // Buscar coordenadas da filial
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { address: true },
    });

    // Tentar várias fontes de coordenadas da filial
    let branchLat: number;
    let branchLng: number;

    if (branch?.latitude && branch?.longitude) {
      branchLat = Number(branch.latitude);
      branchLng = Number(branch.longitude);
    } else if (branch?.address?.lat && branch?.address?.lng) {
      branchLat = Number(branch.address.lat);
      branchLng = Number(branch.address.lng);
    } else {
      // Coordenadas padrão de Recife, PE
      branchLat = -8.0476;
      branchLng = -34.877;
      console.warn(
        '⚠️ Coordenadas da filial não encontradas, usando coordenadas padrão de Recife',
      );
    }

    console.log('🏪 Coordenadas da filial:', { branchLat, branchLng });

    // Criar pontos da rota
    const points: RoutePoint[] = [
      {
        orderId: 'branch',
        lat: branchLat,
        lng: branchLng,
        address: branch?.address?.street || 'Filial',
        pointLabel: 'Filial',
        isBranch: true,
      },
    ];

    // Adicionar pedidos (ordenação simples - pode ser melhorada com algoritmo de otimização)
    orders.forEach((order, index) => {
      const point = {
        orderId: order.id,
        lat: Number(order.lat),
        lng: Number(order.lng),
        address: `${order.address}, ${order.city}`,
        pointLabel: `Ponto ${String.fromCharCode(65 + index)}`,
      };

      console.log(`📍 Adicionando ${point.pointLabel}:`, {
        orderId: point.orderId,
        lat: point.lat,
        lng: point.lng,
        address: point.address,
      });

      points.push(point);
    });

    console.log('✅ Pontos da rota finalizados:', points);

    // Calcular distância e tempo estimados
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const distance = this.calculateDistance(
        points[i].lat,
        points[i].lng,
        points[i + 1].lat,
        points[i + 1].lng,
      );
      totalDistance += distance;
    }

    // Tempo estimado: 30 km/h média + 5 min por parada
    const estimatedTime = Math.ceil(
      (totalDistance / 1000 / 30) * 60 + orders.length * 5,
    );

    console.log('📊 Distância total:', totalDistance, 'metros');
    console.log('⏱️ Tempo estimado:', estimatedTime, 'minutos');

    return {
      route: points,
      estimatedDistance: Math.round(totalDistance),
      estimatedTime,
    };
  }

  async remove(id: string, userId: string) {
    // Verificar usuário e permissões
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

    // Verificar se a rota existe e pertence à filial do usuário
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id },
      include: {
        orders: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Rota não encontrada');
    }

    if (assignment.branchId !== user.branchId) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir esta rota',
      );
    }

    // Remover associação dos pedidos com a rota
    await prisma.order.updateMany({
      where: {
        deliveryAssignmentId: id,
      },
      data: {
        deliveryAssignmentId: null,
        deliveryPersonId: null,
        status: 'PREPARING',
      },
    });

    // Deletar a rota
    await prisma.deliveryAssignment.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Rota excluída com sucesso',
      ordersFreed: assignment.orders.length,
    };
  }

  async assignDeliveryPerson(
    assignmentId: string,
    deliveryPersonId: string,
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

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: { orders: true },
    });

    if (!assignment) {
      throw new NotFoundException('Rota não encontrada');
    }

    if (assignment.branchId !== user.branchId) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar esta rota',
      );
    }

    const deliveryPerson = await prisma.deliveryPerson.findFirst({
      where: {
        id: deliveryPersonId,
        branchId: user.branchId,
        active: true,
      },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Entregador não encontrado nesta filial');
    }

    const updatedAssignment = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: {
        deliveryPersonId: deliveryPerson.id,
      },
      include: {
        deliveryPerson: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            isOnline: true,
          },
        },
        orders: true,
      },
    });

    await prisma.order.updateMany({
      where: { deliveryAssignmentId: assignmentId },
      data: { deliveryPersonId: deliveryPerson.id },
    });

    return {
      success: true,
      message: 'Entregador associado à rota com sucesso',
      assignment: updatedAssignment,
    };
  }
}
