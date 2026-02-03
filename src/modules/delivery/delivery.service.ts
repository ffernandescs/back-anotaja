import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '../../../lib/prisma';
import { DeliveryLoginDto } from './dto/delivery-login.dto';
import { OrderStatusDto } from '../orders/dto/create-order-item.dto';
import { OrderStatus } from 'generated/prisma';

@Injectable()
export class DeliveryService {
  constructor(private readonly jwtService: JwtService) {}

  private verifyDeliveryToken(token?: string): { deliveryPersonId: string; branchId?: string } {
    if (!token) {
      throw new UnauthorizedException('Token não informado');
    }

    try {
      const payload = this.jwtService.verify<{ deliveryPersonId?: string; branchId?: string }>(
        token,
      );

      if (!payload?.deliveryPersonId) {
        throw new UnauthorizedException('Token inválido: deliveryPersonId ausente');
      }

      return { deliveryPersonId: payload.deliveryPersonId, branchId: payload.branchId };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async heartbeat(deliveryPersonId: string) {
    const deliveryPerson = await prisma.deliveryPerson.findFirst({
      where: { id: deliveryPersonId, active: true },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Entregador não encontrado');
    }

    return prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: { isOnline: true, lastOnlineAt: new Date() },
    });
  }

  async setOffline(deliveryPersonId: string) {
    const deliveryPerson = await prisma.deliveryPerson.findFirst({
      where: { id: deliveryPersonId, active: true },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Entregador não encontrado');
    }

    return prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: { isOnline: false, lastOnlineAt: null },
    });
  }

  async login(dto: DeliveryLoginDto) {
    const { password, qrCode } = dto;

    if (!password && !qrCode) {
      throw new BadRequestException('Informe password ou qrCode');
    }

    const now = new Date();

    const deliveryPerson = await prisma.deliveryPerson.findFirst({
      where: {
        active: true,
        deliveryPasswordExpiresAt: { gt: now },
        ...(password ? { deliveryPassword: password } : {}),
        ...(qrCode ? { deliveryQrCode: qrCode } : {}),
      },
      include: {
        branch: {
          select: { id: true, branchName: true },
        },
      },
    });

    if (!deliveryPerson) {
      throw new UnauthorizedException('Credenciais inválidas ou expiradas');
    }

    await prisma.deliveryPerson.update({
      where: { id: deliveryPerson.id },
      data: {
        deliveryPassword: null,
        deliveryQrCode: null,
        deliveryPasswordExpiresAt: null,
      },
    });

    const token = this.jwtService.sign({
      deliveryPersonId: deliveryPerson.id,
      role: 'delivery',
      branchId: deliveryPerson.branchId,
    });

    return {
      token,
      deliveryPerson: {
        id: deliveryPerson.id,
        name: deliveryPerson.name,
        email: deliveryPerson.email,
        phone: deliveryPerson.phone,
        branchId: deliveryPerson.branchId,
        branch: deliveryPerson.branch,
      },
    };
  }

  async me(token?: string) {
    const payload = this.verifyDeliveryToken(token);

    const deliveryPerson = await prisma.deliveryPerson.findUnique({
      where: { id: payload.deliveryPersonId },
      include: {
        branch: {
          select: { id: true, branchName: true, company: true, logoUrl: true },
        },
      },
    });

    if (!deliveryPerson) {
      throw new UnauthorizedException('Entregador não encontrado');
    }

    return {
      deliveryPerson: {
        id: deliveryPerson.id,
        name: deliveryPerson.name,
        email: deliveryPerson.email,
        phone: deliveryPerson.phone,
        branchId: deliveryPerson.branchId,
        branch: deliveryPerson.branch,
        isOnline: deliveryPerson.isOnline,
      },
    };
  }

  async getOrders(token?: string, status?: string) {
    const { deliveryPersonId } = this.verifyDeliveryToken(token);

    const where: any = { deliveryPersonId };
    if (status) {
      where.status = status;
    }

    return prisma.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAssignments(token?: string) {
    const { deliveryPersonId } = this.verifyDeliveryToken(token);

    return prisma.deliveryAssignment.findMany({
      where: { deliveryPersonId },
      orderBy: { createdAt: 'desc' },
      include: {
        orders: true,
      },
    });
  }

  async updateOrderStatus(
    token: string | undefined,
    orderId: string,
    status: OrderStatusDto,
  ) {
    const { deliveryPersonId } = this.verifyDeliveryToken(token);

    const allowedStatuses = [
      OrderStatusDto.DELIVERING,
      OrderStatusDto.DELIVERED,
    ];

    if (!allowedStatuses.includes(status)) {
      throw new ForbiddenException(
        'Entregadores só podem atualizar para DELIVERING ou DELIVERED',
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        deliveryPersonId: true,
        deliveryAssignmentId: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.deliveryPersonId !== deliveryPersonId) {
      throw new ForbiddenException('Pedido não pertence a este entregador');
    }

    const statusFlow: OrderStatusDto[] = [
      OrderStatusDto.PENDING,
      OrderStatusDto.CONFIRMED,
      OrderStatusDto.PREPARING,
      OrderStatusDto.READY,
      OrderStatusDto.DELIVERING,
      OrderStatusDto.DELIVERED,
      OrderStatusDto.CANCELLED,
    ];

    const currentIndex = statusFlow.indexOf(order.status as OrderStatusDto);
    const nextIndex = statusFlow.indexOf(status);

    if (currentIndex === -1 || nextIndex === -1 || nextIndex < currentIndex) {
      throw new ForbiddenException('Não é possível retroceder o status do pedido');
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    if (
      status === OrderStatusDto.DELIVERED &&
      updatedOrder.deliveryAssignmentId
    ) {
      const ordersFromRoute = await prisma.order.findMany({
        where: { deliveryAssignmentId: updatedOrder.deliveryAssignmentId },
        select: { id: true, status: true },
      });

      const allDelivered = ordersFromRoute.every(
        (o) => o.status === OrderStatus.DELIVERED,
      );

      if (allDelivered) {
        await prisma.deliveryAssignment.update({
          where: { id: updatedOrder.deliveryAssignmentId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    }

    return updatedOrder;
  }
}
