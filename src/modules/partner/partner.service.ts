import { Injectable, NotFoundException, ConflictException, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreatePartnerCustomerDto } from './dto/create-partner-customer.dto';
import { UpdatePartnerCustomerDto } from './dto/update-partner-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { SubscriptionHistoryService } from '../subscription/subscription-history.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class PartnerService {
  constructor(
    private jwtService: JwtService, 
    private mailService: MailService,
    private subscriptionHistoryService: SubscriptionHistoryService,
    private whatsappService: WhatsAppService,
  ) {}

  // ─── Authentication ─────────────────────────────────────

  async login(email: string, password: string) {
    const partner = await prisma.partner.findUnique({
      where: { email },
    });

    if (!partner) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!partner.active) {
      throw new UnauthorizedException('Conta desativada');
    }

    const isPasswordValid = await bcrypt.compare(password, partner.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = {
      sub: partner.id,
      email: partner.email,
      partnerId: partner.id,
      type: 'partner',
      role: 'PARTNER',
    };

    const token = this.jwtService.sign(payload, { secret: process.env.PARTNER_JWT_SECRET || process.env.JWT_SECRET, expiresIn: '7d' });

    return {
      access_token: token,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        active: partner.active,
      },
    };
  }

  // ─── Partner CRUD ─────────────────────────────────────

  async createPartner(dto: CreatePartnerDto) {
    const existingPartner = await prisma.partner.findUnique({
      where: { email: dto.email },
    });

    if (existingPartner) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Gerar código único para o link de afiliado
    const code = await this.generateUniqueCode();

    const partner = await prisma.partner.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone,
        commission: dto.commission ?? 10,
        active: dto.active ?? true,
        code,
      },
    });

    const { password, ...partnerWithoutPassword } = partner;
    return partnerWithoutPassword;
  }

  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 100) {
      code = Math.random().toString(36).substring(2, 8).toLowerCase();
      const existing = await prisma.partner.findUnique({
        where: { code },
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Não foi possível gerar um código único após várias tentativas');
    }

    return code!;
  }

  async getPartnerByCode(code: string) {
    const partner = await prisma.partner.findUnique({
      where: { code },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        commission: true,
        active: true,
      },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    return partner;
  }

  async getPartnerCompanies(partnerId: string) {
    const companies = await prisma.company.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyName: true,
        email: true,
        phone: true,
        segment: true,
        document: true,
        active: true,
        onboardingCompleted: true,
        onboardingStep: true,
        createdAt: true,
        _count: {
          select: { branches: true },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                billingPeriod: true,
              },
            },
            currentPeriodEnd: true,
            trialEndsAt: true,
          },
        },
      },
    });

    return companies.map((company) => ({
      id: company.id,
      companyName: company.companyName,
      email: company.email,
      phone: company.phone,
      segment: company.segment,
      document: company.document,
      active: company.active,
      onboardingCompleted: company.onboardingCompleted,
      onboardingStep: company.onboardingStep,
      createdAt: company.createdAt,
      branchCount: company._count.branches,
      subscriptionStatus: company.subscription?.status || 'NONE',
      planName: company.subscription?.plan?.name || null,
      planPrice: company.subscription?.plan?.price || null,
      planBillingPeriod: company.subscription?.plan?.billingPeriod || null,
    }));
  }

  async getAvailablePlans() {
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        planFeatures: {
          include: {
            feature: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      billingPeriod: plan.billingPeriod,
      trialDays: plan.trialDays,
      type: plan.type,
      isTrial: plan.isTrial,
      features: plan.planFeatures.map(pf => ({
        name: pf.feature.name,
        description: pf.feature.description,
      })),
    }));
  }

  async activateClient(companyId: string, partnerId: string, planId?: string, withTrial?: boolean) {
    // Buscar a empresa
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: {
          include: {
            users: true,
          },
          take: 1,
        },
        groups: {
          take: 1,
        },
        subscription: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    if (company.partnerId !== partnerId) {
      throw new ForbiddenException('Esta empresa não pertence ao seu parceiro');
    }

    // Buscar o plano (usar o plano informado ou buscar trial)
    let plan;
    if (planId) {
      plan = await prisma.plan.findUnique({
        where: { id: planId },
      });
    } else {
      plan = await prisma.plan.findFirst({
        where: {
          type: 'TRIAL',
          active: true,
        },
      });
    }

    if (!plan) {
      throw new BadRequestException('Plano não encontrado');
    }

    // Se withTrial for false e o plano não for trial, usar plano direto sem trial
    const useTrial = withTrial !== false && (plan.type === 'TRIAL' || withTrial === true);

    // Criar grupo administrador com permissões do plano
    const planFeatures = await prisma.planFeature.findMany({
      where: { planId: plan.id },
      include: {
        feature: true,
      },
    });

    // Gerar permissões baseadas nas features do plano
    const trialPermissions = planFeatures.flatMap(({ feature }) => {
      const defaultActions = feature.defaultActions ? JSON.parse(feature.defaultActions) : ['read'];
      
      return defaultActions.map((action: string) => ({
        action: action as any,
        subject: feature.key as any,
        inverted: false,
      }));
    });

    const adminGroup = await prisma.group.create({
      data: {
        name: 'Administrador',
        branchId: company.branches[0].id,
        companyId: company.id,
        description: 'Grupo com acesso total às funcionalidades do plano',
        permissions: {
          create: trialPermissions,
        },
      },
    });

    // Verificar se já existe um usuário para a empresa
    let user = company.branches[0]?.users[0];
    let generatedPassword: string | null = null;

    if (!user) {
      // Gerar senha temporária
      generatedPassword = this.generateTemporaryPassword(company.email);

      // Criar usuário
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      user = await prisma.user.create({
        data: {
          name: company.name,
          email: company.email,
          password: hashedPassword,
          phone: company.phone,
          branchId: company.branches[0].id,
          companyId: company.id,
          groupId: adminGroup.id,
          active: true,
        },
      });
    } else {
      // Se usuário já existe, gerar nova senha
      generatedPassword = this.generateTemporaryPassword(company.email);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      user = await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, groupId: adminGroup.id },
      });
    }

    // Criar ou atualizar subscription
    const now = new Date();
    const trialDays = plan.trialDays ?? 7;
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    let subscription;
    if (!company.subscription) {
      // Se for plano pago com trial, criar com trial e integrar com Stripe
      if (plan.type !== 'TRIAL' && useTrial) {
        // TODO: Integrar com Stripe - criar checkout session
        // Por enquanto, cria subscription local com trial
        subscription = await prisma.subscription.create({
          data: {
            companyId: company.id,
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            startDate: now,
            trialEndsAt: trialEndDate,
            nextBillingDate: trialEndDate,
            notes: `Trial de ${trialDays} dias do plano ${plan.name} - Ativado pelo parceiro. Trial válido até ${trialEndDate.toLocaleDateString('pt-BR')}`,
          },
        });
      } else if (plan.type !== 'TRIAL' && !useTrial) {
        // Plano pago sem trial - integrar com Stripe
        // TODO: Integrar com Stripe - criar checkout session
        // Por enquanto, cria subscription local como ACTIVE
        subscription = await prisma.subscription.create({
          data: {
            companyId: company.id,
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            startDate: now,
            notes: `Plano ${plan.name} ativado manualmente pelo parceiro sem trial`,
          },
        });
      } else {
        // Plano trial
        subscription = await prisma.subscription.create({
          data: {
            companyId: company.id,
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            startDate: now,
            trialEndsAt: trialEndDate,
            nextBillingDate: trialEndDate,
            notes: `Trial de ${trialDays} dias - Criado automaticamente na ativação. Trial válido até ${trialEndDate.toLocaleDateString('pt-BR')}`,
          },
        });
      }
    } else {
      // Atualizar subscription existente
      if (plan.type !== 'TRIAL' && useTrial) {
        subscription = await prisma.subscription.update({
          where: { id: company.subscription.id },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            trialEndsAt: trialEndDate,
            nextBillingDate: trialEndDate,
            notes: `Trial de ${trialDays} dias do plano ${plan.name} - Atualizado pelo parceiro`,
          },
        });
      } else if (plan.type !== 'TRIAL' && !useTrial) {
        subscription = await prisma.subscription.update({
          where: { id: company.subscription.id },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            notes: `Plano ${plan.name} ativado manualmente pelo parceiro sem trial`,
          },
        });
      } else {
        subscription = await prisma.subscription.update({
          where: { id: company.subscription.id },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            billingPeriod: plan.billingPeriod,
            trialEndsAt: plan.type === 'TRIAL' ? trialEndDate : company.subscription.trialEndsAt,
            nextBillingDate: trialEndDate,
            notes: `Plano atualizado para ${plan.name} na ativação`,
          },
        });
      }
    }

    // Registrar no histórico
    try {
      await this.subscriptionHistoryService.createHistoryEntry({
        subscriptionId: subscription.id,
        eventType: 'CREATED',
        newPlanId: plan.id,
        newStatus: 'ACTIVE',
        newBillingPeriod: plan.billingPeriod,
        reason: plan.type === 'TRIAL' 
          ? 'Subscription trial criada automaticamente na ativação da empresa'
          : `Plano ${plan.name} ativado manualmente pelo parceiro`,
        metadata: {
          trialDays: plan.type === 'TRIAL' ? trialDays : undefined,
          trialEndsAt: plan.type === 'TRIAL' ? trialEndDate.toISOString() : undefined,
          companyName: company.name,
          partnerId,
        },
      });

      if (plan.type === 'TRIAL') {
        await this.subscriptionHistoryService.logTrialStarted(
          subscription.id,
          trialEndDate,
        );
      }
    } catch (historyError) {
      console.error('⚠️ Erro ao registrar histórico (não crítico):', historyError);
    }

    // Enviar email com credenciais
    try {
      await this.mailService.sendClientActivationEmail({
        email: company.email,
        companyName: company.companyName,
        userName: user.name,
        userEmail: user.email || company.email,
        password: generatedPassword!,
        adminUrl: `${process.env.FRONTEND_URL}/admin`,
      });
    } catch (error) {
      console.error('Erro ao enviar email de ativação:', error);
    }

    // Enviar WhatsApp com credenciais
    try {
      const whatsappMessage = `
🚀 *Acesso ao AnotaJá*

Olá ${user.name}!

Sua conta foi ativada com sucesso!

📧 *Email:* ${user.email}
🔑 *Senha:* ${generatedPassword}

🌐 *Acessar Painel Admin:* ${process.env.FRONTEND_URL}/admin

Se precisar de ajuda, entre em contato!
      `.trim();

      // Enviar via WhatsApp do parceiro se estiver conectado
      try {
        await this.whatsappService.sendMessage(company.phone, whatsappMessage, undefined, partnerId);
      } catch (whatsappError) {
        console.error('Erro ao enviar WhatsApp de ativação:', whatsappError);
      }
    } catch (error) {
      console.error('Erro ao preparar mensagem WhatsApp de ativação:', error);
    }

    return {
      success: true,
      message: 'Cliente ativado com sucesso',
      userEmail: user.email,
      password: generatedPassword,
    };
  }

  async resendCredentials(companyId: string, partnerId: string) {
    // Buscar a empresa e usuário
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: {
          include: {
            users: {
              where: { active: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    if (company.partnerId !== partnerId) {
      throw new ForbiddenException('Esta empresa não pertence ao seu parceiro');
    }

    const user = company.branches[0]?.users[0];
    if (!user) {
      throw new BadRequestException('Usuário não encontrado para esta empresa');
    }

    // Gerar nova senha temporária
    const generatedPassword = this.generateTemporaryPassword(user.email || undefined);
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Atualizar senha do usuário
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Enviar email com credenciais
    try {
      await this.mailService.sendClientActivationEmail({
        email: company.email,
        companyName: company.companyName,
        userName: user.name,
        userEmail: user.email || company.email,
        password: generatedPassword,
        adminUrl: `${process.env.FRONTEND_URL}/admin`,
      });
    } catch (error) {
      console.error('Erro ao enviar email de reenvio de credenciais:', error);
    }

    // Enviar WhatsApp com credenciais
    try {
      const whatsappMessage = `
🔐 *Credenciais de Acesso - AnotaJá*

Olá ${user.name}!

Suas credenciais foram redefinidas:

📧 *Email:* ${user.email}
🔑 *Nova Senha:* ${generatedPassword}

🌐 *Acessar Painel Admin:* ${process.env.FRONTEND_URL}/admin

Se precisar de ajuda, entre em contato!
      `.trim();

      // Enviar via WhatsApp do parceiro se estiver conectado
      try {
        await this.whatsappService.sendMessage(company.phone, whatsappMessage, undefined, partnerId);
      } catch (whatsappError) {
        console.error('Erro ao enviar WhatsApp de reenvio de credenciais:', whatsappError);
      }
    } catch (error) {
      console.error('Erro ao preparar mensagem WhatsApp de reenvio de credenciais:', error);
    }

    return {
      success: true,
      message: 'Credenciais reenviadas com sucesso',
      userEmail: user.email,
      password: generatedPassword,
    };
  }

  private generateTemporaryPassword(email?: string): string {
    if (email) {
      const emailLocalPart = email.split('@')[0];
      return `${emailLocalPart}123`;
    }
    return Math.random().toString(36).substring(2, 8) + '123';
  }

  async getAllPartners() {
    const partners = await prisma.partner.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    });

    return partners.map(({ password, ...partner }) => partner);
  }

  async getPartnerById(id: string) {
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const { password, ...partnerWithoutPassword } = partner;
    return partnerWithoutPassword;
  }

  async getPartnerReferralLink(partnerId: string) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        code: true,
        commission: true,
        active: true,
      },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const baseUrl = process.env.NEXT_PUBLIC_DOMAIN || 'http://localhost:3000';
    const referralLink = `${baseUrl}/register-company?partner=${partner.code}`;

    return {
      partner: {
        id: partner.id,
        name: partner.name,
        code: partner.code,
        commission: partner.commission,
        active: partner.active,
      },
      referralLink,
    };
  }

  async updatePartner(id: string, dto: UpdatePartnerDto) {
    const partner = await prisma.partner.findUnique({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const updatedPartner = await prisma.partner.update({
      where: { id },
      data: dto,
    });

    const { password, ...partnerWithoutPassword } = updatedPartner;
    return partnerWithoutPassword;
  }

  async updatePartnerPassword(id: string, currentPassword: string, newPassword: string) {
    const partner = await prisma.partner.findUnique({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, partner.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.partner.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async deletePartner(id: string) {
    const partner = await prisma.partner.findUnique({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    await prisma.partner.delete({
      where: { id },
    });

    return { message: 'Parceiro excluído com sucesso' };
  }

  async togglePartnerActive(id: string) {
    const partner = await prisma.partner.findUnique({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const updatedPartner = await prisma.partner.update({
      where: { id },
      data: { active: !partner.active },
    });

    const { password, ...partnerWithoutPassword } = updatedPartner;
    return partnerWithoutPassword;
  }

  async generatePartnerCode(id: string) {
    const partner = await prisma.partner.findUnique({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    if (partner.code) {
      return { code: partner.code };
    }

    const code = await this.generateUniqueCode();

    const updatedPartner = await prisma.partner.update({
      where: { id },
      data: { code },
    });

    return { code: updatedPartner.code };
  }

  // ─── Partner Customer CRUD ─────────────────────────────

  async createCustomer(partnerId: string, dto: CreatePartnerCustomerDto) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const customer = await prisma.partnerCustomer.create({
      data: {
        partnerId,
        companyName: dto.companyName,
        segment: dto.segment,
        phone: dto.phone,
        address: dto.address,
        hasSubscription: dto.hasSubscription ?? false,
        notes: dto.notes,
      },
    });

    return customer;
  }

  async getCustomersByPartner(partnerId: string, hasSubscription?: boolean) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const where: any = { partnerId };
    if (hasSubscription !== undefined) {
      where.hasSubscription = hasSubscription;
    }

    const customers = await prisma.partnerCustomer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return customers;
  }

  async getCustomerById(id: string) {
    const customer = await prisma.partnerCustomer.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return customer;
  }

  async updateCustomer(id: string, dto: UpdatePartnerCustomerDto) {
    const customer = await prisma.partnerCustomer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const updatedCustomer = await prisma.partnerCustomer.update({
      where: { id },
      data: dto,
    });

    return updatedCustomer;
  }

  async deleteCustomer(id: string) {
    const customer = await prisma.partnerCustomer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    await prisma.partnerCustomer.delete({
      where: { id },
    });

    return { message: 'Cliente excluído com sucesso' };
  }

  async toggleCustomerSubscription(id: string) {
    const customer = await prisma.partnerCustomer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const updatedCustomer = await prisma.partnerCustomer.update({
      where: { id },
      data: { hasSubscription: !customer.hasSubscription },
    });

    return updatedCustomer;
  }

  // ─── CSV Import ─────────────────────────────────────────

  async importCustomersFromCsv(partnerId: string, dto: ImportCustomersDto) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const lines = dto.csvContent.split('\n').filter(line => line.trim());
    const customers: Prisma.PartnerCustomerCreateManyInput[] = [];
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map(col => col.trim().replace(/^"|"$/g, ''));
      
      if (columns.length >= 4) {
        const [companyName, segment, phone, address, notes] = columns;
        
        if (companyName && segment && phone) {
          customers.push({
            partnerId,
            companyName,
            segment,
            phone,
            address: address || '',
            notes: notes || '',
            hasSubscription: false,
          });
        }
      }
    }

    if (customers.length === 0) {
      return { message: 'Nenhum cliente válido encontrado no CSV', imported: 0 };
    }

    await prisma.partnerCustomer.createMany({
      data: customers,
      skipDuplicates: true,
    });

    return { message: 'Clientes importados com sucesso', imported: customers.length };
  }
}
