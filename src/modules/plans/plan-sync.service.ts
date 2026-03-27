import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { PlanType, AddonType } from '../../ability/types/ability.types';
import { AbilityLoaderService } from '../../ability/factory/ability-loader.service';

@Injectable()
export class PlanSyncService {
  private readonly logger = new Logger(PlanSyncService.name);

  constructor(
    private readonly abilityLoaderService: AbilityLoaderService,
  ) {}

  /**
   * Sincroniza permissões de todos os grupos quando um plano é atualizado
   */
  async syncPlanPermissions(planId: string): Promise<void> {
    this.logger.log(`🔄 Iniciando sincronização de permissões para o plano ${planId}`);

    try {
      // 1. Buscar informações do plano atualizado
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
        include: {
          planFeatures: {
            include: {
              feature: true,
            },
          },
        },
      });

      if (!plan) {
        throw new Error(`Plano ${planId} não encontrado`);
      }

      // 2. Buscar todas as subscriptions ativas deste plano
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          planId: planId,
          status: 'ACTIVE',
        },
        include: {
          company: {
            include: {
              branches: {
                include: {
                  groups: true,
                },
              },
            },
          },
        },
      });

      if (activeSubscriptions.length === 0) {
        this.logger.log(`✅ Nenhuma subscription ativa encontrada para o plano ${planId}`);
        return;
      }

      // 3. Coletar todos os grupos afetados
      const affectedGroups = activeSubscriptions.flatMap(subscription =>
        subscription.company.branches.flatMap(branch => branch.groups)
      );

      if (affectedGroups.length === 0) {
        this.logger.log(`✅ Nenhum grupo encontrado para as subscriptions do plano ${planId}`);
        return;
      }

      // 4. Gerar novas permissões baseadas nas features do plano
      const newPermissions = await this.generatePlanPermissions(plan);

      // 5. Atualizar todos os grupos afetados
      const updatePromises = affectedGroups.map(group =>
        this.updateGroupPermissions(group.id, newPermissions)
      );

      const results = await Promise.allSettled(updatePromises);
      
      // 6. Log dos resultados
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.logger.log(
        `✅ Sincronização concluída: ${successful} grupos atualizados, ${failed} falhas`
      );

      if (failed > 0) {
        const errors = results
          .filter(r => r.status === 'rejected')
          .map(r => (r as PromiseRejectedResult).reason);
        this.logger.error(`❌ Erros na sincronização:`, errors);
      }

    } catch (error) {
      this.logger.error(`❌ Erro na sincronização do plano ${planId}:`, error);
      throw error;
    }
  }

  /**
   * Gera permissões baseadas nas features do plano
   */
  private async generatePlanPermissions(plan: any): Promise<any[]> {
    const planPermissions: any[] = [];

    // Para cada feature do plano
    for (const planFeature of plan.planFeatures) {
      const feature = planFeature.feature;
      
      // Parsear permissões padrão da feature
      const defaultActions = feature.defaultActions 
        ? JSON.parse(feature.defaultActions) 
        : ['read'];

      // Gerar permissões para cada ação
      const permissions = defaultActions.map((action: string) => ({
        action: action,
        subject: feature.key,
        inverted: false,
      }));

      planPermissions.push(...permissions);
    }

    return planPermissions;
  }

  /**
   * Atualiza permissões de um grupo específico
   */
  private async updateGroupPermissions(groupId: string, newPermissions: any[]): Promise<void> {
    try {
      // Remover permissões antigas
      await prisma.permission.deleteMany({
        where: { groupId },
      });

      // Adicionar novas permissões
      if (newPermissions.length > 0) {
        await prisma.permission.createMany({
          data: newPermissions.map(permission => ({
            ...permission,
            groupId,
          })),
        });
      }

      this.logger.debug(`✅ Grupo ${groupId} atualizado com ${newPermissions.length} permissões`);
    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar grupo ${groupId}:`, error);
      throw error;
    }
  }

  /**
   * Sincroniza permissões para uma empresa específica
   */
  async syncCompanyPermissions(companyId: string): Promise<void> {
    this.logger.log(`🔄 Sincronizando permissões para a empresa ${companyId}`);

    try {
      // Buscar subscription ativa da empresa
      const subscription = await prisma.subscription.findFirst({
        where: {
          companyId,
          status: 'ACTIVE',
        },
        include: {
          plan: {
            include: {
              planFeatures: {
                include: {
                  feature: true,
                },
              },
            },
          },
        },
      });

      if (!subscription) {
        this.logger.log(`✅ Nenhuma subscription ativa encontrada para a empresa ${companyId}`);
        return;
      }

      // Buscar todos os grupos da empresa
      const groups = await prisma.group.findMany({
        where: {
          companyId,
        },
      });

      if (groups.length === 0) {
        this.logger.log(`✅ Nenhum grupo encontrado para a empresa ${companyId}`);
        return;
      }

      // Gerar novas permissões
      const newPermissions = await this.generatePlanPermissions(subscription.plan);

      // Atualizar todos os grupos
      const updatePromises = groups.map(group =>
        this.updateGroupPermissions(group.id, newPermissions)
      );

      await Promise.all(updatePromises);

      this.logger.log(`✅ ${groups.length} grupos da empresa ${companyId} atualizados`);

    } catch (error) {
      this.logger.error(`❌ Erro na sincronização da empresa ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Sincroniza permissões para uma branch específica
   */
  async syncBranchPermissions(branchId: string): Promise<void> {
    this.logger.log(`🔄 Sincronizando permissões para a branch ${branchId}`);

    try {
      // Buscar informações da branch
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        include: {
          company: {
            include: {
              subscription: {
                where: { status: 'ACTIVE' },
                include: {
                  plan: {
                    include: {
                      planFeatures: {
                        include: {
                          feature: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          groups: true,
        },
      });

      if (!branch) {
        throw new Error(`Branch ${branchId} não encontrada`);
      }

      const activeSubscription = branch.company.subscription;
      if (!activeSubscription) {
        this.logger.log(`✅ Nenhuma subscription ativa encontrada para a branch ${branchId}`);
        return;
      }

      // Buscar grupos da branch
      const groups = await prisma.group.findMany({
        where: { branchId },
      });

      if (groups.length === 0) {
        this.logger.log(`✅ Nenhum grupo encontrado para a branch ${branchId}`);
        return;
      }

      // Gerar novas permissões
      const newPermissions = await this.generatePlanPermissions(activeSubscription.plan);

      // Atualizar grupos da branch
      const updatePromises = groups.map(group =>
        this.updateGroupPermissions(group.id, newPermissions)
      );

      await Promise.all(updatePromises);

      this.logger.log(`✅ ${groups.length} grupos da branch ${branchId} atualizados`);

    } catch (error) {
      this.logger.error(`❌ Erro na sincronização da branch ${branchId}:`, error);
      throw error;
    }
  }
}
