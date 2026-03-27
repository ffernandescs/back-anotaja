import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { prisma } from '../../lib/prisma';
import { AbilityLoaderService } from '../ability/factory/ability-loader.service';
import { Action, Subject } from '../ability/types/ability.types';

@Injectable()
export class AccessService {
  constructor(private readonly abilityLoader: AbilityLoaderService) {}

  /**
   * Ponto único de verificação de acesso
   * Fluxo: hasFeature() → can() → withinLimit()
   */
  async checkAccess(
    userId: string,
    companyId: string,
    action: Action,
    subject: Subject,
    resource?: string
  ): Promise<boolean> {
    // 1. Verificar se empresa tem a feature necessária
    if (!(await this.hasFeature(companyId, this.getFeatureForSubject(subject)))) {
      throw new ForbiddenException('Plano não possui esta feature');
    }

    // 2. Verificar permissão do usuário
    if (!(await this.can(userId, companyId, action, subject))) {
      throw new ForbiddenException('Usuário não tem permissão para esta ação');
    }

    // 3. Verificar limites (se aplicável)
    if (resource && this.isResourceLimited(subject)) {
      if (!(await this.withinLimit(companyId, resource))) {
        throw new ForbiddenException('Limite do plano excedido');
      }
    }

    return true;
  }

