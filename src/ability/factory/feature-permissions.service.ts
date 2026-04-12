import { Injectable } from '@nestjs/common';
import { Action, DefinePermission, Subject } from '../types/ability.types';
import { prisma } from '../../../lib/prisma';

export interface FeaturePermission {
  action: Action;
  subject: Subject;
  conditions?: any;
}

@Injectable()
export class FeaturePermissionsService {
  /**
   * Gera as permissões baseadas nas features do banco de dados
   */
  async generatePermissionsFromFeatures(
    can: DefinePermission,
    featureKeys: string[],
    limitsMap?: Map<string, number>
  ): Promise<void> {
    // Buscar features do banco
    const features = await prisma.feature.findMany({
      where: { 
        key: { in: featureKeys },
        active: true 
      }
    });

    for (const feature of features) {
      const permissions = this.getDefaultPermissions(feature.key);
      
      for (const permission of permissions) {
        const conditions = limitsMap ? 
          this.generateConditions(permission.subject, permission.action, limitsMap) : 
          undefined;
        
        can(permission.action, permission.subject, conditions);
      }
    }
  }

  /**
   * Configuração padrão para features (baseada nas features criadas pelo Master)
   */
  private getDefaultPermissions(featureKey: string): FeaturePermission[] {
    const defaultConfig: Record<string, Action[]> = {
      'dashboard': [Action.READ],
      'orders': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'products': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'categories': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'customers': [Action.READ, Action.CREATE, Action.UPDATE, Action.MANAGE],
      'reports': [Action.READ, Action.MANAGE],
      'coupons': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'stock': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'pdv': [Action.READ, Action.MANAGE],
      'kds': [Action.READ, Action.MANAGE],
      'commands': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'kanban': [Action.READ, Action.MANAGE],
      'delivery_areas': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'delivery_persons': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'delivery_routes': [Action.READ, Action.MANAGE],
      'cash_register': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'tables': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'payment_methods': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'points': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'announcements': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'groups': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'users': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'subscription': [Action.READ, Action.UPDATE],
      'branches': [Action.READ, Action.CREATE, Action.UPDATE, Action.DELETE, Action.MANAGE],
      'profile': [Action.READ, Action.UPDATE, Action.MANAGE],
      'hours': [Action.READ, Action.UPDATE, Action.MANAGE],
      'payment': [Action.READ, Action.UPDATE, Action.MANAGE],
    };

    const actions = defaultConfig[featureKey] || [Action.READ];
    const subject = this.mapFeatureToSubject(featureKey);
    
    if (!subject) return [];
    
    return actions.map(action => ({ action, subject }));
  }

  /**
   * Lista todas as features disponíveis no banco com suas permissões
   */
  async listAllFeaturesWithPermissions(): Promise<Array<{
    key: string;
    name: string;
    description: string;
    actions: Action[];
  }>> {
    const features = await prisma.feature.findMany({
      where: { active: true },
      select: {
        key: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' }
    });

    return features.map(feature => {
      const permissions = this.getDefaultPermissions(feature.key);
      const actions = permissions.map(p => p.action);

      return {
        key: feature.key,
        name: feature.name,
        description: feature.description || '',
        actions
      };
    });
  }

  /**
   * Obtém as permissões de uma feature específica
   */
  async getFeaturePermissions(featureKey: string): Promise<Action[]> {
    const permissions = this.getDefaultPermissions(featureKey);
    return permissions.map(p => p.action);
  }

  /**
   * Retorna as permissões (action + subject) para uma lista de feature keys.
   * Útil para criar registros de Permission no banco.
   */
  getPermissionsForFeatureKeys(featureKeys: string[]): FeaturePermission[] {
    const permissions: FeaturePermission[] = [];
    for (const key of featureKeys) {
      permissions.push(...this.getDefaultPermissions(key));
    }
    return permissions;
  }

  /**
   * Atualiza as ações de uma feature (para uso futuro quando tivermos campo no BD)
   */
  async updateFeatureActions(featureKey: string, actions: Action[]): Promise<void> {
    const feature = await prisma.feature.findUnique({
      where: { key: featureKey }
    });

    if (!feature) {
      throw new Error('Feature não encontrada');
    }

    // Futuramente: armazenar no campo defaultActions do banco
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
   * Obtém nome amigável da feature
   */
  private getFeatureDisplayName(key: string): string {
    const names: Record<string, string> = {
      'dashboard': 'Dashboard',
      'orders': 'Pedidos',
      'products': 'Produtos',
      'categories': 'Categorias',
      'customers': 'Clientes',
      'reports': 'Relatórios',
      'coupons': 'Cupons',
      'stock': 'Estoque',
      'pdv': 'Ponto de Venda',
      'kds': 'Kitchen Display',
      'commands': 'Comandas',
      'kanban': 'Kanban',
      'delivery_areas': 'Áreas de Entrega',
      'delivery_persons': 'Entregadores',
      'delivery_routes': 'Rotas de Entrega',
      'cash_register': 'Fluxo de Caixa',
      'tables': 'Mesas',
      'payment_methods': 'Métodos de Pagamento',
      'points': 'Programa de Pontos',
      'announcements': 'Avisos',
      'groups': 'Grupos',
      'users': 'Usuários',
      'subscription': 'Assinatura',
      'branches': 'Filiais',
      'profile': 'Perfil',
      'hours': 'Horários',
      'payment': 'Pagamentos'
    };

    return names[key] || key;
  }

  /**
   * Obtém descrição da feature
   */
  private getFeatureDescription(key: string): string {
    const descriptions: Record<string, string> = {
      'dashboard': 'Visualização do dashboard principal',
      'orders': 'Gestão completa de pedidos',
      'products': 'Gestão do catálogo de produtos',
      'categories': 'Organização de categorias',
      'customers': 'Gestão de clientes',
      'reports': 'Relatórios e análises',
      'coupons': 'Criação e gestão de cupons',
      'stock': 'Controle de estoque',
      'pdv': 'Ponto de venda',
      'kds': 'Exibição na cozinha',
      'commands': 'Gestão de comandas',
      'kanban': 'Gestão visual de pedidos',
      'delivery_areas': 'Definição de áreas de entrega',
      'delivery_persons': 'Gestão de entregadores',
      'delivery_routes': 'Otimização de rotas',
      'cash_register': 'Fluxo de caixa',
      'tables': 'Gestão de mesas',
      'payment_methods': 'Configuração de pagamentos',
      'points': 'Programa de fidelidade',
      'announcements': 'Comunicados e avisos',
      'groups': 'Gestão de grupos e permissões',
      'users': 'Gestão de usuários',
      'subscription': 'Visualização da assinatura',
      'branches': 'Gestão de filiais',
      'profile': 'Configurações de perfil',
      'hours': 'Configurações de horário',
      'payment': 'Configurações de pagamento'
    };

    return descriptions[key] || `Feature: ${key}`;
  }
}
