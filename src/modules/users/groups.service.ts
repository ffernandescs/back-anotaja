import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { prisma } from '../../../lib/prisma';
import { Action, Subject } from '../../ability/types/ability.types';
import { PermissionAction, PermissionSubject, Prisma } from '@prisma/client';

@Injectable()
export class GroupsService {
 async create(createGroupDto: CreateGroupDto, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      branch: true, // Incluir branch para acessar companyId
    },
  });

  if (!user) {
    throw new NotFoundException('Usuário não encontrado');
  }

  if (!user.branchId) {
    throw new ForbiddenException('Usuário não possui filial associada');
  }

  if (!user.branch?.companyId) {
    throw new ForbiddenException('Filial não possui empresa associada');
  }

  // Verificar duplicidade de nome
  const existingGroup = await prisma.group.findFirst({
    where: {
      name: createGroupDto.name,
      branchId: user.branchId,
    },
  });

  if (existingGroup) {
    throw new ConflictException('Já existe um grupo com este nome nesta filial');
  }

  // Criar grupo com permissões
 const newGroup = await prisma.group.create({
  data: {
    name: createGroupDto.name,
    description: createGroupDto.description,
    branchId: user.branchId,
    companyId: user.branch.companyId, // Campo obrigatório adicionado
    permissions: {
      create: createGroupDto.permissions.map((p) => ({
        action: p.action as unknown as PermissionAction,
        subject: p.subject as unknown as PermissionSubject,
        inverted: p.inverted ?? false,
      })),
    },
  },
  include: {
    permissions: true,
  },
});

  return newGroup;
}

    async findAll(userId: string) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if(!user.branchId) {
        throw new ForbiddenException('Usuário não possui filial associada');
      }
    

    return prisma.group.findMany({
      where: {
        branchId: user.branchId,
      },
      orderBy: {
        name: 'asc',
      },
      include: {
        permissions: true,
        users:true,
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if(!user.branchId) {
      throw new ForbiddenException('Usuário não possui filial associada');
    }
    const group = await prisma.group.findFirst({
      where: {
        id,
        branchId: user.branchId ,
      },
      include: {
        permissions: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    return group;
  }

  async update(id: string, updateGroupDto: UpdateGroupDto, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if(!user.branchId) {
      throw new ForbiddenException('Usuário não possui filial associada');
    }
      // Verificar se grupo existe e pertence à filial
    const existingGroup = await prisma.group.findFirst({
      where: {
        id,
        branchId: user.branchId,
      },
    });

    if (!existingGroup) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Se estiver atualizando o nome, verificar se não entra em conflito com outro grupo
    if (updateGroupDto.name) {
      const nameConflict = await prisma.group.findFirst({
        where: {
          name: updateGroupDto.name,
          branchId: user.branchId,
          id: { not: id },
        },
      });

      if (nameConflict) {
        throw new ConflictException('Já existe um grupo com este nome nesta filial');
      }
    }

    // Preparar dados de atualização
    const updateData: any = {
      name: updateGroupDto.name,
      description: updateGroupDto.description,
    };

    // Se houver permissões para atualizar, recriar todas
    if (updateGroupDto.permissions && updateGroupDto.permissions.length > 0) {
      // Primeiro, remover todas as permissões existentes
      await prisma.permission.deleteMany({
        where: {
          groupId: id,
        },
      });

      // Depois, criar as novas permissões
      updateData.permissions = {
        create: updateGroupDto.permissions.map(p => ({
          action: p.action,
          subject: p.subject,
          inverted: p.inverted || false,
        })),
      };
    }

    return prisma.group.update({
      where: { id },
      data: updateData,
      include: {
        permissions: true,
      },
    });
  }

  async remove(id: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if(!user.branchId) {
      throw new ForbiddenException('Usuário não possui filial associada');
    }
    
    // Verificar se grupo existe e pertence à filial
    const existingGroup = await prisma.group.findFirst({
      where: {
        id,
        branchId: user.branchId,
      },
    });

    if (!existingGroup) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Verificar se há usuários associados
    const usersCount = await prisma.user.count({
      where: {
        groupId: id,
      },
    });

    if (usersCount > 0) {
      throw new ForbiddenException('Não é possível excluir um grupo que possui usuários associados');
    }

    // Remover permissões do grupo
    await prisma.permission.deleteMany({
      where: {
        groupId: id,
      },
    });

    // Excluir o grupo
    return prisma.group.delete({
      where: { id },
    });
  }
}
