import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { CreateMenuGroupDto } from './dto/create-menu-group.dto';
import { UpdateMenuGroupDto } from './dto/update-menu-group.dto';
import { ReorderMenuGroupsDto } from './dto/reorder-menu-groups.dto';

@Injectable()
export class MenuGroupsService {
  async create(createMenuGroupDto: CreateMenuGroupDto) {
    const { title, description, displayOrder } = createMenuGroupDto;

    // Verificar se já existe um grupo com este título
    const existingGroup = await prisma.menuGroup.findFirst({
      where: { title: title.trim() },
    });

    if (existingGroup) {
      throw new ConflictException(`Grupo de menu '${title}' já existe`);
    }

    const menuGroup = await prisma.menuGroup.create({
      data: {
        title: title.trim(),
        description,
        displayOrder: displayOrder || 0,
      },
    });

    return menuGroup;
  }

  async findAll() {
    return prisma.menuGroup.findMany({
      where: { active: true },
      orderBy: [
        { displayOrder: 'asc' },
        { title: 'asc' }
      ],
      include: {
        featureMenuGroups: {
          include: {
            feature: {
             include: {
              children: {
                orderBy: {
                  displayOrder: 'asc'
                }
              }
             }
            },
          },
          orderBy: {
            feature: {
              displayOrder: 'asc'
            }
          }
        },
      },
    });
  }

  async findAllIncludingInactive() {
    return prisma.menuGroup.findMany({
      orderBy: [
        { displayOrder: 'asc' },
        { title: 'asc' }
      ],
      include: {
        featureMenuGroups: {
          include: {
            feature: {
             include: {
              children: {
                orderBy: {
                  displayOrder: 'asc'
                }
              }
             }
            },
          },
          orderBy: {
            feature: {
              displayOrder: 'asc'
            }
          }
        },
      },
    });
  }

  async findOne(id: string) {
    const menuGroup = await prisma.menuGroup.findUnique({
      where: { id },
      include: {
        featureMenuGroups: {
          include: {
            feature: true,
          },
        },
      },
    });

    if (!menuGroup) {
      throw new NotFoundException('Grupo de menu não encontrado');
    }

    return menuGroup;
  }

  async update(id: string, updateMenuGroupDto: UpdateMenuGroupDto) {
    const { title, description, displayOrder, active } = updateMenuGroupDto;

    // Verificar se o grupo existe
    const existingGroup = await prisma.menuGroup.findUnique({
      where: { id },
    });

    if (!existingGroup) {
      throw new NotFoundException('Grupo de menu não encontrado');
    }

    // Se estiver atualizando o título, verificar duplicidade
    if (title && title.trim() !== existingGroup.title) {
      const duplicateGroup = await prisma.menuGroup.findFirst({
        where: { 
          title: title.trim(),
          id: { not: id },
        },
      });

      if (duplicateGroup) {
        throw new ConflictException(`Grupo de menu '${title}' já existe`);
      }
    }

    const updatedGroup = await prisma.menuGroup.update({
      where: { id },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(active !== undefined && { active }),
      },
    });

    return updatedGroup;
  }

  async remove(id: string) {
    // Verificar se o grupo existe
    const existingGroup = await prisma.menuGroup.findUnique({
      where: { id },
      include: {
        featureMenuGroups: {
          select: { id: true },
        },
      },
    });

    if (!existingGroup) {
      throw new NotFoundException('Grupo de menu não encontrado');
    }

    // Verificar se há features associadas
    if (existingGroup.featureMenuGroups.length > 0) {
      throw new ConflictException(
        `Não é possível excluir o grupo. Existem ${existingGroup.featureMenuGroups.length} features associadas.`
      );
    }

    await prisma.menuGroup.delete({
      where: { id },
    });

    return { message: 'Grupo de menu excluído com sucesso' };
  }

  async addFeatureToGroup(groupId: string, featureId: string) {
    // Verificar se o grupo existe
    const group = await prisma.menuGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Grupo de menu não encontrado');
    }

    // Verificar se a feature existe
    const feature = await prisma.feature.findUnique({
      where: { id: featureId },
    });

    if (!feature) {
      throw new NotFoundException('Feature não encontrada');
    }

    // Verificar se a associação já existe
    const existingAssociation = await prisma.featureMenuGroup.findUnique({
      where: {
        featureId_groupId: {
          featureId,
          groupId,
        },
      },
    });

    if (existingAssociation) {
      throw new ConflictException('Feature já está associada a este grupo');
    }

    const association = await prisma.featureMenuGroup.create({
      data: {
        featureId,
        groupId,
      },
      include: {
        feature: true,
        group: true,
      },
    });

    return association;
  }

  async removeFeatureFromGroup(groupId: string, featureId: string) {
    // Verificar se a associação existe
    const association = await prisma.featureMenuGroup.findUnique({
      where: {
        featureId_groupId: {
          featureId,
          groupId,
        },
      },
    });

    if (!association) {
      throw new NotFoundException('Feature não está associada a este grupo');
    }

    await prisma.featureMenuGroup.delete({
      where: { id: association.id },
    });

    return { message: 'Feature removida do grupo com sucesso' };
  }

  async getGroupFeatures(groupId: string) {
    const group = await prisma.menuGroup.findUnique({
      where: { id: groupId },
      include: {
        featureMenuGroups: {
          include: {
            feature: true,
          },
          orderBy: {
            feature: {
              name: 'asc',
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo de menu não encontrado');
    }

    return group.featureMenuGroups.map(fg => fg.feature);
  }

  async getAvailableFeaturesForGroup(groupId: string) {
    // Buscar features que ainda não estão associadas ao grupo
    const associatedFeatureIds = await prisma.featureMenuGroup
      .findMany({
        where: { groupId },
        select: { featureId: true },
      })
      .then(associations => associations.map(a => a.featureId));

    const availableFeatures = await prisma.feature.findMany({
      where: {
        id: { notIn: associatedFeatureIds },
        active: true,
      },
      orderBy: { name: 'asc' },
    });

    return availableFeatures;
  }

  async reorder(reorderMenuGroupsDto: ReorderMenuGroupsDto) {
    const { groups } = reorderMenuGroupsDto;

    // Validar se todos os grupos existem
    const groupIds = groups.map(g => g.id);
    const existingGroups = await prisma.menuGroup.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, title: true },
    });

    if (existingGroups.length !== groupIds.length) {
      const missingIds = groupIds.filter(id => !existingGroups.find(g => g.id === id));
      throw new NotFoundException(`Grupos não encontrados: ${missingIds.join(', ')}`);
    }

    // Atualizar displayOrder de todos os grupos em uma transação
    const updatePromises = groups.map(group =>
      prisma.menuGroup.update({
        where: { id: group.id },
        data: { displayOrder: group.displayOrder },
      })
    );

    await prisma.$transaction(updatePromises);

    return { message: 'Grupos reordenados com sucesso' };
  }
}
