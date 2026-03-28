// ─────────────────────────────────────────────────────────────
// ability/factory/ability-loader.service.ts
//
// Carrega o contexto completo do banco (user + tenant com addons)
// e monta a ability. Centraliza a query do Prisma para que o
// AbilityFactory fique desacoplado do ORM.
// ─────────────────────────────────────────────────────────────

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { AbilityFactory } from './ability.factory';
import { FeaturePermissionsService } from './feature-permissions.service';
import {
  AbilityContext,
  Action,
  AddonType,
  AppAbility,
  PlanType,
  Subject,
} from '../types/ability.types';

// Importar funções dinâmicas do plan-rules
import { getPlanFeatures, getAddonFeatures, getPlanLimits } from './plan-rules';

@Injectable()
export class AbilityLoaderService {
  constructor(
    private readonly abilityFactory: AbilityFactory,
    private readonly featurePermissionsService: FeaturePermissionsService,
  ) {}

  /**
   * Carrega o contexto do banco e retorna a ability montada.
   * Chamado pelo AbilitiesGuard em cada request autenticado.
   */
  async loadAbility(userId: string, companyId: string): Promise<AppAbility> {
    const ctx = await this.buildContext(userId, companyId);
    return await this.abilityFactory.createForUser(ctx);
  }

  async buildContext(
    userId: string,
    companyId: string,
  ): Promise<AbilityContext> {
    // Carrega user com grupo e overrides em uma query
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        groupId: true,
        permissions: {
          select: { action: true, subject: true, inverted: true },
        },
        group: {
          select: {
            permissions: {
              select: { action: true, subject: true, inverted: true },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        createdAt: true,
        subscription: {
          select: {
            plan: { select: { type: true, id: true } },
            addons: {
              where: {
                // Apenas add-ons ainda ativos (sem endDate ou endDate no futuro)
                OR: [
                  { endDate: null },
                  { endDate: { gt: new Date() } },
                ],
              },
              select: {
                addon: { select: { key: true } },
              },
            },
            startDate: true,
            endDate: true,
            createdAt: true,
            status: true,
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    // Se não tiver assinatura ativa, o plano padrão deve ser tratado
    // mas aqui o AbilityFactory espera um Plano. 
    // Vamos garantir que sempre haja um PlanType para o applyPlanRules.
    const planType = (company.subscription?.plan?.type as PlanType) || PlanType.BASIC;
    const planId = (company.subscription?.plan?.id as string);
    if (!planId) throw new NotFoundException('Plano não encontrada');

    const activeAddons = company.subscription?.addons?.map(
      (sa) => sa.addon.key as AddonType,
    ) || [];

    return {
      user: {
        id: user.id,
        groupId: user.groupId,
        permissions: user.permissions.map((p) => ({
          action: p.action as Action,
          subject: p.subject as Subject,
          inverted: p.inverted,
        })),
        group: user.group
          ? {
              permissions: user.group.permissions.map((p) => ({
                action: p.action as Action,
                subject: p.subject as Subject,
                inverted: p.inverted,
              })),
            }
          : null,
      },
      tenant: {
        plan: planType,
        planId: planId,
        createdAt: company.createdAt,
        subscriptionStart: company.subscription?.startDate || company.createdAt,
        subscriptionEnd: company.subscription?.endDate || null,
        subscriptionStatus: company.subscription?.status || 'INACTIVE',
        addons: activeAddons,
      },
    };
  }

  async filterPermissionsByPlan(
    permissions: any[],
    plan: PlanType,
    addons: AddonType[]
  ): Promise<any[]> {
    // ✅ Usar o sistema de features dinâmicas
    const allFeatures = await this.featurePermissionsService.listAllFeaturesWithPermissions();
    
    // ✅ Obter features do plano usando o sistema dinâmico do banco
    const planFeatureKeys = await getPlanFeatures(plan);
    const addonFeatureKeys = await getAddonFeatures(addons);
    
    // Combinar features do plano + addons
    const allowedFeatureKeys = [...planFeatureKeys, ...addonFeatureKeys];
    
    // Filtrar features permitidas
    const allowedFeatures = allFeatures.filter(feature => 
      allowedFeatureKeys.includes(feature.key)
    );
    
    // Gerar permissões do plano baseado nas features permitidas
    const planPermissions = allowedFeatures.flatMap(feature => 
      feature.actions.map(action => ({
        action: action,
        subject: feature.key as any, // ✅ Usa feature key como subject
        inverted: false
      }))
    );
    
    // Filtrar para incluir apenas permissões que estão no plano
    return permissions.filter(permission => {
      // Se for ALL, só permitir se o plano tiver ALL
      if (permission.subject === Subject.ALL) {
        return planPermissions.some(p => p.subject === Subject.ALL);
      }
      
      // Verificar se a permissão específica está no plano
      return planPermissions.some(p => 
        p.action === permission.action && p.subject === permission.subject
      );
    });
  }
}