import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatFeatures } from '../../constants/features';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateSubscriptionDto, SubscriptionStatusDto, BillingPeriodDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionInput } from './types';
import Stripe from 'stripe';
import { StripeService } from '../billing/stripe.service';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { SubscriptionHistoryService } from './subscription-history.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly historyService: SubscriptionHistoryService,
  ) {}

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
    if (user.groupId !== 'admin' && user.companyId !== companyId) {
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
        trialEndsAt: createSubscriptionDto.trialEndsAt
          ? new Date(createSubscriptionDto.trialEndsAt)
          : null,
        cancelAtPeriodEnd: createSubscriptionDto.cancelAtPeriodEnd || false,
        paymentRetryCount: createSubscriptionDto.paymentRetryCount || 0,
        nextBillingDate: createSubscriptionDto.nextBillingDate
          ? new Date(createSubscriptionDto.nextBillingDate)
          : null,
        lastBillingDate: createSubscriptionDto.lastBillingDate
          ? new Date(createSubscriptionDto.lastBillingDate)
          : null,
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

    // ✅ Registrar criação no histórico
    await this.historyService.createHistoryEntry({
      subscriptionId: subscription.id,
      eventType: 'CREATED',
      newPlanId: subscription.planId,
      newStatus: subscription.status as any,
      newBillingPeriod: subscription.billingPeriod as any,
      userId,
      reason: 'Assinatura criada',
    });

    // ✅ Se tiver trial, registrar início
    if (subscription.trialEndsAt) {
      await this.historyService.logTrialStarted(
        subscription.id,
        subscription.trialEndsAt,
        userId,
      );
    }

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
      if (user.groupId !== 'admin' && !user.companyId) {
        return [];
      }

    const where = user.groupId === 'admin' ? {} : { companyId: user.companyId! };

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
    if (user.groupId !== 'admin' && subscription.companyId !== user.companyId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar esta assinatura',
      );
    }

    // Formatar dados para o frontend - mantendo compatibilidade
    const now = new Date();
    const isTrialActive = subscription.trialEndsAt && subscription.trialEndsAt > now;
    
    const formattedSubscription = {
      ...subscription,
      // Durante trial, lastBillingAmount é 0 (nenhuma cobrança ainda)
      lastBillingAmount: isTrialActive ? 0 : subscription.plan.price,
      plan: subscription.plan ? {
        ...subscription.plan,
        // Manter campos originais como strings JSON para compatibilidade
        // Adicionar campos formatados separados
        formattedPrice: isTrialActive ? 'Grátis' : formatCurrency(subscription.plan.price),
        formattedFeatures: subscription.plan.features ? 
          JSON.parse(subscription.plan.features).map((feature: string) => ({
            key: feature,
            name: feature.charAt(0).toUpperCase() + feature.slice(1).replace(/_/g, ' ')
          })) : [],
        formattedLimits: subscription.plan.limits ? 
          Object.entries(JSON.parse(subscription.plan.limits)).map(([key, value]) => ({
            key: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            value: value
          })) : []
      } : subscription.plan
    };

    return formattedSubscription;
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
    if (user.companyId !== companyId) {
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

    // Formatar dados para o frontend - mantendo compatibilidade
    const now = new Date();
    const isTrialActive = subscription.trialEndsAt && subscription.trialEndsAt > now;
    
    // ✅ Calcular trialDaysRemaining corretamente
    let trialDaysRemaining: number | null = null;
    if (subscription.trialEndsAt) {
      // ✅ Usar UTC para evitar problemas de fuso horário
      const nowUTC = new Date();
      const todayUTC = new Date(Date.UTC(nowUTC.getFullYear(), nowUTC.getMonth(), nowUTC.getDate()));
      const expirationUTC = new Date(Date.UTC(subscription.trialEndsAt.getFullYear(), subscription.trialEndsAt.getMonth(), subscription.trialEndsAt.getDate()));
      
      const diffTime = expirationUTC.getTime() - todayUTC.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Se a data de expiração é hoje, não há dias restantes
      trialDaysRemaining = Math.max(0, diffDays);
    }
    
    const formattedSubscription = {
      ...subscription,
      // Durante trial, lastBillingAmount é 0 (nenhuma cobrança ainda)
      lastBillingAmount: isTrialActive ? 0 : subscription.plan.price,
      trialDaysRemaining, // ✅ Adicionar campo calculado
      isActive: subscription.status === 'ACTIVE',
      isTrial: isTrialActive,
      plan: subscription.plan ? {
        ...subscription.plan,
        // Manter campos originais como strings JSON para compatibilidade
        // Adicionar campos formatados separados
        formattedPrice: isTrialActive ? 'Grátis' : formatCurrency(subscription.plan.price),
        formattedFeatures: subscription.plan.features ? 
          formatFeatures(JSON.parse(subscription.plan.features)) : [],
        formattedLimits: subscription.plan.limits ? 
          Object.entries(JSON.parse(subscription.plan.limits)).map(([key, value]) => ({
            key: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            value: value
          })) : []
      } : subscription.plan
    };

    return formattedSubscription;
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
    const subscription = await this.findOne(id, userId);

    // Não deletar, apenas cancelar
    const updated = await prisma.subscription.update({
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

    // ✅ Registrar cancelamento no histórico
    await this.historyService.logStatusChange(
      id,
      subscription.status as any,
      'CANCELLED',
      userId,
      'Assinatura cancelada pelo usuário',
    );

    return updated;
  }

  async verifyPayment(session: Stripe.Checkout.Session, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    
    // ✅ Extrair subscriptionId corretamente (pode ser string ou objeto expandido)
    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription?.id;
    const companyId = session.metadata?.companyId as string;

    if (!subscriptionId || !companyId) {
      throw new NotFoundException('Session inválida');
    }

    // Buscar plano pelo metadata da session
    const planId = session.metadata?.planId as string;
    if (!planId) {
      throw new NotFoundException('Plano não encontrado na sessão');
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Pega subscription atual, incluindo o plan
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        plan: true, // ✅ precisa incluir para ter acesso a subscription.plan
        company: true, // opcional
      },
    });

    // ✅ Buscar trial_end do Stripe (fonte da verdade)
    const stripeSubscription = await this.stripeService.stripe.subscriptions.retrieve(
      subscriptionId
    );
    const trialEndsAt = stripeSubscription.trial_end
      ? new Date(new Date(stripeSubscription.trial_end * 1000).toUTCString())
      : subscription?.trialEndsAt || null;
    
    // ✅ Usar current_period_end do Stripe para próxima cobrança (não session.created)
    const nextBillingDate = (stripeSubscription as any).current_period_end
      ? new Date(new Date((stripeSubscription as any).current_period_end * 1000).toUTCString())
      : null;

    // Atualizar subscription com dados do Stripe
    const updatedSubscription = await prisma.subscription.update({
      where: { companyId },
      data: {
        planId: plan.id, // Atualizar para novo plano
        stripeSubscriptionId: subscriptionId,
        trialEndsAt, // ✅ Usar trial_end do Stripe como fonte da verdade
        nextBillingDate, // ✅ Usar current_period_end do Stripe
        status: 'ACTIVE',
      },
      include: {
        plan: true,
        company: true,
      },
    });

    // ❌ NÃO atualizar permissões aqui - o webhook já processa a mudança de plano
    // O webhook é a fonte da verdade para atualização de permissões
    console.log(`🔍 verifyPayment - Apenas buscando dados, permissões NÃO atualizadas (webhook cuida disso)`);

    await prisma.company.update({
      where: { id: companyId },
      data: { onboardingStep: 'SCHEDULE' }, // ou o valor exato que você usa no enum/enum-like
    });

    // ✅ Registrar no histórico
    if (subscription?.planId !== plan.id) {
      // Mudança de plano
      await this.historyService.logPlanChange(
        updatedSubscription.id,
        subscription?.planId || plan.id,
        plan.id,
        userId,
        'Plano atualizado via checkout',
      );
    }

    // ✅ Registrar ativação
    if (subscription?.status !== 'ACTIVE') {
      await this.historyService.logStatusChange(
        updatedSubscription.id,
        subscription?.status as any || 'PENDING',
        'ACTIVE',
        userId,
        'Assinatura ativada via checkout',
        stripeSubscription.id,
      );
    }

    // Formatar dados para o frontend
    if (!updatedSubscription || !updatedSubscription.plan) {
      throw new NotFoundException('Assinatura ou plano não encontrado');
    }

    const formattedSubscription = {
      ...updatedSubscription,
      // Durante trial, lastBillingAmount é 0 (nenhuma cobrança ainda)
      lastBillingAmount: updatedSubscription.trialEndsAt && updatedSubscription.trialEndsAt > new Date() ? 0 : updatedSubscription.plan.price,
      plan: {
        ...updatedSubscription.plan,
        // Manter campos originais como strings JSON para compatibilidade
        // Adicionar campos formatados separados
        formattedPrice: updatedSubscription.trialEndsAt && updatedSubscription.trialEndsAt > new Date() ? 'Grátis' : formatCurrency(updatedSubscription.plan.price),
        formattedFeatures: updatedSubscription.plan.features ? 
          formatFeatures(JSON.parse(updatedSubscription.plan.features)) : [],
        formattedLimits: updatedSubscription.plan.limits ? 
          Object.entries(JSON.parse(updatedSubscription.plan.limits)).map(([key, value]) => ({
            key: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            value: value
          })) : []
      }
    };
    // Retorno formatado pro frontend
    return formattedSubscription;
  }

  /**
   * Atualiza todos os grupos da empresa com as features do plano
   */
  private async updateCompanyGroupsFeatures(companyId: string, plan: any) {
    // 1. Buscar todas as features do plano
    const planFeatures = await prisma.planFeature.findMany({
      where: { planId: plan.id },
      include: {
        feature: true,
      },
    });

    // 2. Gerar permissões baseadas nas features do plano
    const planPermissions = planFeatures.flatMap(({ feature }) => {
      const defaultActions = feature.defaultActions ? JSON.parse(feature.defaultActions) : ['read'];
      
      return defaultActions.map((action: string) => ({
        action: action as any,
        subject: feature.key as any,
        inverted: false,
      }));
    });

    // 3. Buscar todos os grupos da empresa
    const companyGroups = await prisma.group.findMany({
      where: { companyId },
    });

    // 4. Atualizar cada grupo com as novas permissões
    for (const group of companyGroups) {
      // Remover permissões antigas
      await prisma.permission.deleteMany({
        where: { groupId: group.id },
      });

      // Adicionar novas permissões do plano
      if (planPermissions.length > 0) {
        await prisma.permission.createMany({
          data: planPermissions.map(permission => ({
            ...permission,
            groupId: group.id,
          })),
        });
      }

    }

  }

  /**
   * Buscar histórico de faturas/invoices da empresa
   */
  async getInvoices(userId: string): Promise<InvoiceResponseDto[]> {
    // Buscar usuário e empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    const companyId = user.company.id;

    // Buscar subscription da empresa
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      return []; // Retorna array vazio se não houver subscription
    }

    // Buscar invoices reais do Stripe
    const invoices: InvoiceResponseDto[] = [];

    // Só buscar invoices se tiver stripeSubscriptionId (subscription paga)
    if (subscription.stripeSubscriptionId) {
      try {
        // Buscar invoices do Stripe
        const stripeInvoices = await this.stripeService.stripe.invoices.list({
          subscription: subscription.stripeSubscriptionId,
          limit: 100,
        });

        // Converter invoices do Stripe para o formato do DTO
        for (const invoice of stripeInvoices.data) {
          // Só incluir invoices pagas ou pendentes (ignorar drafts)
          if (invoice.status === 'paid' || invoice.status === 'open') {
            invoices.push({
              id: invoice.id,
              date: new Date(invoice.created * 1000),
              amount: invoice.amount_paid || invoice.amount_due || 0,
              status: invoice.status === 'paid' ? 'PAID' : 'PENDING',
              description: invoice.description || `${subscription.plan.name} - ${new Date(invoice.created * 1000).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
              invoiceNumber: invoice.number || `INV-${invoice.id.slice(-8)}`,
              companyId,
              subscriptionId: subscription.id,
              createdAt: new Date(invoice.created * 1000),
            });
          }
        }
      } catch (error) {
        console.error('Erro ao buscar invoices do Stripe:', error);
        // Se falhar, retornar array vazio ao invés de dados mockados
      }
    }

    return invoices.reverse(); // Mais recentes primeiro
  }

  /**
   * Baixar PDF de uma fatura
   * Se houver stripeSubscriptionId, busca do Stripe
   * Caso contrário, gera PDF mockado
   */
  async downloadInvoicePdf(invoiceId: string, userId: string): Promise<string> {
    // Buscar usuário e empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    const companyId = user.company.id;

    // Buscar subscription da empresa
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true, company: true },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    // Se tiver stripeSubscriptionId, buscar invoice do Stripe
    if (subscription.stripeSubscriptionId) {
      try {
        // Buscar invoices do Stripe
        const invoices = await this.stripeService.stripe.invoices.list({
          subscription: subscription.stripeSubscriptionId,
          limit: 100,
        });

        // Encontrar a invoice específica (por enquanto, pegar a primeira)
        const stripeInvoice = invoices.data[0];

        if (stripeInvoice && stripeInvoice.invoice_pdf) {
          // Baixar o PDF do Stripe
          const response = await fetch(stripeInvoice.invoice_pdf);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Converter para base64
          return buffer.toString('base64');
        }
      } catch (error) {
        console.error('Erro ao buscar invoice do Stripe:', error);
        // Continua para gerar PDF mockado
      }
    }

    // Gerar PDF mockado (fallback)
    // TODO: Implementar geração de PDF com biblioteca como pdfkit ou puppeteer
    const pdfContent = this.generateMockInvoicePdf(subscription, invoiceId);
    return Buffer.from(pdfContent).toString('base64');
  }

  /**
   * Gerar PDF mockado de fatura
   * TODO: Substituir por geração real de PDF
   */
  private generateMockInvoicePdf(subscription: any, invoiceId: string): string {
    const company = subscription.company;
    const plan = subscription.plan;
    
    // Por enquanto, retorna um HTML simples que pode ser convertido em PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fatura ${invoiceId}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; }
    .invoice-info { margin-bottom: 30px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    .table th { background-color: #f4f4f4; }
    .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FATURA</h1>
    <p>Número: ${invoiceId}</p>
  </div>
  
  <div class="invoice-info">
    <h3>Dados do Cliente</h3>
    <p><strong>Empresa:</strong> ${company.name}</p>
    <p><strong>CNPJ:</strong> ${company.document}</p>
    <p><strong>Email:</strong> ${company.email}</p>
  </div>
  
  <table class="table">
    <thead>
      <tr>
        <th>Descrição</th>
        <th>Período</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${plan.name}</td>
        <td>${subscription.billingPeriod}</td>
        <td>R$ ${(plan.price / 100).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  
  <div class="total">
    <p>Total: R$ ${(plan.price / 100).toFixed(2)}</p>
  </div>
  
  <div style="margin-top: 40px; text-align: center; color: #666;">
    <p>Obrigado pela sua preferência!</p>
  </div>
</body>
</html>
    `;
    
    return html;
  }

  /**
   * Buscar histórico de uma assinatura
   */
  async getSubscriptionHistory(id: string, userId: string) {
    // Verificar permissão
    await this.findOne(id, userId);

    return this.historyService.getSubscriptionHistory(id);
  }

  /**
   * Buscar histórico de assinatura de uma empresa
   */
  async getCompanySubscriptionHistory(companyId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar permissão
    if (user.groupId !== 'admin' && user.companyId !== companyId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este histórico',
      );
    }

    return this.historyService.getCompanyHistory(companyId);
  }
}