  /**
   * Verifica se empresa tem acesso a uma feature
   */
  async hasFeature(companyId: string, featureKey: string): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        subscription: {
          select: {
            plan: {
              select: {
                planFeatures: {
                  select: {
                    feature: {
                      select: { key: true }
                    }
                  }
                }
              }
            },
            addons: {
              where: {
                OR: [
                  { endDate: null },
                  { endDate: { gt: new Date() } },
                ],
              },
              select: {
                addon: {
                  select: {
                    features: {
                      select: {
                        feature: {
                          select: { key: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    if (!company?.subscription) {
      // Se não tiver assinatura, verificar features do plano básico
      const basicPlan = await prisma.plan.findFirst({
        where: { type: 'BASIC' },
        select: {
          planFeatures: {
            select: {
              feature: {
                select: { key: true }
              }
            }
          }
        }
      });

      return basicPlan?.planFeatures.some(pf => pf.feature.key === featureKey) || false;
    }

    // Verificar features do plano
    const planFeatures = company.subscription.plan.planFeatures.map(pf => pf.feature.key);
    
    // Verificar features dos addons
    const addonFeatures = company.subscription.addons.flatMap(sa => 
      sa.addon.features.map(af => af.feature.key)
    );

    return [...planFeatures, ...addonFeatures].includes(featureKey);
  }

  async canAccessFeature(companyId: string, feature: string): Promise<boolean> {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Implementar canAccessFeature com nova estrutura FeatureLimit');
    console.log('CompanyId:', companyId, 'Feature:', feature);
    
    // Por enquanto, retornar true para não quebrar a funcionalidade
    return true;
  }

  /**
   * Verifica se usuário pode realizar ação em um subject
   */
  async can(userId: string, companyId: string, action: Action, subject: Subject): Promise<boolean> {
    const ability = await this.abilityLoader.loadAbility(userId, companyId);
    return ability.can(action, subject);
  }

  /**
   * Verifica e atualiza limites
   */
  async checkLimit(companyId: string, resource: string, amount: number = 1): Promise<{
    allowed: boolean;
    current: number;
    max: number;
    remaining: number;
  }> {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Implementar checkLimit com nova estrutura FeatureLimit');
    console.log('CompanyId:', companyId, 'Resource:', resource, 'Amount:', amount);
    
    // Retornar valores mock temporariamente
    return {
      allowed: true,
      current: 0,
      max: 0,
      remaining: 0
    };
  }

  /**
   * Verifica se empresa está dentro dos limites
   */
  async withinLimit(companyId: string, resource: string): Promise<boolean> {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Implementar withinLimit com nova estrutura FeatureLimit');
    console.log('CompanyId:', companyId, 'Resource:', resource);
    
    // Por enquanto, retornar true para não quebrar a funcionalidade
    return true;
  }

  async isWithinLimit(companyId: string, resource: string): Promise<boolean> {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Implementar isWithinLimit com nova estrutura FeatureLimit');
    console.log('CompanyId:', companyId, 'Resource:', resource);
    
    // Por enquanto, retornar true para não quebrar a funcionalidade
    return true;
  }

  /**
   * Obtém uso atual de um recurso
   */
  private async getCurrentUsage(companyId: string, resource: string): Promise<number> {

    switch (resource) {
      case 'users':
        return await prisma.user.count({
          where: { companyId }
        });
      
      case 'products':
        return await prisma.product.count({
          where: { companyId }
        });
      
      case 'branches':
        return await prisma.branch.count({
          where: { companyId }
        });
      
      case 'ordersPerMonth':
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        return await prisma.order.count({
          where: {
            branch: { companyId },
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth
            }
          }
        });
      
      case 'deliveryPersons':
        return await prisma.deliveryPerson.count({
          where: { companyId }
        });
      
      default:
        // Para recursos não mapeados, verificar UsageCounter
        const counter = await prisma.usageCounter.findFirst({
          where: {
            companyId,
            resource,
            branchId: null // Nível company
          }
        });
        
        return counter?.count || 0;
    }
  }

  /**
   * Mapeia subject para feature key
   */
  getFeatureForSubject(subject: Subject): string {
    const mapping: Record<string, string> = {
      [Subject.ORDER]: 'orders',
      [Subject.PRODUCT]: 'products',
      [Subject.CATEGORY]: 'categories',
      [Subject.COMPLEMENT]: 'complements',
      [Subject.CUSTOMER]: 'customers',
      [Subject.DASHBOARD]: 'dashboard',
      [Subject.PROFILE]: 'profile',
      [Subject.HOURS]: 'hours',
      [Subject.PAYMENT]: 'payment',
      [Subject.KANBAN]: 'kanban',
      [Subject.PDV]: 'pdv',
      [Subject.KDS]: 'kds',
      [Subject.COMMANDS]: 'commands',
      [Subject.REPORT]: 'report',
      [Subject.COUPON]: 'coupon',
      [Subject.DELIVERY_ROUTE]: 'delivery_routes',
      [Subject.STOCK]: 'stock',
      [Subject.DELIVERY_AREA]: 'delivery_areas',
      [Subject.DELIVERY_PERSON]: 'delivery_persons',
      [Subject.CASH_REGISTER]: 'cash_register',
      [Subject.TABLE]: 'tables',
      [Subject.PAYMENT_METHOD]: 'payment_method',
      [Subject.POINTS]: 'points',
      [Subject.ANNOUNCEMENT]: 'announcement',
      [Subject.GROUP]: 'groups',
      [Subject.USER]: 'users',
      [Subject.SUBSCRIPTION]: 'subscription',
      [Subject.BRANCH]: 'branches',
      [Subject.ALL]: 'all'
    };

    return mapping[subject] || 'basic';
  }

  /**
   * Verifica se subject tem controle de limite
   */
  private isResourceLimited(subject: Subject): boolean {
    const limitedSubjects = [
      Subject.USER,
      Subject.PRODUCT,
      Subject.BRANCH,
      Subject.ORDER,
      Subject.DELIVERY_PERSON
    ];

    return limitedSubjects.includes(subject);
  }

  /**
   * Incrementa contador de uso
   */
  async incrementUsage(
    companyId: string,
    resource: string,
    branchId?: string,
    amount: number = 1
  ): Promise<void> {
    // Verificar se pode incrementar
    if (!(await this.withinLimit(companyId, resource))) {
      throw new ForbiddenException(`Limite de ${resource} excedido`);
    }

    // Atualizar contador
    const resetAt = resource === 'ordersPerMonth' ? this.getNextMonthStart() : null;

    await prisma.usageCounter.upsert({
      where: {
        companyId_branchId_resource: {
          companyId,
          branchId: branchId || '',
          resource
        }
      },
      update: {
        count: { increment: amount },
        resetAt
      },
      create: {
        companyId,
        resource,
        branchId: branchId || '',
        count: amount,
        resetAt
      }
    });
  }

  /**
   * Decrementa contador de uso
   */
  async decrementUsage(
    companyId: string,
    resource: string,
    branchId?: string,
    amount: number = 1
  ): Promise<void> {
    await prisma.usageCounter.updateMany({
      where: {
        companyId,
        resource,
        branchId: branchId || null
      },
      data: {
        count: { decrement: amount }
      }
    });
  }

  /**
   * Obtém status dos limites da empresa
   */
  async getLimitsStatus(companyId: string): Promise<any> {
    // TODO: Implementar quando FeatureLimit estiver disponível
    console.log('TODO: Implementar getLimitsStatus com nova estrutura FeatureLimit');
    
    // Retornar status mock temporariamente
    return {
      users: {
        current: 0,
        max: 0,
        percentage: 0,
        exceeded: false
      },
      products: {
        current: 0,
        max: 0,
        percentage: 0,
        exceeded: false
      },
      orders_per_month: {
        current: 0,
        max: 0,
        percentage: 0,
        exceeded: false
      }
    };
  }

  private getNextMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}
