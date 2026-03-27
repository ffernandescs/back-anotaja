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
   */
  async generateMenuFromPlanFeatures(
    plan: string,
    addons: string[] = [],
    userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
  ): Promise<MenuGroup[]> {
    // Construir set de permissões permitidas
    const allowedPermissions = new Set<string>();
    
    if (userPermissions?.length) {
      for (const permission of userPermissions) {
        if (permission.action === Action.MANAGE && !permission.inverted) {
          // Permissão manage concede todas as actions para o subject
          allowedPermissions.add(`${Action.CREATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.READ}:${permission.subject}`);
          allowedPermissions.add(`${Action.UPDATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.DELETE}:${permission.subject}`);
        } else if (!permission.inverted) {
          allowedPermissions.add(`${permission.action}:${permission.subject}`);
        }
      }
    }

    // ✅ Buscar TODAS as features ativas do banco (sem filtrar por plano primeiro)
    const allFeatures = await prisma.feature.findMany({
      where: {
        active: true,
      },
      include: {
        featureMenuGroups: {
          include: {
            group: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Filtrar features baseado nas permissões do usuário
    const allowedMenuItems: MenuItem[] = [];
    
    for (const feature of allFeatures) {
      const featureKey = feature.key;
      
      // ✅ Verificar se o usuário tem permissão para este subject/key
      const hasReadPermission = allowedPermissions.has(`${Action.READ}:${featureKey}`);
      const hasManagePermission = allowedPermissions.has(`${Action.MANAGE}:${featureKey}`);
      const hasCreatePermission = allowedPermissions.has(`${Action.CREATE}:${featureKey}`);
      const hasUpdatePermission = allowedPermissions.has(`${Action.UPDATE}:${featureKey}`);
      const hasDeletePermission = allowedPermissions.has(`${Action.DELETE}:${featureKey}`);
      
      // ✅ Verificar se tem qualquer permissão para este subject
      const hasAnyPermission = Array.from(allowedPermissions).some(permission => {
        const [action, subject] = permission.split(':');
        return subject === featureKey; // Comparar subject com key da feature
      });
      
      // ✅ Ter qualquer permissão (read, manage, create, update, delete) dá acesso ao menu
      const hasPermission = hasReadPermission || hasManagePermission || hasCreatePermission || 
                          hasUpdatePermission || hasDeletePermission || hasAnyPermission;
     
      
      if (hasPermission) {
        const menuItem: MenuItem = {
          id: feature.key,
          label: feature.name,
          href: feature.href || undefined,
          action: Action.READ,
          subject: this.inferSubjectFromFeatureKey(feature.key),
        };
        
        allowedMenuItems.push(menuItem);
      } 
    }

    // Agrupar menu items por categorias
    const menuGroups = this.groupMenuItems(allowedMenuItems);
    
    return menuGroups;
  }

  /**
   * Gera menu dinâmico baseado nas permissões do usuário (método original)
   */
  async generateMenuFromFeatures(
    plan: string,
    addons: string[] = [],
    userPermissions?: Array<{ action: Action; subject: Subject; inverted: boolean }>
  ): Promise<MenuGroup[]> {
    // Construir set de permissões permitidas
    const allowedPermissions = new Set<string>();
    
    if (userPermissions?.length) {
      for (const permission of userPermissions) {
        if (permission.action === Action.MANAGE && !permission.inverted) {
          // Permissão manage concede todas as actions para o subject
          allowedPermissions.add(`${Action.CREATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.READ}:${permission.subject}`);
          allowedPermissions.add(`${Action.UPDATE}:${permission.subject}`);
          allowedPermissions.add(`${Action.DELETE}:${permission.subject}`);
        } else if (!permission.inverted) {
          allowedPermissions.add(`${permission.action}:${permission.subject}`);
        }
      }
    }

    // Buscar features do banco dinamicamente
    const dbFeatures = await prisma.feature.findMany({
      where: {
        active: true,
      },
      include: {
        featureMenuGroups: {
          include: {
            group: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Filtrar features baseado nas permissões do usuário
    const allowedMenuItems: MenuItem[] = [];
    
    for (const feature of dbFeatures) {
      const featureKey = feature.key;
      const hasReadPermission = allowedPermissions.has(`${Action.READ}:${featureKey}`);
      const hasManagePermission = allowedPermissions.has(`${Action.MANAGE}:${featureKey}`);
      const hasAnyPermission = Array.from(allowedPermissions).some(permission => 
        permission.endsWith(`:${featureKey}`)
      );
      
      const hasPermission = hasReadPermission || hasManagePermission || hasAnyPermission;
      
      if (hasPermission) {
        const menuItem: MenuItem = {
          id: feature.key,
          label: feature.name,
          href: feature.href || undefined,
          action: Action.READ,
          subject: this.inferSubjectFromFeatureKey(feature.key),
        };
        
        allowedMenuItems.push(menuItem);
      }
    }

    // Agrupar menu items por categorias
    const menuGroups = this.groupMenuItems(allowedMenuItems);
    
    return menuGroups;
  }

  /**
   * Agrupa menu items em categorias lógicas baseadas nos grupos do banco
   */
  private groupMenuItems(menuItems: MenuItem[]): MenuGroup[] {
    const groupsMap = new Map<string, MenuItem[]>();

    // Agrupar por grupos definidos no banco ou usar fallback
    for (const item of menuItems) {
      let groupName = 'Outros'; // grupo padrão

      // Aqui poderíamos buscar os grupos do banco se tivéssemos a referência
      // Por ora, usar fallback baseado no ID do item
      switch (item.id) {
        case 'dashboard':
          groupName = 'Principal';
          break;
        case 'product':
        case 'category':
          groupName = 'Produtos e Catálogo';
          break;
        case 'order':
        case 'customer':
        case 'delivery_person':
          groupName = 'Vendas';
          break;
        case 'stock':
          groupName = 'Operações';
          break;
        case 'user':
        case 'group':
        case 'subscription':
        case 'coupon':
          groupName = 'Configurações';
          break;
        case 'report':
          groupName = 'Relatórios';
          break;
      }

      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, []);
      }
      groupsMap.get(groupName)!.push(item);
    }

    // Construir menu final apenas com grupos que têm itens
    const menuGroups: MenuGroup[] = [];
    const orderedGroups = ['Principal', 'Produtos e Catálogo', 'Vendas', 'Operações', 'Configurações', 'Relatórios', 'Outros'];
    
    for (const groupName of orderedGroups) {
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
