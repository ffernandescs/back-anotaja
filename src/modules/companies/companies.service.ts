import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import * as bcrypt from 'bcrypt';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';
import { SubscriptionHistoryService } from '../subscription/subscription-history.service';

export type VerifyCompanyExistDto = {
  phone?: string;
  document?: string;
  email?: string;
};
@Injectable()
export class CompaniesService {
  constructor(
    private readonly geocodingService: GeocodingService,
    private readonly mailService: MailService,
    private readonly historyService: SubscriptionHistoryService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const {
      name,
      document,
      email,
      phone,
      password,
      companyName,
      segment,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipCode,
      reference,
    } = dto;

    // Validações básicas
    if (!name || !document || !email || !phone || !password || !companyName) {
      throw new BadRequestException(
        'Todos os campos obrigatórios da empresa devem ser preenchidos.',
      );
    }

    if (!street || !neighborhood || !city || !state || !zipCode) {
      throw new BadRequestException(
        'Todos os campos obrigatórios do endereço devem ser preenchidos.',
      );
    }

    // Criptografar senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buscar coordenadas do endereço usando Nominatim (OpenStreetMap)
    const cleanZipCode = zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      // Tentar geocodificação com endereço completo primeiro
      const fullAddress = `${street}, ${number || ''} ${neighborhood || ''}, ${city}, ${state}, ${cleanZipCode}, Brasil`;
      
      const geocodeResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          fullAddress,
        )}&limit=1`,
        {
          headers: {
            'User-Agent': 'AnotaJa/1.0',
          },
        },
      );

      if (geocodeResponse.ok) {
        const geocodeData = await geocodeResponse.json();
        if (
          geocodeData &&
          geocodeData.length > 0 &&
          geocodeData[0].lat &&
          geocodeData[0].lon
        ) {
          lat = parseFloat(geocodeData[0].lat);
          lng = parseFloat(geocodeData[0].lon);
        }
      }

      // Se não conseguiu com endereço completo, tentar apenas com CEP
      if (!lat || !lng) {
        const cepGeocode = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZipCode}&country=Brasil&limit=1`,
          {
            headers: {
              'User-Agent': 'AnotaJa/1.0',
            },
          },
        );

        if (cepGeocode.ok) {
          const cepData = await cepGeocode.json();
          if (
            cepData &&
            cepData.length > 0 &&
            cepData[0].lat &&
            cepData[0].lon
          ) {
            lat = parseFloat(cepData[0].lat);
            lng = parseFloat(cepData[0].lon);
          }
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar coordenadas da empresa:', error);
    }

    try {
      const company = await prisma.$transaction(async (prisma) => {
        // Verificar duplicidade de document, email, phone e subdomain
        const existingCompany = await prisma.company.findFirst({
          where: {
            OR: [{ document }, { email }, { phone }],
          },
        });

        if (existingCompany) {
          let message = 'Empresa já existe com: ';
          if (existingCompany.document === document) message += 'documento, ';
          if (existingCompany.email === email) message += 'email, ';
          if (existingCompany.phone === phone) message += 'telefone, ';
          message = message.replace(/, $/, ''); // remove última vírgula
          throw new BadRequestException(message);
        }

        // Verificar duplicidade de email e phone na tabela User
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [{ email }, { phone }],
          },
        });

        if (existingUser) {
          let message = 'Usuário já existe com: ';
          if (existingUser.email === email) message += 'email, ';
          if (existingUser.phone === phone) message += 'telefone, ';
          message = message.replace(/, $/, ''); // remove última vírgula
          throw new BadRequestException(message);
        }

        // Criar empresa
        const createdCompany = await prisma.company.create({
          data: {
            companyName,
            name,
            document,
            email,
            phone,
            segment,
            active: true,
            onboardingCompleted: false,
            onboardingStep: 'SCHEDULE',
          },
        });

        // Criar endereço da empresa
        const createdCompanyAddress = await prisma.companyAddress.create({
          data: {
            street,
            number,
            complement,
            neighborhood,
            city,
            state,
            zipCode,
            isDefault: true,
            reference,
            lat,
            lng,
            companyId: createdCompany.id,
          },
        });

        const createdBranchAddress = await prisma.branchAddress.create({
          data: {
            street,
            number,
            complement,
            neighborhood,
            city,
            state,
            zipCode,
            reference,
            lat: lat ? Math.round(lat) : null,
            lng: lng ? Math.round(lng) : null,
            isDefault: true,
          },
        });

        // Criar branch com coordenadas
        const createdBranch = await prisma.branch.create({
          data: {
            branchName: createdCompany.companyName,
            phone: createdCompany.phone,
            document,
            latitude: lat,
            longitude: lng,
            companyId: createdCompany.id,
            addressId: createdBranchAddress.id,
          },
        });

        return {
          createdCompany,
          createdBranch,
          createdCompanyAddress,
          createdBranchAddress,
        };
      }, {
        timeout: 10000, // Aumentar timeout para 10 segundos
      });

      // Buscar plano trial FORA da transação
      const trialPlan = await prisma.plan.findFirst({
        where: {
          isTrial: true,
          active: true,
        },
      });

      if (!trialPlan) {
        throw new BadRequestException(
          'Plano trial não encontrado. Configure um plano trial no sistema.',
        );
      }

      // ✅ Criar grupo e subscription em transações separadas para evitar timeout
      const adminGroup = await prisma.$transaction(async (prisma) => {
        // 6️⃣ Criar grupo Administrador com permissões do plano trial
        const planFeatures = await prisma.planFeature.findMany({
          where: { planId: trialPlan.id },
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

        return await prisma.group.create({
          data: {
            name: 'Administrador',
            branchId: company.createdBranch.id,
            companyId: company.createdBranch.companyId,
            description: 'Grupo com acesso total às funcionalidades do plano',
            permissions: {
              create: trialPermissions,
            },
          },
        });
      }, {
        timeout: 10000,
      });

      // ✅ Criar usuário em transação separada
      await prisma.$transaction(async (prisma) => {
        await prisma.user.create({
          data: {
            name,
            email,
            phone,
            password: hashedPassword,
            companyId: company.createdCompany.id,
            branchId: company.createdBranch.id,
            groupId: adminGroup.id,
          },
        });

        // 8️⃣ Criar subscription trial automaticamente
        const now = new Date();
        const trialDays = trialPlan.trialDays ?? 7;

        // ✅ Trial termina exatamente `trialDays * 24h` após o cadastro.
        // Não manipular setHours(23,59,59) pois:
        //  - Isso empurra o fim para 23:59 do fuso local do servidor,
        //    tornando a janela real > 7 dias.
        //  - O frontend usa Math.ceil na diferença em ms, resultando em
        //    "8 dias" ao invés de 7.
        //  - O mesmo timestamp é enviado ao Stripe via `trial_end`,
        //    mantendo a fonte da verdade consistente.
        const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        const subscription = await prisma.subscription.create({
          data: {
            companyId: company.createdCompany.id,
            planId: trialPlan.id,
            status: 'ACTIVE',
            billingPeriod: trialPlan.billingPeriod,
            startDate: now,
            trialEndsAt: trialEndDate, // ✅ ESSENCIAL: Define quando o trial termina
            nextBillingDate: trialEndDate, // Primeira cobrança após trial
            notes: `Trial de ${trialDays} dias - Criado automaticamente no cadastro. Trial válido até ${trialEndDate.toLocaleDateString('pt-BR')}`,
          },
        });

        // Retornar dados para registrar histórico fora da transação
        return { subscription, trialDays, trialEndDate, companyName: company.createdCompany.name };
      }, {
        timeout: 10000,
      });

      // ✅ Registrar no histórico FORA da transação para evitar conflitos
      try {
        const { subscription: createdSubscription, trialDays, trialEndDate, companyName } = await prisma.subscription.findUniqueOrThrow({
          where: { companyId: company.createdCompany.id },
          select: { id: true }
        }).then(async (sub) => {
          return {
            subscription: sub,
            trialDays,
            trialEndDate,
            companyName: company.createdCompany.name
          };
        });

        await this.historyService.createHistoryEntry({
          subscriptionId: createdSubscription.id,
          eventType: 'CREATED',
          newPlanId: trialPlan.id,
          newStatus: 'ACTIVE',
          newBillingPeriod: trialPlan.billingPeriod,
          reason: 'Subscription trial criada automaticamente no cadastro da empresa',
          metadata: {
            trialDays,
            trialEndsAt: trialEndDate.toISOString(),
            companyName,
          },
        });

        await this.historyService.logTrialStarted(
          createdSubscription.id,
          trialEndDate,
        );
      } catch (historyError) {
        // Não bloquear criação da empresa se falhar o histórico
        console.error('⚠️ Erro ao registrar histórico (não crítico):', historyError);
      }

      // 7️⃣ Enviar email de boas-vindas (não bloqueia o cadastro se falhar)
      try {
        await this.mailService.sendWelcomeEmail(email, name, trialPlan.trialDays ?? 7);
      } catch (emailError) {
        console.error('Erro ao enviar email de boas-vindas:', emailError);
        // Não lança erro para não bloquear o cadastro
      }

      return company.createdCompany;

    } catch (error) {
      // A transação já fez rollback automaticamente
      // Apenas logamos o erro para diagnóstico
      console.error(' Erro ao criar empresa - transação desfeita:', error);
      
      // Se for erro de negócio (BadRequest), repassa
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Para outros erros, mensagem genérica
      throw new InternalServerErrorException(
        'Não foi possível criar a empresa. Por favor, tente novamente.'
      );
    }
  }

  async verifyCompanyExist(dto: VerifyCompanyExistDto): Promise<void> {
    const { phone, document, email } = dto;

    if (!phone && !document && !email) return;

    const orConditions: Prisma.CompanyWhereInput[] = [];

    if (phone) orConditions.push({ phone });
    if (document) orConditions.push({ document });
    if (email) orConditions.push({ email });

    const company = await prisma.company.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (company) {
      throw new BadRequestException(
        'Já existe uma empresa cadastrada com estes dados',
      );
    }
  }

  async getOnboardingStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branch) {
      throw new NotFoundException('Usuário ou filial não encontrada');
    }

    const companyId = user.companyId;
    if (!companyId) {
      throw new NotFoundException('Empresa não encontrada');
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscription: true,
        branches: {
          include: {
            openingHours: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // ✅ Se já concluiu
    if (company.onboardingCompleted) {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'COMPLETED' },
      });
      return {
        completed: true,
        currentStep: 'COMPLETED',
      };
    }

    // 1️⃣ Plano
    if (!company.subscription) {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'PLAN' },
      });
      return {
        completed: false,
        currentStep: 'PLAN',
      };
    }

    // 2️⃣ Horários
    const hasOpeningHours = company.branches.some(
      (branch) => branch.openingHours && branch.openingHours.length > 0,
    );

    if (!hasOpeningHours) {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'SCHEDULE' },
      });
      return {
        completed: false,
        currentStep: 'SCHEDULE',
      };
    }

    // 3️⃣ Domínio
    const hasSubdomain = company.branches.some((branch) => !!branch.subdomain);

    if (!hasSubdomain) {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'DOMAIN' },
      });
      return {
        completed: false,
        currentStep: 'DOMAIN',
      };
    }

    // 4️⃣ Pagamento
    if (!company.subscription || company.subscription.status !== 'ACTIVE') {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'PAYMENT' },
      });
      return {
        completed: false,
        currentStep: 'PAYMENT',
      };
    }

    // ✅ Tudo OK
    return {
      completed: true,
      currentStep: 'COMPLETED',
    };
  }

  async completeOnboarding(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            subscription: true,
            branches: {
              select: {
                openingHours: true,
                subdomain: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    const company = user.company;

    if (company.onboardingCompleted) {
      throw new BadRequestException('Onboarding já foi concluído');
    }

    // 1️⃣ Plano
    if (!company.subscription) {
      throw new BadRequestException('Plano não configurado');
    }

    // 2️⃣ Horários
    const hasOpeningHours = company.branches.some(
      (branch) => !!branch.openingHours,
    );

    if (!hasOpeningHours) {
      throw new BadRequestException(
        'Horários de funcionamento não configurados',
      );
    }

    // 3️⃣ Domínio
    const hasSubdomain = company.branches.some((branch) => !!branch.subdomain);

    if (!hasSubdomain) {
      throw new BadRequestException('Domínio não configurado');
    }

    // 4️⃣ Pagamento
    if (company.subscription.status !== 'ACTIVE') {
      throw new BadRequestException('Pagamento não concluído');
    }

    // ✅ Finaliza onboarding
    await prisma.company.update({
      where: { id: company.id },
      data: {
        onboardingCompleted: true,
      },
    });

    return {
      success: true,
      message: 'Onboarding concluído com sucesso',
    };
  }
}
