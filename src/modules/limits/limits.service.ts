import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateLimitDto } from './dto/create-limit.dto';
import { UpdateLimitDto } from './dto/update-limit.dto';

@Injectable()
export class LimitsService {

  async create(createLimitDto: CreateLimitDto) {
    const { planId, resource, maxValue } = createLimitDto;

    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Verificar se já existe um limite para este recurso no plano
    const existingLimit = await prisma.planLimit.findUnique({
      where: {
        planId_resource: {
          planId,
          resource,
        },
      },
    });

    if (existingLimit) {
      throw new BadRequestException('Limite já existe para este recurso no plano');
    }

    return prisma.planLimit.create({
      data: {
        planId,
        resource,
        maxValue,
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(planId?: string) {
    const where = planId ? { planId } : {};

    return prisma.planLimit.findMany({
      where,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const limit = await prisma.planLimit.findUnique({
      where: { id },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!limit) {
      throw new NotFoundException('Limite não encontrado');
    }

    return limit;
  }

  async findByPlan(planId: string) {
    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return prisma.planLimit.findMany({
      where: { planId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        resource: 'asc',
      },
    });
  }

  async update(id: string, updateLimitDto: UpdateLimitDto) {
    // Verificar se o limite existe
    const existingLimit = await this.findOne(id);

    const { resource, maxValue } = updateLimitDto;

    // Se estiver atualizando o resource, verificar se já existe outro limite com este resource
    if (resource && resource !== existingLimit.resource) {
      const duplicateLimit = await prisma.planLimit.findUnique({
        where: {
          planId_resource: {
            planId: existingLimit.planId,
            resource,
          },
        },
      });

      if (duplicateLimit) {
        throw new BadRequestException('Limite já existe para este recurso no plano');
      }
    }

    return prisma.planLimit.update({
      where: { id },
      data: updateLimitDto,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    // Verificar se o limite existe
    await this.findOne(id);

    return prisma.planLimit.delete({
      where: { id },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async removeAllByPlan(planId: string) {
    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return prisma.planLimit.deleteMany({
      where: { planId },
    });
  }

  // Método para obter estatísticas de limites
  async getStats() {
    const [totalLimits, limitsByResource, limitsByPlan] = await Promise.all([
      prisma.planLimit.count(),
      prisma.planLimit.groupBy({
        by: ['resource'],
        _count: {
          resource: true,
        },
      }),
      prisma.planLimit.groupBy({
        by: ['planId'],
        _count: {
          planId: true,
        },
      }),
    ]);

    return {
      totalLimits,
      limitsByResource,
      limitsByPlan,
    };
  }
}
