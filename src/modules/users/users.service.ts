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
import { PLAN_LIMITS } from '../../ability/factory/plan-rules';


@Injectable()
export class UsersService {
  async create(createUserDto: CreateUserDto, userId?:string) {


    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true, company: true },
    });

    console.log(user,'user')

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
        }
      });

      if (company?.subscription?.plan) {
        const planType = company.subscription.plan.type as PlanType;
        const limits = PLAN_LIMITS[planType];
        
        const currentUsersCount = await prisma.user.count({
          where: { companyId: createUserDto.companyId }
        });

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
        group: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Processar limites para todos os usuários da lista
    return users.map((user, index) => {
      if (user.active && user.companyId) {
        const planType = user.company?.subscription?.plan?.type as PlanType;
        if (planType) {
          const limits = PLAN_LIMITS[planType];
          
          // Contar quantos usuários ATIVOS existem ANTES deste na lista (já ordenada por createdAt)
          const activeUsersBefore = users.slice(0, index).filter(u => u.active).length;

          if (activeUsersBefore >= limits.maxUsers) {
            return { ...user, active: false, _excess: true };
          }
        }
      }
      return user;
    });
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
        group:true
      }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Validar se o usuário deve estar ativo com base no limite do plano
    if (user.active && user.companyId) {
      const planType = user.company?.subscription?.plan?.type as PlanType;
      if (planType) {
        const limits = PLAN_LIMITS[planType];
        
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
        group:true
      }
    });
  }

  async findByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // 1. Se estiver tentando ATIVAR um usuário, validar limite
    if (updateUserDto.active === true && !user.active && user.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        include: {
          subscription: {
            include: { plan: true }
          }
        }
      });

      if (company?.subscription?.plan) {
        const planType = company.subscription.plan.type as PlanType;
        const limits = PLAN_LIMITS[planType];
        
        const currentActiveUsersCount = await prisma.user.count({
          where: { 
            companyId: user.companyId,
            active: true
          }
        });

        if (currentActiveUsersCount >= limits.maxUsers) {
          throw new ForbiddenException(
            `Não é possível ativar este usuário. O limite de usuários ativos para o plano ${planType} (${limits.maxUsers}) já foi atingido.`
          );
        }
      }
    }

    // Preparar dados de update, tipado corretamente
    const updateData: Prisma.UserUpdateInput = {
      ...updateUserDto,
      // Hash da senha se fornecida
      password: updateUserDto.password
        ? await bcrypt.hash(updateUserDto.password, 10)
        : undefined,
      // Se quiser atualizar empresa ou branch
      company: updateUserDto.companyId
        ? { connect: { id: updateUserDto.companyId } }
        : undefined,
      branch: updateUserDto.branchId
        ? { connect: { id: updateUserDto.branchId } }
        : undefined,
    };

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        groupId: true,
        companyId: true,
        branchId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        password: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return prisma.user.delete({
      where: { id },
    });
  }
}
