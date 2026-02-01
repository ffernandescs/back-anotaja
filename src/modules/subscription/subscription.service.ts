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
import { InvoiceResponseDto } from './dto/invoice-response.dto';

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

    // Por enquanto, retornar dados mockados
    // TODO: Integrar com Stripe para buscar invoices reais
    const invoices: InvoiceResponseDto[] = [];

    // Se não for trial, gerar invoices mockados baseados na data de início
    if (subscription.plan.type !== 'TRIAL') {
      const startDate = new Date(subscription.startDate);
      const now = new Date();
      let currentDate = new Date(startDate);
      let invoiceCount = 1;

      while (currentDate <= now) {
        invoices.push({
          id: `inv_${invoiceCount}`,
          date: new Date(currentDate),
          amount: subscription.plan.price,
          status: 'PAID',
          description: `${subscription.plan.name} - ${currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
          invoiceNumber: `INV-${currentDate.getFullYear()}-${String(invoiceCount).padStart(3, '0')}`,
          companyId,
          subscriptionId: subscription.id,
          createdAt: new Date(currentDate),
        });

        // Avançar para o próximo período
        if (subscription.billingPeriod === 'MONTHLY') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        } else if (subscription.billingPeriod === 'SEMESTRAL') {
          currentDate.setMonth(currentDate.getMonth() + 6);
        } else if (subscription.billingPeriod === 'ANNUAL') {
          currentDate.setFullYear(currentDate.getFullYear() + 1);
        }

        invoiceCount++;
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
}
