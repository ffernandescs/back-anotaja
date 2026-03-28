// ─────────────────────────────────────────────────────────────
// ability/factory/menu.service.ts
//
// Gera menu dinâmico baseado nas permissões do usuário
// ─────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { Action, Subject } from '../types/ability.types';
import { prisma } from '../../../lib/prisma';

export interface MenuItem {
  id: string;
  label: string;
  href?: string;
  icon?: string;
  action?: Action;
  subject?: Subject;
  children?: MenuItem[];
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

@Injectable()
export class MenuService {
  /**
   * Gera menu dinâmico baseado nas features do plano e permissões do usuário
   * Suporta hierarquia de features (subfeatures como children)
   */
async generateMenuFromPlanFeatures(
  planId: string,
  addons: string[] = [],
  userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
): Promise<any[]> {

  // 1. Fetch plan features
  const planFeatures = await prisma.planFeature.findMany({
    where: { plan: { id: planId } },
    include: {
      feature: {
        include: {
          children: {
            where: { active: true },
            include: {
              featureMenuGroups: { include: { group: true } }
            },
            orderBy: {
              displayOrder: 'asc'
            }
          },
          featureMenuGroups: { 
            include: { 
              group: true 
            }
          },
        }
      }
    }
  });

  // 2. Fetch addon features (addons podem estar vinculados a grupos também)
  const addonFeatures = addons.length > 0
    ? await prisma.addonFeature.findMany({
        where: { addon: { key: { in: addons } } },
        include: {
          feature: {
            include: {
              children: {
                where: { active: true },
                include: {
                  featureMenuGroups: { include: { group: true } }
                },
                orderBy: {
                  displayOrder: 'asc'
                }
              },
              featureMenuGroups: { 
                include: { 
                  group: true 
                }
              },
            }
          }
        }
      })
    : [];

  // 3. Collect all unlocked features (plan + addons)
  const unlockedFeatures = [
    ...planFeatures.map((pf: any) => pf.feature),
    ...addonFeatures.map((af: any) => af.feature),
  ];

  // De-duplicate by feature id
  const featureMap = new Map<string, typeof unlockedFeatures[number]>();
  for (const f of unlockedFeatures) {
    if (f.active) { // Apenas features ativas
      featureMap.set(f.id, f);
    }
  }
  const allFeatures = Array.from(featureMap.values());

  const unlockedKeys = new Set(allFeatures.map(f => f.key));

  // 4. Helper: check if user has at least read permission on a feature
  const hasPermission = (featureKey: string): boolean => {
    if (!userPermissions?.length) return true; // no restrictions = allow all
    const hasPermission = userPermissions.some(
      p => p.subject === featureKey && ['read', 'manage'].includes(p.action) && !p.inverted
    );
    
    return hasPermission;
  };

  // 5. Separate root features (no parentId) from children e ordenar por displayOrder
  const rootFeatures = allFeatures
    .filter(f => !f.parentId && f.active)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // 6. Build a map of menuGroupId -> MenuGroup metadata
  const menuGroupMap = new Map<string, { id: string; title: string; displayOrder: number; items: any[] }>();

  for (const feature of rootFeatures) {
    const hasMainPermission = hasPermission(feature.key);
    
    // Resolve children that are also unlocked and permitted
    const children = (feature.children ?? [])
      .filter(child => 
        unlockedKeys.has(child.key) && 
        hasPermission(child.key) && 
        child.active &&
        child.href // Apenas children com href são mostrados no menu
      )
      .map(child => ({
        id: child.key,
        label: child.name,
        href: child.href,
      }));

    // Mostrar feature principal se:
    // 1. Tiver permissão E tiver href próprio, OU
    // 2. Tiver permissão E tiver children selecionados, OU
    // 3. NÃO tiver permissão MAS tiver children selecionados (subfeature com permissão)
    const shouldShow = (hasMainPermission && (feature.href || children.length > 0)) || 
                      (!hasMainPermission && children.length > 0);

    if (shouldShow) {
      const menuItem = {
        id: feature.key,
        label: feature.name,
        href: feature.href || null, // Features principais podem não ter href
        icon: feature.icon || null, // Ícone Lucide para exibição
        displayOrder: feature.displayOrder || 0, // Incluir displayOrder para ordenação
        children, // Apenas subfeatures que o usuário tem acesso
      };

      // Attach to each MenuGroup this feature belongs to
      // Features principais devem ter grupo, subfeatures herdam do pai
      for (const fmg of feature.featureMenuGroups) {
        const g = fmg.group;
        if (!menuGroupMap.has(g.id)) {
          menuGroupMap.set(g.id, {
            id: g.id,
            title: g.title,
            displayOrder: g.displayOrder,
            items: [],
          });
        }
        menuGroupMap.get(g.id)!.items.push(menuItem);
      }
    }
  }

  // 7. Sort groups by displayOrder e ordenar items dentro de cada grupo
  return Array.from(menuGroupMap.values())
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(group => ({
      title: group.title,
      items: group.items.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    }));
}

