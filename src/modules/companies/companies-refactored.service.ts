import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';

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
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const {
      name,
      document,
      email,
      phone,
      password,
      companyName,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipCode,
      reference,
    } = dto;

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

    const hashedPassword = await bcrypt.hash(password, 10);

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

    const company = await prisma.$transaction(async (prisma) => {
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
        message = message.replace(/, $/, '');
        throw new BadRequestException(message);
      }

      const createdCompany = await prisma.company.create({
        data: {
          companyName,
          name,
          document,
          email,
          phone,
          active: true,
          onboardingCompleted: false,
          onboardingStep: 'SCHEDULE',
        },
      });

      await prisma.companyAddress.create({
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

      await prisma.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
          companyId: createdCompany.id,
          branchId: createdBranch.id,
          role: 'admin',
        },
      });

      const trialPlan = await prisma.plan.findFirst({
        where: {
          type: 'TRIAL',
          active: true,
        },
      });

      if (!trialPlan) {
        throw new BadRequestException(
          'Plano trial não encontrado. Configure um plano trial no sistema.',
        );
      }

      const now = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + (trialPlan.trialDays ?? 7));

      await prisma.subscription.create({
        data: {
          companyId: createdCompany.id,
          planId: trialPlan.id,
          status: 'ACTIVE',
          billingPeriod: trialPlan.billingPeriod, // Usar billingPeriod do plano
          startDate: now,
          endDate: trialEndDate,
          nextBillingDate: trialEndDate,
          notes: 'Trial de 7 dias - Criado automaticamente no cadastro',
        },
      });

      return createdCompany;
    });

    try {
      await this.mailService.sendWelcomeEmail(email, name, 7);
    } catch (error) {
      console.warn('Erro ao enviar email de boas-vindas:', error);
    }

    return company;
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
        subscription: {
          include: {
            plan: true,
          },
        },
        branches: {
          include: {
            openingHours: true,
            paymentMethods: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

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

    const hasPaymentMethods = company.branches.some(
      (branch) => branch.paymentMethods && branch.paymentMethods.length > 0,
    );

    if (!hasPaymentMethods) {
      await prisma.company.update({
        where: { id: companyId },
        data: { onboardingStep: 'PAYMENT' },
      });
      return {
        completed: false,
        currentStep: 'PAYMENT',
      };
    }

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
                paymentMethods: true,
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

    if (!company.subscription) {
      throw new BadRequestException('Plano não configurado');
    }

    const hasOpeningHours = company.branches.some(
      (branch) => !!branch.openingHours,
    );

    if (!hasOpeningHours) {
      throw new BadRequestException(
        'Horários de funcionamento não configurados',
      );
    }

    const hasSubdomain = company.branches.some((branch) => !!branch.subdomain);

    if (!hasSubdomain) {
      throw new BadRequestException('Domínio não configurado');
    }

    const hasPaymentMethods = company.branches.some(
      (branch) => branch.paymentMethods && branch.paymentMethods.length > 0,
    );

    if (!hasPaymentMethods) {
      throw new BadRequestException('Métodos de pagamento não configurados');
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        onboardingCompleted: true,
        onboardingStep: 'COMPLETED',
      },
    });

    return {
      success: true,
      message: 'Onboarding concluído com sucesso',
    };
  }
}
