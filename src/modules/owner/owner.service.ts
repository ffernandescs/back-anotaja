import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOwnerDto, VerifyOwnerExistsDto } from './dto/create-owner.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OwnerService {
  constructor(
    private readonly mailService: MailService,
  ) {}

  /**
   * Cria um novo owner (superusuário) usando MasterUser
   */
  async createOwner(dto: CreateOwnerDto) {
    const { name, email, password, cpf, description } = dto;

    // ✅ Validações básicas
    if (!name || !email || !password) {
      throw new BadRequestException(
        'Nome, email e senha são obrigatórios.',
      );
    }

    // ✅ Verificar duplicidade de email
    const existingMasterUser = await prisma.masterUser.findUnique({
      where: { email },
    });

    if (existingMasterUser) {
      throw new BadRequestException('Email já cadastrado como owner');
    }

    // ✅ Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Criar MasterUser (owner)
    const owner = await prisma.masterUser.create({
      data: {
        name,
        email,
        password: hashedPassword,
        active: true,
      },
    });

    // ✅ Enviar email de boas-vindas
    try {
      if (this.mailService.sendWelcomeEmail) {
        await this.mailService.sendWelcomeEmail(
          owner.email,
          owner.name,
          0, // Sem trial para owner
        );
      }
    } catch (error) {
      console.error('Erro ao enviar email de boas-vindas:', error);
      // Não falhar o cadastro se o email falhar
    }

    return {
      success: true,
      message: 'Owner criado com sucesso!',
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        active: owner.active,
        createdAt: owner.createdAt,
        nextSteps: [
          'Acesse o sistema com suas credenciais',
          'Visualize todas as empresas cadastradas',
          'Gerencie assinaturas e planos',
          'Monitore o sistema',
        ],
      },
    };
  }

  /**
   * Verifica se já existe owner com os dados informados
   */
  async verifyOwnerExists(dto: VerifyOwnerExistsDto) {
    const { email, phone } = dto;

    if (!email && !phone) {
      throw new BadRequestException(
        'Informe pelo menos um campo: email ou phone',
      );
    }

    const existingData: any = {};

    // Verificar MasterUser por email
    if (email) {
      const existingOwner = await prisma.masterUser.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });
      if (existingOwner) {
        existingData.email = existingOwner;
      }
    }

    // Phone não existe em MasterUser, mas verificamos se necessário
    if (phone) {
      existingData.phone = {
        message: 'MasterUser não possui campo phone',
      };
    }

    return {
      exists: Object.keys(existingData).length > 0,
      data: existingData,
    };
  }

  /**
   * Lista todos os owners (MasterUsers)
   */
  async findAll() {
    const owners = await prisma.masterUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: owners,
      total: owners.length,
    };
  }

  /**
   * Busca owner por ID
   */
  async findById(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    return {
      success: true,
      data: owner,
    };
  }

  /**
   * Ativa/desativa owner
   */
  async toggleActive(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    const updatedOwner = await prisma.masterUser.update({
      where: { id },
      data: { active: !owner.active },
    });

    return {
      success: true,
      message: `Owner ${updatedOwner.active ? 'ativado' : 'desativado'} com sucesso`,
      data: {
        id: updatedOwner.id,
        name: updatedOwner.name,
        email: updatedOwner.email,
        active: updatedOwner.active,
      },
    };
  }

  /**
   * Remove owner
   */
  async remove(id: string) {
    const owner = await prisma.masterUser.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException('Owner não encontrado');
    }

    await prisma.masterUser.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Owner removido com sucesso',
    };
  }
}
