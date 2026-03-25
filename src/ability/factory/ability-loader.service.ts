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
import {
  AbilityContext,
  Action,
  AddonType,
  AppAbility,
  PlanType,
  Subject,
} from '../types/ability.types';

@Injectable()
export class AbilityLoaderService {
  constructor(
    private readonly abilityFactory: AbilityFactory,
  ) {}

  /**
   * Carrega o contexto do banco e retorna a ability montada.
   * Chamado pelo AbilitiesGuard em cada request autenticado.
   */
  async loadAbility(userId: string, companyId: string): Promise<AppAbility> {
    const ctx = await this.buildContext(userId, companyId);
    return this.abilityFactory.createForUser(ctx);
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
            plan: { select: { type: true } },
            addons: {
              where: {
                // Apenas add-ons ainda ativos (sem endDate ou endDate no futuro)
                OR: [
                  { endDate: null },
                  { endDate: { gt: new Date() } },
                ],
              },
              select: {
                addon: { select: { type: true } },
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
    const activeAddons = company.subscription?.addons?.map(
      (sa) => sa.addon.type as AddonType,
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
    // Importar PLAN_FEATURES e ADDON_FEATURES do plan-rules
    const { PLAN_FEATURES, ADDON_FEATURES } = await import('./plan-rules');
    
    const planPermissions: any[] = [];
    
    // Adicionar permissões do plano
    const planFeatures = PLAN_FEATURES[plan] || [];
    for (const [action, subject] of planFeatures) {
      if (Array.isArray(subject)) {
        for (const s of subject) {
          planPermissions.push({ action, subject: s, inverted: false });
        }
      } else {
        planPermissions.push({ action, subject, inverted: false });
      }
    }
    
    // Adicionar permissões dos add-ons
    for (const addon of addons) {
      const addonFeatures = ADDON_FEATURES[addon] || [];
      for (const [action, subject] of addonFeatures) {
        planPermissions.push({ action, subject, inverted: false });
      }
    }
    
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