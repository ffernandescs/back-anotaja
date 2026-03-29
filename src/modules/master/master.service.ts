import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class MasterService {
  /**
   * Busca todas as assinaturas do sistema
   */
  async findAllSubscriptions() {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
            document: true,
            email: true,
          },
        },
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { subscriptions };
  }

  /**
   * Busca todas as empresas cadastradas no sistema
   */
  async findAllCompanies() {
    const companies = await prisma.company.findMany({
      where: { active: true },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
            products: true,
          },
        },
        subscription: {
          include: {
            plan: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
        address: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { companies };
  }

  /**
   * Busca uma empresa específica por ID
   */
  async findCompanyById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
            products: true,
          },
        },
        subscription: {
          include: {
            plan: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
        address: true,
        branches: {
          include: {
            address: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return company;
  }

  /**
   * Busca todos os planos do sistema
   */
  async findAllPlans() {
    const plans = await prisma.plan.findMany({
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { plans };
  }

  /**
   * Cria uma nova assinatura
   * NOTA: Para assinaturas pagas com Stripe, use o fluxo de checkout do Stripe
   * Este método é para criação manual/administrativa de assinaturas (ex: trials, cortesias)
   */
  async createSubscription(data: any) {
    const { companyId, planId, startDate, notes, withStripe = false } = data;

    // Verificar se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscription: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Verificar se já existe assinatura ativa
    if (company.subscription && company.subscription.status === 'ACTIVE') {
      throw new BadRequestException('Empresa já possui uma assinatura ativa');
    }

    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Se withStripe=true e plano não é trial, retornar erro
    // Pois assinaturas pagas devem usar o fluxo de checkout do Stripe
    if (withStripe && !plan.isTrial && plan.price > 0) {
      throw new BadRequestException(
        'Para assinaturas pagas, use o fluxo de checkout do Stripe. ' +
        'Este endpoint é apenas para criação manual de trials ou cortesias.'
      );
    }

    // Calcular trial end date se for plano trial
    const trialEndsAt = plan.isTrial && plan.trialDays
      ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;

    let subscription;
    if (company.subscription) {
      // Atualizar assinatura existente
      subscription = await prisma.subscription.update({
        where: { id: company.subscription.id },
        data: {
          status: 'ACTIVE' as any,
          billingPeriod: plan.billingPeriod || 'MONTHLY',
          startDate: startDate ? new Date(startDate) : new Date(),
          trialEndsAt,
          notes,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              document: true,
              email: true,
            },
          },
          plan: true,
        },
      });
    } else {
      // Criar nova assinatura
      subscription = await prisma.subscription.create({
        data: {
          company: {
            connect: { id: companyId },
          },
          plan: {
            connect: { id: planId },
          },
          status: 'ACTIVE' as any,
          billingPeriod: plan.billingPeriod || 'MONTHLY',
          startDate: startDate ? new Date(startDate) : new Date(),
          trialEndsAt,
          notes,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              document: true,
              email: true,
            },
          },
          plan: true,
        },
      });
    }

    return subscription;
  }
}
