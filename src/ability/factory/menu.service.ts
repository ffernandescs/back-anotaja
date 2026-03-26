// ─────────────────────────────────────────────────────────────
// ability/factory/menu.service.ts
//
// Gera menu dinâmico baseado nas permissões do plano
// ─────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { Action, PlanType, Subject } from '../types/ability.types';
import { PLAN_FEATURES, ADDON_FEATURES } from './plan-rules';

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
  // Definição completa do menu (espelho do frontend)
  private readonly FULL_MENU: MenuGroup[] = [
    {
      title: 'Principal',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          href: '/admin/dashboard',
          action: Action.READ,
          subject: Subject.ALL,
        },
      ],
    },
    {
      title: 'Produtos e Catálogo',
      items: [
        {
          id: 'products',
          label: 'Produtos',
          href: '/admin/products',
          action: Action.READ,
          subject: Subject.PRODUCT,
        },
        {
          id: 'categories',
          label: 'Categorias',
          href: '/admin/categories',
          action: Action.READ,
          subject: Subject.PRODUCT,
        },
        {
          id: 'complements',
          label: 'Complementos',
          children: [
            {
              id: 'complements-list',
              label: 'Lista de Complementos',
              href: '/admin/complements',
              action: Action.READ,
              subject: Subject.PRODUCT,
            },
            {
              id: 'complement-options',
              label: 'Opções de Complementos',
              href: '/admin/complement-options',
              action: Action.READ,
              subject: Subject.PRODUCT,
            },
          ],
        },
      ],
    },
    {
      title: 'Pedidos e Operações',
      items: [
        {
          id: 'orders',
          label: 'Pedidos',
          children: [
            {
              id: 'orders-list',
              label: 'Lista de Pedidos',
              href: '/admin/orders',
              action: Action.READ,
              subject: Subject.ORDER,
            },
            {
              id: 'kanban',
              label: 'Kanban',
              href: '/admin/kanban',
              action: Action.READ,
              subject: Subject.KANBAN,
            },
            {
              id: 'kds',
              label: 'KDS',
              href: '/admin/kds',
              action: Action.READ,
              subject: Subject.KDS,
            },
            {
              id: 'pdv',
              label: 'PDV',
              href: '/admin/pdv',
              action: Action.READ,
              subject: Subject.PDV,
            },
          ],
        },
        {
          id: 'comandas',
          label: 'Comandas',
          href: '/admin/comandas',
          action: Action.READ,
          subject: Subject.COMMANDS,
        },
        {
          id: 'tables',
          label: 'Mesas',
          href: '/admin/tables',
          action: Action.READ,
          subject: Subject.TABLE,
        },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        {
          id: 'cash-register',
          label: 'Fluxo de Caixa',
          href: '/admin/cash-register',
          action: Action.READ,
          subject: Subject.CASH_REGISTER,
        },
        {
          id: 'coupons',
          label: 'Cupons',
          href: '/admin/coupons',
          action: Action.READ,
          subject: Subject.COUPON,
        },
      ],
    },
    {
      title: 'Estoque',
      items: [
        {
          id: 'stock',
          label: 'Estoque',
          href: '/admin/stock',
          action: Action.READ,
          subject: Subject.STOCK,
        },
      ],
    },
    {
      title: 'Entregas',
      items: [
        {
          id: 'delivery-persons',
          label: 'Entregadores',
          href: '/admin/delivery-persons',
          action: Action.READ,
          subject: Subject.DELIVERY_PERSON,
        },
        {
          id: 'deliveries',
          label: 'Gestão de Entregas',
          children: [
            {
              id: 'delivery-areas',
              label: 'Áreas de Entrega',
              href: '/admin/delivery-areas',
              action: Action.READ,
              subject: Subject.DELIVERY_AREA,
            },
            {
              id: 'delivery-routes',
              label: 'Gerenciar Rotas',
              href: '/admin/delivery-routes',
              action: Action.READ,
              subject: Subject.DELIVERY_ROUTE,
            },
            {
              id: 'delivery-assignments',
              label: 'Rotas de Entregadores',
              href: '/admin/delivery-assignments',
              action: Action.READ,
              subject: Subject.DELIVERY_PERSON,
            },
          ],
        },
      ],
    },
    {
      title: 'Marketing e Fidelidade',
      items: [
        {
          id: 'points',
          label: 'Pontuação',
          href: '/admin/points',
          action: Action.READ,
          subject: Subject.POINTS,
        },
      ],
    },
    {
      title: 'Administração',
      items: [
        {
          id: 'branches',
          label: 'Filiais',
          href: '/admin/branches',
          action: Action.READ,
          subject: Subject.BRANCH,
        },
        {
          id: 'users',
          label: 'Usuários',
          href: '/admin/users',
          action: Action.READ,
          subject: Subject.USER,
        },
        {
          id: 'groups',
          label: 'Grupos de permissão',
          href: '/admin/groups',
          action: Action.READ,
          subject: Subject.GROUP,
        },
        {
          id: 'payments',
          label: 'Meu plano',
          href: '/admin/settings/payments',
          action: Action.READ,
          subject: Subject.SUBSCRIPTION,
        },
        {
          id: 'settings',
          label: 'Configurações',
          children: [
            {
              id: 'profile',
              label: 'Perfil',
              href: '/admin/settings/profile',
              action: Action.READ,
              subject: Subject.ALL,
            },
            {
              id: 'hours',
              label: 'Horários',
              href: '/admin/settings/hours',
              action: Action.READ,
              subject: Subject.ALL,
            },
            {
              id: 'payment',
              label: 'Pagamento',
              href: '/admin/settings/payment',
              action: Action.READ,
              subject: Subject.ALL,
            },
            {
              id: 'announcements',
              label: 'Avisos',
              href: '/admin/settings/announcements',
              action: Action.READ,
              subject: Subject.BRANCH,
            },
          ],
        },
      ],
    },
  ];

  /**
   * Gera menu filtrado baseado no plano e add-ons
   */
  generateMenu(plan: PlanType, addons: string[] = []): MenuGroup[] {
    const allowedPermissions = this.getAllowedPermissions(plan, addons);
    
    return this.FULL_MENU.map((group) => ({
      title: group.title,
      items: this.filterMenuItems(group.items, allowedPermissions),
    })).filter((group) => group.items.length > 0);
  }

  /**
   * Coleta todas as permissões permitidas pelo plano + add-ons
   */
  private getAllowedPermissions(plan: PlanType, addons: string[]): Set<string> {
    const permissions = new Set<string>();

    // Permissões do plano
    const planFeatures = PLAN_FEATURES[plan] || [];
    for (const [action, subjects] of planFeatures) {
      const subjectList = Array.isArray(subjects) ? subjects : [subjects];
      
      for (const subject of subjectList) {
        if (subject === Subject.ALL) {
          // Se tem MANAGE ALL, permite tudo
          permissions.add('*');
        } else {
          permissions.add(`${action}:${subject}`);
          
          // Se tem MANAGE, adiciona todas as actions
          if (action === Action.MANAGE) {
            permissions.add(`${Action.CREATE}:${subject}`);
            permissions.add(`${Action.READ}:${subject}`);
            permissions.add(`${Action.UPDATE}:${subject}`);
            permissions.add(`${Action.DELETE}:${subject}`);
          }
        }
      }
    }

    // Permissões de add-ons
    for (const addon of addons) {
      const addonFeatures = ADDON_FEATURES[addon as any] || [];
      for (const [action, subject] of addonFeatures) {
        permissions.add(`${action}:${subject}`);
        
        if (action === Action.MANAGE) {
          permissions.add(`${Action.CREATE}:${subject}`);
          permissions.add(`${Action.READ}:${subject}`);
          permissions.add(`${Action.UPDATE}:${subject}`);
          permissions.add(`${Action.DELETE}:${subject}`);
        }
      }
    }

    return permissions;
  }

  /**
   * Filtra itens do menu recursivamente
   */
  private filterMenuItems(items: MenuItem[], allowedPermissions: Set<string>): MenuItem[] {
    const filtered: MenuItem[] = [];

    for (const item of items) {
      // Se tem children, filtra recursivamente
      if (item.children && item.children.length > 0) {
        const filteredChildren = this.filterMenuItems(item.children, allowedPermissions);
        
        // Só inclui o pai se tiver pelo menos um filho visível
        if (filteredChildren.length > 0) {
          filtered.push({
            ...item,
            children: filteredChildren,
          });
        }
      } else {
        // Item folha - verifica permissão
        if (this.hasPermission(item, allowedPermissions)) {
          filtered.push(item);
        }
      }
    }

    return filtered;
  }

  /**
   * Verifica se o item tem permissão
   */
  private hasPermission(item: MenuItem, allowedPermissions: Set<string>): boolean {
    // Se não tem action/subject definido, permite (compatibilidade)
    if (!item.action || !item.subject) {
      return true;
    }

    // Se tem permissão total (*), permite tudo
    if (allowedPermissions.has('*')) {
      return true;
    }

    // Verifica permissão específica
    const key = `${item.action}:${item.subject}`;
    return allowedPermissions.has(key);
  }
}
