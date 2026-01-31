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

export type VerifyCompanyExistDto = {
  phone?: string;
  document?: string;
  email?: string;
};
@Injectable()
export class CompaniesService {
  constructor(private readonly geocodingService: GeocodingService) {}

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

    // ✅ Validações básicas
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

    // Buscar coordenadas do endereço
    const cleanZipCode = zipCode.replace(/-/g, '');
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const coordinates = await this.geocodingService.getCoordinates(
        street,
        number || '',
        city,
        cleanZipCode,
        state,
      );

      if (coordinates) {
        lat = coordinates.lat;
        lng = coordinates.lng;
      }
    } catch (error) {
      console.warn('Erro ao buscar coordenadas da empresa:', error);
    }

    const company = await prisma.$transaction(async (prisma) => {
      // ✅ Verificar duplicidade de document, email, phone e subdomain
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
      // 1️⃣ Criar empresa
      const createdCompany = await prisma.company.create({
        data: {
          companyName,
          name,
          document,
          email,
          phone,
          active: true,
          onboardingCompleted: false,
        },
      });

      // 2️⃣ Criar endereço da empresa
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
          lat,
          lng,
          isDefault: true,
        },
      });
      // 3️⃣ Criar branch
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

      // 4️⃣ Criar endereço da branch (opcional, se quiser outro endereço)

      // 5️⃣ Criar usuário admin
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

      return createdCompany;
    });

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
