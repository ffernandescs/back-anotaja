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
    // ✅ Construir allowed permissions a partir das permissões do usuário
    const allowedPermissions = new Set<string>();
    
    if (userPermissions?.length) {
      for (const permission of userPermissions) {
        // Se tem permissão manage para um subject, permite todas as actions
        if (permission.action === Action.MANAGE && !permission.inverted) {
          allowedPermissions.add(`${Action.CREATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.READ}:${permission.subject}`);
          allowedPermissions.add(`${Action.UPDATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.DELETE}:${permission.subject}`);
        } else if (!permission.inverted) {
          // Adiciona permissão específica
          allowedPermissions.add(`${permission.action}:${permission.subject}`);
        }
      }
    }
    
    // Debug: mostrar permissões permitidas
    console.log('🔍 Allowed permissions for menu:', Array.from(allowedPermissions));
    console.log('🔍 User permissions:', userPermissions);

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

    // Debug: mostrar features encontradas
    console.log('🔍 Plan features found:', planFeatures.map(f => ({ key: f.key, name: f.name, active: f.active })));

    // ✅ Agrupar features por menu groups
    const menuGroupsMap = new Map<string, MenuItem[]>();

    for (const feature of planFeatures) {
      // Verificar se usuário tem permissão para esta feature
      const featureKey = feature.key;
      const requiredPermission = `${Action.READ}:${featureKey}`;
      
      // ✅ Verificar se tem permissão READ para esta feature
      const hasReadPermission = allowedPermissions.has(requiredPermission);
      const hasManagePermission = allowedPermissions.has(`${Action.MANAGE}:${featureKey}`);
      const hasAnyPermission = Array.from(allowedPermissions).some(permission => 
        permission.endsWith(`:${featureKey}`)
      );
      
      const hasPermission = hasReadPermission || hasManagePermission || hasAnyPermission;

      console.log(`🔍 Checking feature "${featureKey}":`);
      console.log(`  - Required: "${requiredPermission}"`);
      console.log(`  - Has READ: ${hasReadPermission}`);
      console.log(`  - Has MANAGE: ${hasManagePermission}`);
      console.log(`  - Has ANY: ${hasAnyPermission}`);
      console.log(`  - Final hasPermission: ${hasPermission}`);
      console.log(`  - All allowed permissions:`, Array.from(allowedPermissions));

      if (!hasPermission) {
        console.log(`❌ Skipping feature "${featureKey}" - no permission`);
        continue;
      }

      console.log(`✅ Adding feature "${featureKey}" to menu`);

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
   * A key da feature já é o subject correto
   */
  private inferSubjectFromFeatureKey(featureKey: string): Subject {
    // ✅ A key da feature já é o subject, só converter para o tipo Subject
    console.log(`🔍 Using feature key as subject: "${featureKey}"`);
    
    // Converter string para o tipo Subject (validar se existe no enum)
    if (Object.values(Subject).includes(featureKey as Subject)) {
      console.log(`✅ Valid subject: ${featureKey}`);
      return featureKey as Subject;
    }
    
    // Fallback para ALL se não for um subject válido
    console.warn(`⚠️ Invalid subject "${featureKey}", using ALL as fallback`);
    return Subject.ALL;
  }
}
