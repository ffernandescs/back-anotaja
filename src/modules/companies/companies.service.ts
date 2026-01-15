import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class CompaniesService {
  async createCompany(dto: CreateCompanyDto) {
    const {
      name,
      document,
      email,
      phone,
      password,
      subdomain, // ✅ novo campo
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
    if (!name || !document || !email || !phone || !password || !subdomain) {
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

      const existingSubdomain = await prisma.branch.findFirst({
        where: { subdomain: subdomain },
      });
      if (existingSubdomain) {
        throw new BadRequestException('Subdomínio já está em uso');
      }

      // 1️⃣ Criar empresa
      const createdCompany = await prisma.company.create({
        data: { name, document, email, phone },
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
          isDefault: true,
        },
      });
      // 3️⃣ Criar branch
      const createdBranch = await prisma.branch.create({
        data: {
          name: createdCompany.name,
          phone: createdCompany.phone,
          document,
          companyId: createdCompany.id,
          addressId: createdBranchAddress.id,
          subdomain: subdomain,
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
}
