import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { Prisma, User } from '@prisma/client';
@Injectable()
export class UsersService {
  async create(createUserDto: CreateUserDto) {
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
      role: createUserDto.role ?? 'USER',
      company: createUserDto.companyId
        ? { connect: { id: createUserDto.companyId } }
        : undefined,
      branch: createUserDto.branchId
        ? { connect: { id: createUserDto.branchId } }
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
        role: true,
        companyId: true,
        branchId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        companyId: true,
        branchId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        companyId: true,
        branchId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async findByEmail(email: string) {
    if (!email) return null;
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.findOne(id);

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
        role: true,
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