  /**
   * Gera menu dinâmico baseado nas features do plano e permissões do usuário
   * Suporta hierarquia de features (subfeatures como children)
   */
  async generateMenuFromFeatures(
    plan: string,
    addons: string[] = [],
    userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
  ): Promise<MenuGroup[]> {
    // Usar o método atualizado que suporta hierarquia
    return this.generateMenuFromPlanFeatures(plan, addons, userPermissions);
  }

  /**
   * Agrupa menu items em categorias lógicas baseadas nos grupos do banco
   * Suporta hierarquia de features
   */
  private async groupMenuItems(menuItems: MenuItem[]): Promise<MenuGroup[]> {
    const groupsMap = new Map<string, MenuItem[]>();

    // Agrupar por grupos definidos no banco (100% dinâmico)
    for (const item of menuItems) {
      let groupName = 'Outros'; // grupo padrão

      // Buscar a feature completa para obter o grupo
      const feature = await prisma.feature.findUnique({
        where: { key: item.id },
        include: {
          featureMenuGroups: {
            include: {
              group: true
            }
          }
        }
      });

      if (feature?.featureMenuGroups?.length) {
        // Feature principal - usar grupo do banco
        groupName = feature.featureMenuGroups[0].group.title;
      } else {
        // Subfeature - herdar grupo da feature principal
        const parentGroup = await this.getParentGroup(item.id);
        groupName = parentGroup || 'Outros';
      }

      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, []);
      }
      groupsMap.get(groupName)!.push(item);
    }

    // Construir menu final apenas com grupos que têm itens
    const menuGroups: MenuGroup[] = [];
    
    // Ordenar grupos por displayOrder se disponível, senão alfabeticamente
    const sortedGroups = Array.from(groupsMap.keys()).sort();
    
    for (const groupName of sortedGroups) {
      const items = groupsMap.get(groupName) || [];
      if (items.length > 0) {
        menuGroups.push({
          title: groupName,
          items
        });
      }
    }

    return menuGroups;
  }

  /**
   * Determina se uma feature é principal (não tem pai)
   * @param featureKey - Key da feature a verificar
   * @returns boolean - true se for feature principal (sem parentId)
   */
  private async isMainFeature(featureKey: string): Promise<boolean> {
    const feature = await prisma.feature.findUnique({
      where: { key: featureKey },
      select: { parentId: true }
    });
    
    if (!feature) {
      console.warn(`⚠️ Feature "${featureKey}" not found, treating as subfeature`);
      return false;
    }
    
    // Feature principal não tem parentId (null)
    return feature.parentId === null || feature.parentId === undefined;
  }

  /**
   * Determina o grupo da feature principal baseado na subfeature
   * (100% dinâmico, busca do banco de dados)
   */
  private async getParentGroup(subfeatureKey: string): Promise<string | null> {
    // 1. Buscar a subfeature pelo key
    const subfeature = await prisma.feature.findUnique({
      where: { key: subfeatureKey },
      include: {
        parent: {
          include: {
            featureMenuGroups: {
              include: {
                group: true
              }
            }
          }
        }
      }
    });

    // 2. Verificar se tem feature principal
    if (!subfeature?.parent) {
      return null; // Não é subfeature, não tem grupo para herdar
    }

    // 3. Obter o grupo da feature principal
    const parentFeature = subfeature.parent;
    const group = parentFeature.featureMenuGroups?.[0]?.group;
    
    // 4. Retornar o título do grupo ou null
    return group?.title || null;
  }

  /**
   * Infere subject a partir da feature key
   */
  private inferSubjectFromFeatureKey(featureKey: string): Subject {
    // Converter string para o tipo Subject (validar se existe no enum)
    if (Object.values(Subject).includes(featureKey as Subject)) {
      return featureKey as Subject;
    }
    
    // Fallback para ALL se não for um subject válido
    console.warn(`⚠️ Invalid subject "${featureKey}", using ALL as fallback`);
    return Subject.ALL;
  }
}
