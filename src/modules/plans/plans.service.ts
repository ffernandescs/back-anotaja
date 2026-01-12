import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { prisma } from 'lib/prisma';

@Injectable()
export class PlansService {
  async create(createPlanDto: CreatePlanDto, userId: string) {
    // Apenas admin pode criar planos
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Apenas administradores podem criar planos');
    }

    // Criar o plano
    const plan = await prisma.plan.create({
      data: {
        ...createPlanDto,
        billingPeriod: createPlanDto.billingPeriod || 'MONTHLY',
        active: createPlanDto.active ?? true,
        isTrial: createPlanDto.isTrial ?? false,
        isFeatured: createPlanDto.isFeatured ?? false,
        displayOrder: createPlanDto.displayOrder ?? 0,
        trialDays: createPlanDto.trialDays ?? 7,
      },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    return plan;
  }

  async findAll(userId?: string) {
    // Se userId fornecido, verificar permissões
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Admin pode ver todos, inclusive inativos
      if (user?.role === 'admin') {
        return prisma.plan.findMany({
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
          include: {
            _count: {
              select: {
                subscriptions: true,
              },
            },
          },
        });
      }
    }

    // Usuários comuns só veem planos ativos
    return prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plan;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto, userId: string) {
    // Apenas admin pode atualizar planos
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem atualizar planos',
      );
    }

    // Verificar se o plano existe
    await this.findOne(id);

    return prisma.plan.update({
      where: { id },
      data: updatePlanDto,
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Apenas admin pode deletar planos
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem deletar planos',
      );
    }

    // Verificar se o plano existe
    await this.findOne(id);

    // Verificar se há assinaturas ativas usando este plano
    const activeSubscriptions = await prisma.subscription.count({
      where: {
        planId: id,
        status: 'ACTIVE',
      },
    });

    if (activeSubscriptions > 0) {
      throw new ConflictException(
        `Não é possível deletar o plano. Existem ${activeSubscriptions} assinatura(s) ativa(s) usando este plano.`,
      );
    }

    // Não deletar, apenas desativar
    return prisma.plan.update({
      where: { id },
      data: { active: false },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async findActive() {
    return prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }

  async findFeatured() {
    return prisma.plan.findMany({
      where: {
        active: true,
        isFeatured: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });
  }
}
