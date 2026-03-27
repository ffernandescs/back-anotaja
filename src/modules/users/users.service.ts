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
import { PlanType } from '../../ability/types/ability.types';

/**
 * Busca limites do plano diretamente da tabela FeatureLimit (100% dinâmico e genérico)
 */
async function getPlanLimits(planType: PlanType) {
  // Primeiro buscar o plano para pegar o ID
  const plan = await prisma.plan.findFirst({
    where: { type: planType, active: true }
  });

  if (!plan) {
    console.warn(`⚠️ Plano ${planType} não encontrado no banco`);
    // ✅ Retornar objeto vazio - sem restrições
    return {};
  }

  try {
    // Buscar limites da tabela FeatureLimit
    const featureLimits = await prisma.featureLimit.findMany({
      where: { 
        planId: plan.id,
        isActive: true 
      },
      include: {
        feature: {
          select: { key: true, name: true }
        }
      }
    });

    if (featureLimits.length === 0) {
      console.warn(`⚠️ Plano ${planType} não possui limites configurados na tabela FeatureLimit, sem restrições`);
      // ✅ Retornar objeto vazio - sem restrições
      return {};
    }

    // Montar objeto de limites genérico
    const limits: any = {};
    featureLimits.forEach(limit => {
      limits[limit.featureKey] = {
        featureKey: limit.featureKey,
        name: limit.name,
        description: limit.description,
        maxValue: limit.maxValue,
        unit: limit.unit,
        isActive: limit.isActive,
        createdAt: limit.createdAt,
        updatedAt: limit.updatedAt
      };
    });

    return limits;
    
  } catch (error) {
    console.warn(`⚠️ Erro ao buscar limites do plano ${planType}:`, error);
    // ✅ Retornar objeto vazio - sem restrições
    return {};
  }
}

@Injectable()
export class UsersService {
  async create(createUserDto: CreateUserDto, userId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    console.log(user, 'user');

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
        const planType = company.subscription.plan.type as PlanType;
        const limits = await getPlanLimits(planType);
        
        const currentUsersCount = await prisma.user.count({
          where: { companyId: createUserDto.companyId }
        });

        // Criar mapa de limites para validação (dinâmico do banco)
        const limitsMap = new Map<string, number>();
        Object.entries(limits).forEach(([key, value]) => {
          if (typeof value === 'number') {
            limitsMap.set(key, value);
          }
        });
        
        console.log(`🔍 Validating user count against limit:`, limitsMap.get('maxUsers'));

        if (currentUsersCount >= limits.maxUsers) {
          throw new ForbiddenException(
            `Limite de usuários atingido para o plano ${planType} (${limits.maxUsers}).`
          );
        }
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
        group: true,
        permissions: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Processar limites para todos os usuários da lista
    const processedUsers = await Promise.all(
      users.map(async (user, index) => {
        if (user.active && user.companyId) {
          const planType = user.company?.subscription?.plan?.type as PlanType;
          if (planType) {
            const limits = await getPlanLimits(planType);
            
            // Contar quantos usuários ATIVOS existem ANTES deste na lista (já ordenada por createdAt)
            const activeUsersBefore = users.slice(0, index).filter(u => u.active).length;

            if (activeUsersBefore >= limits.maxUsers) {
              return { ...user, active: false, _excess: true };
            }
          }
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
        group: true,
        permissions: true
      }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Validar se o usuário deve estar ativo com base no limite do plano
    if (user.active && user.companyId) {
      const planType = user.company?.subscription?.plan?.type as PlanType;
      if (planType) {
        const limits = await getPlanLimits(planType);
        
        // Contar quantos usuários ATIVOS foram criados ANTES deste (ordem de criação)
        const activeUsersBeforeCount = await prisma.user.count({
          where: { 
            companyId: user.companyId,
            active: true,
            createdAt: { lt: user.createdAt }
          }
        });

        if (activeUsersBeforeCount >= limits.maxUsers) {
          // Este usuário excede o limite, deve ser considerado inativo
          return { ...user, active: false, _excess: true };
        }
      }
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
      const planType = user.company?.subscription?.plan?.type as PlanType;
      if (planType) {
        const limits = await getPlanLimits(planType);
        
        // Contar quantos usuários ATIVOS foram criados ANTES deste (ordem de criação)
        const activeUsersBeforeCount = await prisma.user.count({
          where: { 
            companyId: user.companyId,
            active: true,
            createdAt: { lt: user.createdAt }
          }
        });

        if (activeUsersBeforeCount >= limits.maxUsers) {
          // Este usuário excede o limite, deve ser considerado inativo
          user.active = false;
        }
      }
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
