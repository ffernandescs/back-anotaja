// ─────────────────────────────────────────────────────────────
// ability/factory/menu.service.ts
//
// Gera menu dinâmico baseado nas permissões do plano
// ─────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { Action, PlanType, Subject } from '../types/ability.types';
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
   * ✅ Gera menu dinâmico a partir das features do plano
   * Busca features ativas do plano e agrupa por menu groups
   */
  async generateMenuFromFeatures(
    plan: PlanType,
    addons: string[] = [],
    userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
  ): Promise<MenuGroup[]> {
    // ✅ Por enquanto, permite todas as permissões (será implementado)
    const allowedPermissions = new Set<string>(['*']);

    // ✅ Buscar features do plano com grupos associados
    const planFeatures = await prisma.feature.findMany({
      where: {
        active: true,
        planFeatures: {
          some: {
            plan: {
              type: plan,
            },
          },
        },
      },
      include: {
        featureMenuGroups: {
          include: {
            group: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // ✅ Agrupar features por menu groups
    const menuGroupsMap = new Map<string, MenuItem[]>();

    for (const feature of planFeatures) {
      // Verificar se usuário tem permissão para esta feature
      const featureKey = feature.key;
      const hasPermission = allowedPermissions.has('*') || 
        Array.from(allowedPermissions).some(permission => 
          permission.includes(featureKey) || featureKey.includes(permission.split(':')[1])
        );

      if (!hasPermission) {
        continue;
      }

      // Criar menu item
      const menuItem: MenuItem = {
        id: feature.key,
        label: feature.name,
        href: feature.href || undefined,
        action: Action.READ, // ✅ Permissão padrão para menu
        subject: this.inferSubjectFromFeatureKey(feature.key),
      };

      // Se feature tem grupos, adicionar a cada grupo
      if (feature.featureMenuGroups.length > 0) {
        for (const featureMenuGroup of feature.featureMenuGroups) {
          const group = featureMenuGroup.group;
          if (group) {
            if (!menuGroupsMap.has(group.id)) {
              menuGroupsMap.set(group.id, []);
            }
            menuGroupsMap.get(group.id)!.push(menuItem);
          }
        }
      } else {
        // Se não tem grupo, adicionar em "Outros"
        if (!menuGroupsMap.has('outros')) {
          menuGroupsMap.set('outros', []);
        }
        menuGroupsMap.get('outros')!.push(menuItem);
      }
    }

    // ✅ Buscar informações dos grupos
    const groupIds = Array.from(menuGroupsMap.keys()).filter(id => id !== 'outros');
    const groups = await prisma.menuGroup.findMany({
      where: {
        id: { in: groupIds },
        active: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    // ✅ Construir menu groups final
    const menuGroups: MenuGroup[] = [];

    // Adicionar grupos ordenados
    for (const group of groups) {
      const items = menuGroupsMap.get(group.id) || [];
      if (items.length > 0) {
        menuGroups.push({
          title: group.title,
          items,
        });
      }
    }

    // Adicionar "Outros" se tiver itens
    const outrosItems = menuGroupsMap.get('outros') || [];
    if (outrosItems.length > 0) {
      menuGroups.push({
        title: 'Outros',
        items: outrosItems,
      });
    }

    return menuGroups;
  }

  /**
   * ✅ Infere subject a partir da feature key
   * TODO: Futuramente buscar configuração do Master no banco
   */
  private inferSubjectFromFeatureKey(featureKey: string): Subject {
    // TODO: Implementar inferência dinâmica baseada no banco
    // Por enquanto, retorna ALL como fallback
    return Subject.ALL;
  }
}
