import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class MasterService {
  /**
   * Busca configurações do master
   */
  async getConfig() {
    // Busca configurações de branding e outras configs globais
    const masterUser = await this.getFirstMasterUser();
    if (!masterUser) {
      return {
        configs: {
          ifood_client_id: null,
          ifood_client_secret: null,
          ninetynine_food_api_key: null,
          strapi_url: null,
          strapi_api_token: null,
          strapi_webhook_secret: null,
          strapi_enabled: false,
        },
      };
    }

    const branding = await this.getBranding(masterUser.id);

    return {
      configs: {
        ifood_client_id: null,
        ifood_client_secret: null,
        ninetynine_food_api_key: null,
        strapi_url: null,
        strapi_api_token: null,
        strapi_webhook_secret: null,
        strapi_enabled: false,
      },
      branding,
    };
  }

  /**
   * Atualiza configurações do master
   */
  async updateConfig(configs: any) {
    const masterUser = await this.getFirstMasterUser();
    if (!masterUser) {
      throw new NotFoundException('Master user não encontrado');
    }

    // Por enquanto, apenas atualizamos o branding
    // As configs globais podem ser expandidas no futuro
    if (configs.strapi_url || configs.strapi_api_token || configs.strapi_webhook_secret !== undefined) {
      // Aqui poderíamos salvar configs em uma tabela separada
      // Por enquanto, apenas logamos
      console.log('Configurações do Strapi recebidas:', configs);
    }

    return { success: true };
  }

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
   * Busca o primeiro master user (para endpoint público)
   */
  async getFirstMasterUser() {
    const masterUser = await prisma.masterUser.findFirst({
      where: { active: true },
    });
    return masterUser;
  }

  /**
   * Busca o branding do master (logos, favicon, cores)
   */
  async getBranding(masterUserId: string) {
    const branding = await prisma.masterBranding.findUnique({
      where: { masterUserId },
    });

    if (!branding) {
      // Retorna branding padrão se não existir
      return {
        logoUrl: null,
        faviconUrl: null,
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        appName: null,
      };
    }

    return branding;
  }

  /**
   * Atualiza o branding do master
   */
  async updateBranding(masterUserId: string, data: {
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    appName?: string;
  }) {
    const branding = await prisma.masterBranding.upsert({
      where: { masterUserId },
      update: data,
      create: {
        masterUserId,
        ...data,
      },
    });

    return branding;
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

  async getSystemConfigs(): Promise<{ configs: Record<string, string | null> }> {
    const rows = await prisma.systemConfig.findMany();
    const configs: Record<string, string | null> = {};
    for (const row of rows) {
      configs[row.key] = row.value ?? null;
    }
    return { configs };
  }

  async setSystemConfigs(
    configs: Record<string, string | null>,
  ): Promise<{ configs: Record<string, string | null> }> {
    for (const [key, value] of Object.entries(configs)) {
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value: value ?? undefined },
        create: { key, value: value ?? undefined },
      });
    }
    return this.getSystemConfigs();
  }
}
