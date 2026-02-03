import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '../../../lib/prisma';
import { DeliveryLoginDto } from './dto/delivery-login.dto';

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
}
