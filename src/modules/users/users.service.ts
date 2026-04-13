import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { Prisma, User } from '@prisma/client';

/**
 * Busca limites do plano diretamente da tabela FeatureLimit (100% dinâmico e genérico)
 */


@Injectable()
export class UsersService {
  async create(createUserDto: CreateUserDto, userId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.companyId) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    if (!user.branchId) {
      throw new ForbiddenException('Usuário não está associado a uma filial');
    }

    // 1. Validar Limite de Usuários (se companyId estiver presente)
    if (createUserDto.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        include: {
          subscription: {
            include: { plan: true }
          }
        },
      });

      if (company?.subscription?.plan) {
        
        const currentUsersCount = await prisma.user.count({
          where: { companyId: createUserDto.companyId }
        });

        // Criar mapa de limites para validação (dinâmico do banco)
        const limitsMap = new Map<string, number>();
        
        

        
      }
    }

    // Verificar se email já existe (se fornecido)
    if (createUserDto.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email já está em uso');
      }
    }

    // Verificar se phone já existe
    const existingUserByPhone = await prisma.user.findUnique({
      where: { phone: createUserDto.phone },
    });

    if (existingUserByPhone) {
      throw new ConflictException('Telefone já está em uso');
    }

    // Preparar dados para criação - tipagem correta
    const data: Prisma.UserCreateInput = {
      name: createUserDto.name,
      email: createUserDto.email,
      phone: createUserDto.phone,
      group: createUserDto.groupId
        ? { connect: { id: createUserDto.groupId } }
        : undefined,
      company: user.companyId
        ? { connect: { id: user.companyId } }
        : undefined,
      branch: user.branchId
        ? { connect: { id: user.branchId } }
        : undefined,
      active: createUserDto.active ?? true,
      password: createUserDto.password
        ? await bcrypt.hash(createUserDto.password, 10)
        : undefined,
      // Adicionar permissões se fornecidas
      permissions: createUserDto.permissions && createUserDto.permissions.length > 0
        ? {
            create: createUserDto.permissions.map(perm => ({
              action: perm.action as any,
              subject: perm.subject as any,
              inverted: perm.inverted ?? false,
            })),
          }
        : undefined,
    };

    return prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        group: true,
        companyId: true,
        branchId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(companyId?: string) {
    const where: Prisma.UserWhereInput = companyId ? { companyId } : {};
    
    const users = await prisma.user.findMany({
      where,
      include: {
        company: {
          include: {
            subscription: {
              include: { plan: true }
            }
          }
        },
        group: {
          include: {
            permissions:true
          }
        },
        permissions: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Processar limites para todos os usuários da lista
    const processedUsers = await Promise.all(
      users.map(async (user, index) => {
        if (user.active && user.companyId) {
          
        }
        return user;
      })
    );

    return processedUsers;
  }

  async findOne(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          include: {
            subscription: {
              include: { plan: true }
            }
          }
        },
         group: {
          include: {
            permissions:true
          }
        },
        permissions: true
      }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Validar se o usuário deve estar ativo com base no limite do plano
    if (user.active && user.companyId) {
      
    }

    return user;
  }

  async findByEmail(email: string) {
    if (!email) return null;
    return prisma.user.findUnique({
      where: { email },
      include: {
        group: {
          include: {
            permissions: true
          }
        },
        permissions: true
      }
    });
  }

  async findByPhone(phone: string) {
    if (!phone) return null;
    return prisma.user.findUnique({
      where: { phone },
      include: {
        group: {
          include: {
            permissions: true
          }
        },
        permissions: true
      }
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          include: {
            subscription: {
              include: { plan: true }
            }
          }
        },
        group: true,
        permissions: true
      }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Validar se o usuário deve estar ativo com base no limite do plano
    if (user.active && user.companyId) {
      
    }

    // Preparar dados para atualização
    const data: Prisma.UserUpdateInput = {
      name: updateUserDto.name,
      email: updateUserDto.email,
      phone: updateUserDto.phone,
      group: updateUserDto.groupId
        ? { connect: { id: updateUserDto.groupId } }
        : undefined,
      branch: updateUserDto.branchId
        ? { connect: { id: updateUserDto.branchId } }
        : undefined,
      active: updateUserDto.active,
      password: updateUserDto.password
        ? await bcrypt.hash(updateUserDto.password, 10)
        : undefined,
      // Adicionar permissões se fornecidas
      permissions: updateUserDto.permissions && updateUserDto.permissions.length > 0
        ? {
          deleteMany: user.permissions.map(perm => ({ id: perm.id })),
          create: updateUserDto.permissions.map(perm => ({
            action: perm.action as any,
            subject: perm.subject as any,
            inverted: perm.inverted ?? false,
          })),
        }
        : undefined,
    };

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
      include: {
        company: {
          include: {
            subscription: {
              include: { plan: true }
            }
          }
        },
        group: true,
        permissions: true
      }
    });

    return updatedUser;
  }

  async remove(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Remover referências do usuário
    await prisma.user.update({
      where: { id },
      data: {
        group: user.groupId ? { disconnect: true } : undefined,
        company: user.companyId ? { disconnect: true } : undefined,
        branch: user.branchId ? { disconnect: true } : undefined,
      }
    });

    return prisma.user.delete({
      where: { id }
    });
  }
}
