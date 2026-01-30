import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { UpdateAutoRouteConfigDto } from './dto/update-auto-route-config.dto';

@Injectable()
export class AutoRouteConfigService {
  async findOne(userId: string) {
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

    // Buscar ou criar configuração
    let config = await prisma.autoRouteConfig.findUnique({
      where: { branchId: user.branchId },
    });

    // Se não existir, criar com valores padrão
    if (!config) {
      config = await prisma.autoRouteConfig.create({
        data: {
          branchId: user.branchId,
          autoDispatch: false,
          maxDeliveriesPerTrip: 5,
          maxDistanceToGroup: 3000, // 3km em metros
          maxTimeToGroup: 30, // 30 minutos
          deliveryPersonAvailable: 'DELIVERED',
        },
      });
    }

    return config;
  }

  async update(userId: string, updateDto: UpdateAutoRouteConfigDto) {
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

    // Buscar configuração existente
    const existingConfig = await prisma.autoRouteConfig.findUnique({
      where: { branchId: user.branchId },
    });

    if (existingConfig) {
      // Atualizar configuração existente
      return prisma.autoRouteConfig.update({
        where: { branchId: user.branchId },
        data: updateDto,
      });
    } else {
      // Criar nova configuração
      return prisma.autoRouteConfig.create({
        data: {
          branchId: user.branchId,
          autoDispatch: updateDto.autoDispatch ?? false,
          maxDeliveriesPerTrip: updateDto.maxDeliveriesPerTrip ?? 5,
          maxDistanceToGroup: updateDto.maxDistanceToGroup ?? 3000,
          maxTimeToGroup: updateDto.maxTimeToGroup ?? 30,
          deliveryPersonAvailable:
            updateDto.deliveryPersonAvailable ?? 'DELIVERED',
        },
      });
    }
  }

  async reset(userId: string) {
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

    // Buscar configuração existente
    const existingConfig = await prisma.autoRouteConfig.findUnique({
      where: { branchId: user.branchId },
    });

    if (existingConfig) {
      // Resetar para valores padrão
      return prisma.autoRouteConfig.update({
        where: { branchId: user.branchId },
        data: {
          autoDispatch: false,
          maxDeliveriesPerTrip: 5,
          maxDistanceToGroup: 3000,
          maxTimeToGroup: 30,
          deliveryPersonAvailable: 'DELIVERED',
        },
      });
    } else {
      // Criar com valores padrão
      return prisma.autoRouteConfig.create({
        data: {
          branchId: user.branchId,
          autoDispatch: false,
          maxDeliveriesPerTrip: 5,
          maxDistanceToGroup: 3000,
          maxTimeToGroup: 30,
          deliveryPersonAvailable: 'DELIVERED',
        },
      });
    }
  }
}
