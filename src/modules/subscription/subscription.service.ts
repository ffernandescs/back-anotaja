import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  BillingPeriodDto,
  CreateSubscriptionDto,
  SubscriptionStatusDto,
} from './dto/create-subscription.dto';
import { prisma } from '../../../lib/prisma';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UpdateSubscriptionInput } from './types';
import Stripe from 'stripe';
import { StripeService } from '../billing/stripe.service';

@Injectable()
export class SubscriptionService {
  constructor(private readonly stripeService: StripeService) {}

  async create(createSubscriptionDto: CreateSubscriptionDto, userId: string) {
    // Verificar se o usuário tem permissão (deve ser admin ou owner da empresa)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Pegar companyId do usuário logado (admin pode especificar outra empresa)
    const companyId = user.companyId;

    if (!companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    // Verificar se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Verificar se o usuário tem acesso à empresa (se não for admin)
    if (user.role !== 'admin' && user.companyId !== companyId) {
      throw new ForbiddenException(
        'Você não tem permissão para criar assinatura nesta empresa',
      );
    }

    // Verificar se já existe uma assinatura ativa para esta empresa
    const existingSubscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (existingSubscription && existingSubscription.status === 'ACTIVE') {
      throw new ConflictException(
        'Já existe uma assinatura ativa para esta empresa',
      );
    }

    // Verificar se o plano existe
    const plan = await prisma.plan.findUnique({
      where: { id: createSubscriptionDto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Criar a assinatura
    const subscription = await prisma.subscription.create({
      data: {
        companyId, // Usar companyId do usuário logado
        planId: createSubscriptionDto.planId,
        status: createSubscriptionDto.status || SubscriptionStatusDto.ACTIVE,
        billingPeriod:
          createSubscriptionDto.billingPeriod || BillingPeriodDto.MONTHLY,
        startDate: createSubscriptionDto.startDate
          ? new Date(createSubscriptionDto.startDate)
          : new Date(),
        endDate: createSubscriptionDto.endDate
          ? new Date(createSubscriptionDto.endDate)
          : null,
        nextBillingDate: createSubscriptionDto.nextBillingDate
          ? new Date(createSubscriptionDto.nextBillingDate)
          : null,
        lastBillingDate: createSubscriptionDto.lastBillingDate
          ? new Date(createSubscriptionDto.lastBillingDate)
          : null,
        lastBillingAmount: createSubscriptionDto.lastBillingAmount || null,
        stripeSubscriptionId:
          createSubscriptionDto.strapiSubscriptionId || null,
        stripeCustomerId: createSubscriptionDto.strapiCustomerId || null,
        notes: createSubscriptionDto.notes || null,
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
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
          },
        },
      },
    });

    return subscription;
  }

  async findAll(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Admin pode ver todas, outros só da sua empresa
    // Se não for admin e não tiver companyId, retorna array vazio
    if (user.role !== 'admin' && !user.companyId) {
      return [];
    }

    const where = user.role === 'admin' ? {} : { companyId: user.companyId! };

    return prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            document: true,
            email: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
            limits: true,
            features: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    // Verificar permissão
    if (user.role !== 'admin' && subscription.companyId !== user.companyId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar esta assinatura',
      );
    }

    return subscription;
  }

  async findByCompany(companyId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar permissão
    if (user.role !== 'admin' && user.companyId !== companyId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar esta assinatura',
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            document: true,
            email: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
            limits: true,
            features: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        'Assinatura não encontrada para esta empresa',
      );
    }

    return subscription;
  }

  async update(
    id: string,
    updateSubscriptionDto: UpdateSubscriptionDto,
    userId: string,
  ) {
    // Verificar se a assinatura existe e se o usuário tem permissão
    await this.findOne(id, userId);

    const updateData: Partial<UpdateSubscriptionInput> = {};

    // Converter strings de data para Date
    if (updateSubscriptionDto.startDate) {
      updateData.startDate = new Date(updateSubscriptionDto.startDate);
    }
    if (updateSubscriptionDto.endDate) {
      updateData.endDate = new Date(updateSubscriptionDto.endDate);
    }
    if (updateSubscriptionDto.nextBillingDate) {
      updateData.nextBillingDate = new Date(
        updateSubscriptionDto.nextBillingDate,
      );
    }
    if (updateSubscriptionDto.lastBillingDate) {
      updateData.lastBillingDate = new Date(
        updateSubscriptionDto.lastBillingDate,
      );
    }

    Object.assign(updateData, {
      ...updateSubscriptionDto,
      startDate: undefined,
      endDate: undefined,
      nextBillingDate: undefined,
      lastBillingDate: undefined,
    });

    return prisma.subscription.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            document: true,
            email: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    // Verificar se a assinatura existe e se o usuário tem permissão
    await this.findOne(id, userId);

    // Não deletar, apenas cancelar
    return prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatusDto.CANCELLED },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async verifyPayment(session: Stripe.Checkout.Session, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const subscriptionId = session.subscription as string | undefined;
    const companyId = session.metadata?.companyId as string;

    if (!subscriptionId || !companyId) {
      throw new NotFoundException('Session inválida');
    }

    // Pega subscription atual, incluindo o plan
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        plan: true, // ✅ precisa incluir para ter acesso a subscription.plan
        company: true, // opcional
      },
    });

    // Se não existir ou não estiver ativa, faz upsert

    await prisma.company.update({
      where: { id: companyId },
      data: { onboardingStep: 'SCHEDULE' }, // ou o valor exato que você usa no enum/enum-like
    });
    // Retorno limpo pro frontend
    return subscription;
  }
}
