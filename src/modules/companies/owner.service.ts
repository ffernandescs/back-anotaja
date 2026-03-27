import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOwnerDto, VerifyOwnerExistsDto } from './dto/create-owner.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { Prisma, User, Company, Branch, Plan, PlanType, OnboardingStep } from '@prisma/client';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OwnerService {
  constructor(
    private readonly geocodingService: GeocodingService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Cria um novo dono de loja com empresa e filial matriz
   */
  async createOwnerWithCompany(dto: CreateOwnerDto) {
    const {
      name,
      email,
      phone,
      password,
      cpf,
      companyName,
      document,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipCode,
      reference,
    } = dto;

    // ✅ Validações básicas
    if (!name || !email || !phone || !password || !companyName || !document) {
      throw new BadRequestException(
        'Todos os campos obrigatórios devem ser preenchidos.',
      );
    }

    // ✅ Verificar duplicidade de email, phone e document
    await this.validateUniqueConstraints(email, phone, document);

    // ✅ Obter plano trial (criar se não existir)
    const trialPlan = await this.getOrCreateTrialPlan();

    // ✅ Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar empresa
      const company = await tx.company.create({
        data: {
          name,
          companyName,
          document,
          email,
          phone,
          onboardingStep: OnboardingStep.PLAN,
          onboardingCompleted: false,
          subscription: {
            create: {
              planId: trialPlan.id,
              status: 'ACTIVE',
              trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
            },
          },
        },
      });

      // 2. Criar endereço da empresa
      await tx.companyAddress.create({
        data: {
          companyId: company.id,
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          zipCode,
          reference,
        },
      });

      // 3. Criar filial matriz
      const branch = await tx.branch.create({
        data: {
          branchName: 'Matriz',
          companyId: company.id,
          phone,
          email,
          document: 'MATRIZ-' + company.id,
          active: true,
        },
      });

      // 4. Criar grupo "Dono" nível company
      const ownerGroup = await tx.group.create({
        data: {
          name: 'Dono',
          description: 'Proprietário da empresa com acesso total',
          companyId: company.id,
          scope: 'COMPANY',
          isDefault: false,
        },
      });

      // 5. Criar permissões para o grupo Dono
      await this.createOwnerPermissions(tx, ownerGroup.id);

      // 6. Criar usuário dono
      const owner = await tx.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
          branchId: branch.id,
          groupId: ownerGroup.id,
          active: true,
        },
      });

      // 7. Criar contadores de uso iniciais
      await this.createInitialUsageCounters(tx, company.id);

      return {
        company,
        branch,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
        },
        subscription: {
          plan: trialPlan,
          trialEndsAt: result.company.subscription?.trialEndsAt,
        },
      };
    });

    // ✅ Enviar email de boas-vindas
    try {
      // Email opcional - não falha se não implementado
     
    } catch (error) {
      console.error('Erro ao enviar email de boas-vindas:', error);
      // Não falhar o cadastro se o email falhar
    }

    return {
      success: true,
      message: 'Empresa e usuário dono criados com sucesso!',
      data: {
        companyId: result.company.id,
        ownerId: result.owner.id,
        trialEndsAt: result.subscription.trialEndsAt,
        nextSteps: [
          'Complete seu cadastro básico',
          'Configure seus produtos',
          'Cadastre seus métodos de pagamento',
          'Comece a vender!',
        ],
      },
    };
  }

  /**
   * Verifica se já existe dono com os dados informados
   */
  async verifyOwnerExists(dto: VerifyOwnerExistsDto) {
    const { email, phone, document } = dto;

    if (!email && !phone && !document) {
      throw new BadRequestException(
        'Informe pelo menos um campo: email, phone ou document',
      );
    }

    const existingData: any = {};

    // Verificar usuário por email
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });
      if (existingUser) {
        existingData.email = existingUser;
      }
    }

    // Verificar usuário por phone
    if (phone) {
      const existingUser = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, phone: true, name: true },
      });
      if (existingUser) {
        existingData.phone = existingUser;
      }
    }

    // Verificar empresa por document
    if (document) {
      const existingCompany = await prisma.company.findUnique({
        where: { document },
        select: { id: true, document: true, name: true },
      });
      if (existingCompany) {
        existingData.document = existingCompany;
      }
    }

    return {
      exists: Object.keys(existingData).length > 0,
      data: existingData,
    };
  }

  /**
   * Obtém ou cria o plano trial
   */
  private async getOrCreateTrialPlan(): Promise<Plan> {
    let trialPlan = await prisma.plan.findFirst({
      where: { type: PlanType.TRIAL },
    });

    if (!trialPlan) {
      trialPlan = await prisma.plan.create({
        data: {
          name: 'Trial Gratuita',
          description: 'Período experimental de 7 dias',
          type: PlanType.TRIAL,
          price: 0,
          billingPeriod: 'MONTHLY',
          trialDays: 7,
          active: true,
          isTrial: true,
          isFeatured: false,
          // Criar limits básicos para trial como JSON
          limits: JSON.stringify({
            users: 2,
            products: 10,
            orders_per_month: 50,
            branches: 1,
          }),
          // Criar features básicas para trial
          planFeatures: {
            create: [
              { feature: { connect: { key: 'DASHBOARD' } } },
              { feature: { connect: { key: 'ORDERS' } } },
              { feature: { connect: { key: 'PRODUCTS' } } },
              { feature: { connect: { key: 'CATEGORIES' } } },
              { feature: { connect: { key: 'CUSTOMERS' } } },
              { feature: { connect: { key: 'REPORTS' } } },
            ],
          },
        },
      });
    }

    return trialPlan;
  }

  /**
   * Valida constraints únicas
   */
  private async validateUniqueConstraints(
    email: string,
    phone: string,
    document: string,
  ) {
    const conflicts: string[] = [];

    // Verificar email
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      conflicts.push('email');
    }

    // Verificar phone
    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });
    if (existingPhone) {
      conflicts.push('phone');
    }

    // Verificar document (CNPJ)
    const existingDocument = await prisma.company.findUnique({
      where: { document },
    });
    if (existingDocument) {
      conflicts.push('document');
    }

    if (conflicts.length > 0) {
      throw new BadRequestException(
        `Já existe cadastro com: ${conflicts.join(', ')}`,
      );
    }
  }

  /**
   * Cria permissões básicas para o dono
   */
  private async createOwnerPermissions(tx: Prisma.TransactionClient, groupId: string) {
    // Permissões completas para o dono
    const permissions = [
      // Dashboard
      { action: 'read', subject: 'DASHBOARD' },
      // Pedidos
      { action: 'create', subject: 'ORDER' },
      { action: 'read', subject: 'ORDER' },
      { action: 'update', subject: 'ORDER' },
      { action: 'delete', subject: 'ORDER' },
      { action: 'manage', subject: 'ORDER' },
      // Produtos
      { action: 'create', subject: 'PRODUCT' },
      { action: 'read', subject: 'PRODUCT' },
      { action: 'update', subject: 'PRODUCT' },
      { action: 'delete', subject: 'PRODUCT' },
      { action: 'manage', subject: 'PRODUCT' },
      // Categorias
      { action: 'create', subject: 'CATEGORY' },
      { action: 'read', subject: 'CATEGORY' },
      { action: 'update', subject: 'CATEGORY' },
      { action: 'delete', subject: 'CATEGORY' },
      { action: 'manage', subject: 'CATEGORY' },
      // Clientes
      { action: 'create', subject: 'CUSTOMER' },
      { action: 'read', subject: 'CUSTOMER' },
      { action: 'update', subject: 'CUSTOMER' },
      { action: 'delete', subject: 'CUSTOMER' },
      { action: 'manage', subject: 'CUSTOMER' },
      // Relatórios
      { action: 'read', subject: 'REPORT' },
      { action: 'manage', subject: 'REPORT' },
      // Usuários
      { action: 'create', subject: 'USER' },
      { action: 'read', subject: 'USER' },
      { action: 'update', subject: 'USER' },
      { action: 'delete', subject: 'USER' },
      { action: 'manage', subject: 'USER' },
      // Grupos
      { action: 'create', subject: 'GROUP' },
      { action: 'read', subject: 'GROUP' },
      { action: 'update', subject: 'GROUP' },
      { action: 'delete', subject: 'GROUP' },
      { action: 'manage', subject: 'GROUP' },
      // Filiais
      { action: 'create', subject: 'BRANCH' },
      { action: 'read', subject: 'BRANCH' },
      { action: 'update', subject: 'BRANCH' },
      { action: 'delete', subject: 'BRANCH' },
      { action: 'manage', subject: 'BRANCH' },
      // Assinatura
      { action: 'read', subject: 'SUBSCRIPTION' },
      { action: 'manage', subject: 'SUBSCRIPTION' },
      // Configurações
      { action: 'manage', subject: 'PROFILE' },
      { action: 'manage', subject: 'HOURS' },
      { action: 'manage', subject: 'PAYMENT' },
      { action: 'manage', subject: 'PAYMENT_METHOD' },
      { action: 'manage', subject: 'DELIVERY_AREA' },
    ];

    for (const permission of permissions) {
      await tx.permission.create({
        data: {
          groupId,
          action: permission.action as any,
          subject: permission.subject as any,
        },
      });
    }
  }

  /**
   * Cria contadores de uso iniciais
   */
  private async createInitialUsageCounters(
    tx: Prisma.TransactionClient,
    companyId: string,
  ) {
    const counters = [
      { resource: 'users', count: 1 }, // Dono já conta
      { resource: 'products', count: 0 },
      { resource: 'orders_this_month', count: 0 },
      { resource: 'branches', count: 1 }, // Matriz já conta
    ];

    for (const counter of counters) {
      await tx.usageCounter.create({
        data: {
          companyId,
          resource: counter.resource,
          count: counter.count,
          resetAt:
            counter.resource === 'orders_this_month'
              ? this.getNextMonthStart()
              : null,
        },
      });
    }
  }

  /**
   * Calcula início do próximo mês
   */
  private getNextMonthStart(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }
}
