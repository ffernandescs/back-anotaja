import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { ReorderFeaturesDto } from './dto/reorder-features.dto';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class FeaturesService {
  async create(createFeatureDto: CreateFeatureDto) {
    const { key, name, description, defaultActions, href, menuGroupId, parentId } = createFeatureDto;

    // Verificar se já existe feature com esta key
    const existingFeature = await prisma.feature.findUnique({
      where: { key },
    });

    if (existingFeature) {
      throw new ConflictException(`Feature com key '${key}' já existe`);
    }

    // Se for subfeature, verificar se a feature principal existe
    if (parentId) {
      const parentFeature = await prisma.feature.findUnique({
        where: { id: parentId },
      });

      if (!parentFeature) {
        throw new NotFoundException(`Feature principal com ID '${parentId}' não encontrada`);
      }
    }

    // Criar a feature
    const feature = await prisma.feature.create({
      data: {
        key,
        name,
        description,
        active: true,
        defaultActions: defaultActions ? JSON.stringify(defaultActions) : JSON.stringify(['read', 'manage']),
        href,
        parentId: parentId || null, // ✅ Adicionar parentId para subfeatures
      },
    });

    // ✅ Se foi informado um grupo, associar a feature ao grupo
    // Se for subfeature, herda o grupo da feature principal
    let targetGroupId = menuGroupId;
    
    if (!targetGroupId && parentId) {
      // Subfeature sem grupo informado - herda do parent
      const parentGroup = await prisma.featureMenuGroup.findFirst({
        where: { featureId: parentId },
        include: { group: true },
      });
      
      if (parentGroup) {
        targetGroupId = parentGroup.group.id;
      }
    }

    if (targetGroupId) {
      await prisma.featureMenuGroup.create({
        data: {
          featureId: feature.id,
          groupId: targetGroupId,
        },
      });
    }

    return feature;
  }

  async findAll() {
    return prisma.feature.findMany({
      where: { active: true },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        children: {
          where: { active: true },
          orderBy: [
            { displayOrder: 'asc' },
            { createdAt: 'desc' }
          ],
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            active: true,
            displayOrder: true,
            icon: true,
            href: true,
            defaultActions: true,
          },
        },
        _count: {
          select: {
            planFeatures: true,
            addonFeatures: true,
            children: {
              where: { active: true }
            }
          },
        },
        featureMenuGroups: {
          include: {
            group: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: {
            group: {
              displayOrder: 'asc'
            }
          }
        },
      },
    });
  }

  async findHierarchy() {
    // Buscar todas as features com seus relacionamentos
    const allFeatures = await prisma.feature.findMany({
      where: { active: true },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        children: {
          where: { active: true },
          orderBy: [
            { displayOrder: 'asc' },
            { createdAt: 'desc' }
          ],
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            active: true,
            displayOrder: true,
            icon: true,
            href: true,
            defaultActions: true,
          },
        },
        featureMenuGroups: {
          include: {
            group: {
              select: {
                id: true,
                title: true,
                displayOrder: true,
              },
            },
          },
          orderBy: {
            group: {
              displayOrder: 'asc'
            }
          }
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'desc' }
      ],
    });

    // Organizar em estrutura hierárquica
    const featuresMap = new Map();
    const rootFeatures: any[] = [];

    // Criar mapa de features
    allFeatures.forEach(feature => {
      featuresMap.set(feature.id, {
        ...feature,
        children: []
      });
    });

    // Montar hierarquia
    allFeatures.forEach(feature => {
      const featureNode = featuresMap.get(feature.id);
      
      if (feature.parentId) {
        // É subfeature - adicionar aos filhos do parent
        const parent = featuresMap.get(feature.parentId);
        if (parent) {
          parent.children.push(featureNode);
        }
      } else {
        // É feature root - adicionar à lista principal
        rootFeatures.push(featureNode);
      }
    });

    // Agrupar por menu groups (agora os grupos são o nível 1)
    const menuGroupsMap = new Map();
    const processedFeatures = new Set(); // Evitar duplicação
    
    // Para cada grupo de menu, adicionar todas as features vinculadas a ele
    const allMenuGroups = await prisma.menuGroup.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' }
    });

    for (const group of allMenuGroups) {
      // Encontrar todas as features vinculadas a este grupo
      const groupFeatures = allFeatures.filter(feature => 
        feature.featureMenuGroups.some(fmg => fmg.group.id === group.id)
      );

      if (groupFeatures.length > 0) {
        menuGroupsMap.set(group.id, {
          id: group.id,
          title: group.title,
          displayOrder: group.displayOrder,
          features: groupFeatures
        });
      }
    }

    // Converter mapa para array ordenado
    return Array.from(menuGroupsMap.values())
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async findAllIncludingInactive() {
    return prisma.feature.findMany({
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        children: {
          orderBy: [
            { displayOrder: 'asc' },
            { createdAt: 'desc' }
          ],
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            active: true,
            displayOrder: true,
            icon: true,
            href: true,
            defaultActions: true,
          },
        },
        _count: {
          select: {
            planFeatures: true,
            addonFeatures: true,
            children: true
          },
        },
        featureMenuGroups: {
          include: {
            group: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: {
            group: {
              displayOrder: 'asc'
            }
          }
        },
      },
    });
  }

  async findOne(id: string) {
    const feature = await prisma.feature.findUnique({
      where: { id },
      include: {
        planFeatures: {
          include: {
            plan: true,
          },
        },
        addonFeatures: {
          include: {
            addon: true,
          },
        },
      },
    });

    if (!feature) {
      throw new NotFoundException('Feature não encontrada');
    }

    return feature;
  }

  async findByKey(key: string) {
    const feature = await prisma.feature.findUnique({
      where: { key },
      include: {
        _count: {
          select: {
            planFeatures: true,
            addonFeatures: true,
          },
        },
      },
    });

    if (!feature) {
      throw new NotFoundException('Feature não encontrada');
    }

    return feature;
  }

  async update(id: string, updateFeatureDto: UpdateFeatureDto) {
    const feature = await this.findOne(id);

    // Se estiver atualizando a key, verificar duplicidade
    if (updateFeatureDto.key && updateFeatureDto.key !== feature.key) {
      const existingFeature = await prisma.feature.findUnique({
        where: { key: updateFeatureDto.key },
      });

      if (existingFeature) {
        throw new ConflictException(`Feature com key '${updateFeatureDto.key}' já existe`);
      }
    }

    // ✅ Preparar dados para update, convertendo defaultActions para JSON se fornecido
    const updateData: any = {
      ...updateFeatureDto,
    };

    // Remover defaultActions do objeto se não for fornecido
    if (updateFeatureDto.defaultActions !== undefined) {
      updateData.defaultActions = JSON.stringify(updateFeatureDto.defaultActions);
    } else if ('defaultActions' in updateFeatureDto) {
      // Se defaultActions foi explicitamente definido como undefined, remover do update
      delete updateData.defaultActions;
    }

    // ✅ Remover menuGroupId do update da feature (é tratado separadamente)
    const { menuGroupId, parentId, ...featureUpdateData } = updateData;

    // ✅ Remover isMainFeature se existir (não é salvo no banco)
    const { isMainFeature, ...cleanUpdateData } = featureUpdateData;

    // ✅ Preparar dados para o Prisma
    const prismaUpdateData: any = cleanUpdateData;
    
    // ✅ Se parentId foi fornecido, preparar o relacionamento
    if (parentId !== undefined) {
      if (parentId) {
        // Conectar a uma feature principal
        prismaUpdateData.parent = {
          connect: { id: parentId }
        };
      } else {
        // Desconectar de qualquer feature principal (tornar principal)
        prismaUpdateData.parent = {
          disconnect: true
        };
      }
    }

    // ✅ Atualizar a feature
    const updatedFeature = await prisma.feature.update({
      where: { id },
      data: prismaUpdateData,
    });

    // ✅ Se menuGroupId foi fornecido, atualizar a associação
    if (menuGroupId !== undefined) {
      // Remover associações existentes
      await prisma.featureMenuGroup.deleteMany({
        where: { featureId: id },
      });

      // Criar nova associação se menuGroupId não for vazio
      if (menuGroupId) {
        await prisma.featureMenuGroup.create({
          data: {
            featureId: id,
            groupId: menuGroupId,
          },
        });
      }
    }

    return updatedFeature;
  }

  async remove(id: string) {
    const feature = await this.findOne(id);

    // Verificar se há planos usando esta feature
    const planFeaturesCount = await prisma.planFeature.count({
      where: { featureId: id },
    });

    const addonFeaturesCount = await prisma.addonFeature.count({
      where: { featureId: id },
    });

    if (planFeaturesCount > 0 || addonFeaturesCount > 0) {
      throw new ConflictException(
        `Não é possível deletar a feature. Ela está sendo usada em ${planFeaturesCount} plano(s) e ${addonFeaturesCount} addon(s).`,
      );
    }

    // Soft delete - apenas desativar
    return prisma.feature.delete({
      where: { id },
    });
  }

  async toggleActive(id: string) {
    const feature = await this.findOne(id);

    return prisma.feature.update({
      where: { id },
      data: { active: !feature.active },
    });
  }

  async reorder(reorderFeaturesDto: ReorderFeaturesDto) {
    const { features } = reorderFeaturesDto;

    // Validar se todas as features existem
    const featureIds = features.map(f => f.id);
    const existingFeatures = await prisma.feature.findMany({
      where: { id: { in: featureIds } },
      select: { id: true, key: true, name: true },
    });

    if (existingFeatures.length !== featureIds.length) {
      const missingIds = featureIds.filter(id => !existingFeatures.find(f => f.id === id));
      throw new NotFoundException(`Features não encontradas: ${missingIds.join(', ')}`);
    }

    // Atualizar displayOrder de todas as features em uma transação
    const updatePromises = features.map(feature =>
      prisma.feature.update({
        where: { id: feature.id },
        data: { displayOrder: feature.displayOrder },
      })
    );

    await prisma.$transaction(updatePromises);

    return { message: 'Features reordenadas com sucesso' };
  }
}
