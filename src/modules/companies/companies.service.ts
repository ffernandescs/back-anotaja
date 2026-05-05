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
import { CompanyInterestDto } from './dto/company-interest.dto';
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

 

  async verifyCompanyExist(dto: VerifyCompanyExistDto): Promise<{ exists: boolean; fields?: string[]; message?: string }> {
    const { phone, document, email } = dto;

    if (!phone && !document && !email) {
      return { exists: false };
    }

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
      const duplicateFields: string[] = [];
      if (company.phone === phone) duplicateFields.push('phone');
      if (company.email === email) duplicateFields.push('email');
      if (company.document === document) duplicateFields.push('document');

      const fieldLabels: Record<string, string> = {
        phone: 'telefone',
        email: 'email',
        document: 'documento',
      };

      const message = `Já existe uma empresa cadastrada com: ${duplicateFields.map(f => fieldLabels[f]).join(', ')}`;

      return { exists: true, fields: duplicateFields, message };
    }

    // Verificar também branches
    const branchOrConditions: Prisma.BranchWhereInput[] = [];

    if (phone) branchOrConditions.push({ phone });
    if (document) branchOrConditions.push({ document });
    if (email) branchOrConditions.push({ email });

    const branch = await prisma.branch.findFirst({
      where: {
        OR: branchOrConditions,
      },
    });

    if (branch) {
      const duplicateFields: string[] = [];
      if (branch.phone === phone) duplicateFields.push('phone');
      if (branch.email === email) duplicateFields.push('email');
      if (branch.document === document) duplicateFields.push('document');

      const fieldLabels: Record<string, string> = {
        phone: 'telefone',
        email: 'email',
        document: 'documento',
      };

      const message = `Já existe uma filial cadastrada com: ${duplicateFields.map(f => fieldLabels[f]).join(', ')}`;

      return { exists: true, fields: duplicateFields, message };
    }

    return { exists: false };
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
      partnerCode,
    } = dto;

    // Se houver código de parceiro, buscar o parceiro
    let partnerId: string | undefined;
    if (partnerCode) {
      const partner = await prisma.partner.findUnique({
        where: { code: partnerCode },
        select: { id: true },
      });

      if (partner) {
        partnerId = partner.id;
      }
    }

    // Validações básicas
    if (!name || !document || !email || !phone || !companyName) {
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
            active: false,
            onboardingCompleted: false,
            onboardingStep: 'SCHEDULE',
            ...(partnerId && { partnerId }),
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

      return {
        message: 'Empresa criada com sucesso',
        whatsapp: process.env.MASTER_WHATSAPP,
        partnerId: partnerId || null,
        companyId: company.createdCompany.id,
        company: company.createdCompany,
      };

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

  async registerCompanyInterest(dto: CompanyInterestDto) {
    try {
      let partnerId: string | undefined;

      // Se houver código de parceiro, buscar o parceiro
      if (dto.partnerCode) {
        const partner = await prisma.partner.findUnique({
          where: { code: dto.partnerCode },
          select: { id: true },
        });

        if (partner) {
          partnerId = partner.id;
        }
      }

      // Verificar duplicidade de document, email e phone em empresas e branches
      const existingCompany = await prisma.company.findFirst({
        where: {
          OR: [{ document: dto.document }, { email: dto.email }, { phone: dto.phone }],
        },
      });

      const existingBranch = await prisma.branch.findFirst({
        where: {
          OR: [{ document: dto.document }, { email: dto.email }, { phone: dto.phone }],
        },
      });

      if (existingCompany) {
        const duplicateFields: string[] = [];
        if (existingCompany.document === dto.document) duplicateFields.push('document');
        if (existingCompany.email === dto.email) duplicateFields.push('email');
        if (existingCompany.phone === dto.phone) duplicateFields.push('phone');

        const fieldLabels: Record<string, string> = {
          phone: 'telefone',
          email: 'email',
          document: 'documento',
        };

        const message = `Empresa já existe com: ${duplicateFields.map(f => fieldLabels[f]).join(', ')}`;
        throw new BadRequestException(message);
      }

      if (existingBranch) {
        const duplicateFields: string[] = [];
        if (existingBranch.document === dto.document) duplicateFields.push('document');
        if (existingBranch.email === dto.email) duplicateFields.push('email');
        if (existingBranch.phone === dto.phone) duplicateFields.push('phone');

        const fieldLabels: Record<string, string> = {
          phone: 'telefone',
          email: 'email',
          document: 'documento',
        };

        const message = `Filial já existe com: ${duplicateFields.map(f => fieldLabels[f]).join(', ')}`;
        throw new BadRequestException(message);
      }

      // Criar a empresa com a primeira branch
      const company = await prisma.$transaction(async (prisma) => {
        // Criar empresa
        const createdCompany = await prisma.company.create({
          data: {
            companyName: dto.companyName,
            name: dto.name,
            document: dto.document,
            email: dto.email,
            phone: dto.phone,
            segment: dto.segment,
            active: true,
            onboardingCompleted: false,
            onboardingStep: 'SCHEDULE',
            partnerId,
          },
        });

        // Criar endereço da empresa
        const createdCompanyAddress = await prisma.companyAddress.create({
          data: {
            street: dto.street,
            number: dto.number,
            complement: dto.complement,
            neighborhood: dto.neighborhood,
            city: dto.city,
            state: dto.state,
            zipCode: dto.zipCode,
            isDefault: true,
            reference: dto.reference,
            companyId: createdCompany.id,
          },
        });

        const createdBranchAddress = await prisma.branchAddress.create({
          data: {
            street: dto.street,
            number: dto.number,
            complement: dto.complement,
            neighborhood: dto.neighborhood,
            city: dto.city,
            state: dto.state,
            zipCode: dto.zipCode,
            reference: dto.reference,
            isDefault: true,
          },
        });

        // Criar branch
        const createdBranch = await prisma.branch.create({
          data: {
            branchName: createdCompany.companyName,
            phone: createdCompany.phone,
            document: dto.document,
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
      });

      // Enviar email com os dados do cliente para o master
      const emailSent = await this.mailService.sendCompanyInterestEmail(dto);

      if (!emailSent) {
        console.warn('Email de interesse não enviado, mas continuando com o processo');
      }

      const masterWhatsApp = process.env.MASTER_WHATSAPP || '5511999999999';

      return {
        success: true,
        message: 'Interesse registrado com sucesso. Entraremos em contato em breve.',
        whatsapp: masterWhatsApp,
        partnerId,
        companyId: company.createdCompany.id,
      };
    } catch (error) {
      console.error('Erro ao registrar interesse:', error);
      throw error;
    }
  }
}
