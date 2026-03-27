import { Injectable } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { Action, DefinePermission, Subject } from '../types/ability.types';

export interface FeaturePermission {
  action: Action;
  subject: Subject;
  conditions?: any;
}

@Injectable()
export class DynamicPlanRulesService {
  /**
   * Gera as permissões de um plano de forma dinâmica baseada nas features associadas
   */
  async generatePlanPermissions(
    can: DefinePermission,
    planId: string,
    companyId?: string
  ): Promise<void> {
    // Buscar o plano com suas features e limites
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        planFeatures: {
          include: {
            feature: true
          }
        }
      }
    });

    if (!plan) {
      throw new Error('Plano não encontrado');
    }

    // Buscar addons da empresa (se companyId fornecido)
    const subscriptionAddons = companyId ? await prisma.subscriptionAddon.findMany({
      where: {
        subscription: {
          companyId,
          status: 'ACTIVE'
        },
        OR: [
          { endDate: null },
          { endDate: { gt: new Date() } }
        ]
      },
      include: {
        addon: {
          include: {
            features: {
              include: {
                feature: true
              }
            }
          }
        }
      }
    }) : [];

    // Criar mapa de limites para fácil acesso a partir do campo JSON
    let limitsMap = new Map<string, number>();
    if (plan.limits) {
      try {
        const limits = JSON.parse(plan.limits);
        limitsMap = new Map(
          Object.entries(limits).map(([key, value]) => [key, value as number])
        );
      } catch (error) {
        console.warn('Erro ao parsear limits do plano:', error);
      }
    }

    // Processar features do plano
    for (const planFeature of plan.planFeatures) {
      const feature = planFeature.feature;
      const permissions = this.parseFeaturePermissions(feature);
      
      for (const permission of permissions) {
        const conditions = this.generateConditions(
          permission.subject,
          permission.action,
          limitsMap
        );
        
        can(permission.action, permission.subject, conditions);
      }
    }

    // Processar features dos addons
    for (const subscriptionAddon of subscriptionAddons) {
      for (const addonFeature of subscriptionAddon.addon.features) {
        const feature = addonFeature.feature;
        const permissions = this.parseFeaturePermissions(feature);
        
        for (const permission of permissions) {
          can(permission.action, permission.subject);
        }
      }
    }
  }

  /**
   * Converte as ações padrão da feature para permissões válidas
   */
  private parseFeaturePermissions(feature: any): FeaturePermission[] {
    const defaultActions = feature.defaultActions ? JSON.parse(feature.defaultActions) : ['read', 'manage'];
    const subject = this.mapFeatureToSubject(feature.key);
    
    const permissions: FeaturePermission[] = [];

    for (const action of defaultActions) {
      const mappedAction = this.mapAction(action);
      if (mappedAction && subject) {
        permissions.push({
          action: mappedAction,
          subject
        });
      }
    }

    return permissions;
  }

  /**
   * Mapeia a key da feature para o Subject correspondente
   */
  private mapFeatureToSubject(featureKey: string): Subject | null {
    const mapping: Record<string, Subject> = {
      'orders': Subject.ORDER,
      'products': Subject.PRODUCT,
      'categories': Subject.CATEGORY,
      'customers': Subject.CUSTOMER,
      'dashboard': Subject.DASHBOARD,
      'profile': Subject.PROFILE,
      'hours': Subject.HOURS,
      'payment': Subject.PAYMENT,
      'kanban': Subject.KANBAN,
      'pdv': Subject.PDV,
      'kds': Subject.KDS,
      'commands': Subject.COMMANDS,
      'reports': Subject.REPORT,
      'coupons': Subject.COUPON,
      'delivery_routes': Subject.DELIVERY_ROUTE,
      'delivery_areas': Subject.DELIVERY_AREA,
      'delivery_persons': Subject.DELIVERY_PERSON,
      'stock': Subject.STOCK,
      'cash_register': Subject.CASH_REGISTER,
      'tables': Subject.TABLE,
      'payment_methods': Subject.PAYMENT_METHOD,
      'points': Subject.POINTS,
      'announcements': Subject.ANNOUNCEMENT,
      'groups': Subject.GROUP,
      'users': Subject.USER,
      'subscription': Subject.SUBSCRIPTION,
      'branches': Subject.BRANCH
    };

    return mapping[featureKey] || null;
  }

  /**
   * Mapeia string da ação para enum Action
   */
  private mapAction(action: string): Action | null {
    const actionMapping: Record<string, Action> = {
      'create': Action.CREATE,
      'read': Action.READ,
      'update': Action.UPDATE,
      'delete': Action.DELETE,
      'manage': Action.MANAGE
    };

    return actionMapping[action] || null;
  }

  /**
   * Gera condições de limite para permissões de criação
   */
  private generateConditions(
    subject: Subject,
    action: Action,
    limitsMap: Map<string, number>
  ): any {
    // Apenas aplicar limites para ações de criação
    if (action !== Action.CREATE && action !== Action.MANAGE) {
      return undefined;
    }

    const resourceMapping: Partial<Record<Subject, string>> = {
      [Subject.USER]: 'users',
      [Subject.PRODUCT]: 'products',
      [Subject.BRANCH]: 'branches',
      [Subject.DELIVERY_PERSON]: 'deliveryPersons',
      [Subject.ORDER]: 'ordersPerMonth'
    };

    const resource = resourceMapping[subject];
    if (!resource) {
      return undefined;
    }

    const limit = limitsMap.get(resource);
    if (limit === undefined || limit === -1) {
      return undefined; // Ilimitado
    }

    return { currentCount: { $lt: limit } };
  }

  /**
   * Lista todas as features disponíveis para seleção no plano
   */
  async listAvailableFeatures() {
    return prisma.feature.findMany({
      where: { active: true },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        defaultActions: true
      },
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Atualiza as ações padrão de uma feature
   */
  async updateFeatureActions(featureId: string, actions: Action[]) {
    const feature = await prisma.feature.findUnique({
      where: { id: featureId }
    });

    if (!feature) {
      throw new Error('Feature não encontrada');
    }

    const actionStrings = actions.map(action => action.toString().toLowerCase());
    
    return prisma.feature.update({
      where: { id: featureId },
      data: {
        defaultActions: JSON.stringify(actionStrings)
      }
    });
  }
}
