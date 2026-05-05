import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreatePartnerCustomerDto } from './dto/create-partner-customer.dto';
import { UpdatePartnerCustomerDto } from './dto/update-partner-customer.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PartnerService {
  constructor(private jwtService: JwtService) {}

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
