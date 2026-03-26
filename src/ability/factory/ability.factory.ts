// ─────────────────────────────────────────────────────────────
// ability/factory/ability.factory.ts
//
// Monta a ability final com o merge das 3 camadas:
//   1. Plano do tenant  → teto máximo de features
//   2. Grupo do usuário → permissões configuradas pelo admin
//   3. Overrides        → ajustes individuais por usuário
//
// IMPORTANTE: o CASL usa LIFO (last-in-first-out) por padrão
// com detectSubjectType. A ordem de aplicação das regras
// garante que overrides do usuário sempre prevalecem.
// ─────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { differenceInDays } from 'date-fns';

import {
  AbilityContext,
  Action,
  AddonType,
  AppAbility,
  PermissionRule,
  PlanType,
  Subject,
} from '../types/ability.types';
import { applyPlanRules, PLAN_FEATURES, ADDON_FEATURES } from './plan-rules';

@Injectable()
export class AbilityFactory {
  /**
   * Ponto de entrada principal.
   * Recebe o contexto já carregado do banco (user + tenant)
   * e retorna a ability final com as 3 camadas aplicadas.
   */
  createForUser(ctx: AbilityContext): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    const { status, daysSinceExpiration } = this.getSubscriptionStatus(ctx.tenant);

    // ── CAMADA 0: Política de Bloqueio Progressivo ──────────────
    
    // 1. BLOQUEIO TOTAL (Hard Cut)
    if (status === 'BLOCKED') {
      cannot(Action.MANAGE, Subject.ALL);
      return build();
    }

    // 2. SUSPENSÃO (Read-Only + Billing)
    // Ocorre após o Grace Period. Usuário vê dados mas não opera.
    if (status === 'SUSPENDED') {
      cannot(Action.MANAGE, Subject.ALL);
      can(Action.READ, Subject.ALL); // Pode ver tudo
      can(Action.MANAGE, Subject.SUBSCRIPTION); // Pode gerenciar assinatura para pagar
      cannot(Action.CREATE, Subject.ORDER); // Não pode criar pedidos
      cannot(Action.UPDATE, Subject.ORDER); // Não pode mudar status
      cannot(Action.CREATE, Subject.PRODUCT);
      return build();
    }

    // 3. GRACE PERIOD ou ATIVO
    // Se estiver no Grace Period, deixamos passar para as próximas camadas 
    // (Plano -> Grupo -> Overrides) como se estivesse ativo.

    // ── CAMADA 1: Plano do tenant ─────────────────────────────
    // Define o teto máximo de features disponíveis para o tenant
    // Esta é a base sobre a qual todas as outras camadas serão construídas
    applyPlanRules(
      can as (action: Action | Action[], subject: Subject | Subject[]) => void,
      ctx.tenant.plan,
      ctx.tenant.addons,
    );

    // ── CAMADA 2: Grupos por filial (Branch) ────────────────────
    // Admin configura grupos dentro do que o plano permite
    // Os grupos herdam as permissões permitidas pelo plano
    if (ctx.user.group?.permissions?.length) {
      // Filtrar permissões do grupo para incluir apenas as permitidas pelo plano
      const filteredGroupPermissions = this.filterPermissionsByPlan(
        ctx.user.group.permissions,
        ctx.tenant.plan,
        ctx.tenant.addons
      );
      
      this.applyRules(
        can as (action: Action, subject: Subject) => void,
        cannot as (action: Action, subject: Subject) => void,
        filteredGroupPermissions,
      );
    }

    // ── CAMADA 3: Overrides por usuário ────────────────────────
    // Permissões individuais que somam (+) ou removem (−) do grupo
    // João (Vendedor): + ver relatórios
    // Maria (Gerente): - criar cupons
    if (ctx.user.permissions?.length) {
      // Overrides podem adicionar ou remover permissões do grupo
      // Mas ainda devem respeitar o teto do plano
      const filteredUserOverrides = this.filterPermissionsByPlan(
        ctx.user.permissions,
        ctx.tenant.plan,
        ctx.tenant.addons
      );
      
      this.applyRules(
        can as (action: Action, subject: Subject) => void,
        cannot as (action: Action, subject: Subject) => void,
        filteredUserOverrides,
      );
    }

    return build();
  }

  /**
   * ✅ Calcula as permissões efetivas do usuário
   * Combina: GRUPO + OVERRIDES (respeitando o teto do PLANO)
   * 
   * Usado pelo MenuService para filtrar o menu baseado nas permissões reais do usuário
   */
  getEffectivePermissions(
    groupPermissions: PermissionRule[] | undefined,
    userOverrides: PermissionRule[] | undefined,
    plan: PlanType,
    addons: AddonType[]
  ): PermissionRule[] {
    const effectivePermissions: PermissionRule[] = [];
    
    // 1. Adicionar permissões do grupo (filtradas pelo plano)
    if (groupPermissions?.length) {
      const filteredGroupPermissions = this.filterPermissionsByPlan(
        groupPermissions,
        plan,
        addons
      );
      effectivePermissions.push(...filteredGroupPermissions);
    }
    
    // 2. Aplicar overrides do usuário (filtrados pelo plano)
    if (userOverrides?.length) {
      const filteredUserOverrides = this.filterPermissionsByPlan(
        userOverrides,
        plan,
        addons
      );
      
      for (const override of filteredUserOverrides) {
        const existingIndex = effectivePermissions.findIndex(
          p => p.action === override.action && p.subject === override.subject
        );
        
        if (override.inverted) {
          // Remove permissão (cannot)
          if (existingIndex !== -1) {
            effectivePermissions.splice(existingIndex, 1);
          }
        } else {
          // Adiciona permissão (can) se não existir
          if (existingIndex === -1) {
            effectivePermissions.push(override);
          }
        }
      }
    }
    
    return effectivePermissions;
  }

  // ── Helpers privados ─────────────────────────────────────────

  private getSubscriptionStatus(tenant: AbilityContext['tenant']): { 
    status: 'ACTIVE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'BLOCKED',
    daysSinceExpiration: number 
  } {
    const now = new Date();
    
    // 1. Data de expiração (Término da assinatura ou Trial)
    const trialDays = parseInt(process.env.TRIAL_DAYS ?? '7', 10);
    let expirationDate: Date;

    if (tenant.subscriptionEnd) {
      // Se tem data de término definida (assinatura paga ou trial com fim marcado)
      expirationDate = new Date(tenant.subscriptionEnd);
    } else {
      // Se não tem data de término, calcula com base no início ou criação
      const referenceDate = tenant.subscriptionStart ? new Date(tenant.subscriptionStart) : new Date(tenant.createdAt);
      expirationDate = new Date(referenceDate);
      expirationDate.setDate(referenceDate.getDate() + trialDays);
    }

    // 2. Se ainda não expirou, está ATIVO
    if (now <= expirationDate) {
      // Caso especial: Se o status no banco for explicitamente INACTIVE ou CANCELLED
      // mesmo antes da data de término, podemos considerar bloqueado.
      if (['INACTIVE', 'CANCELLED'].includes(tenant.subscriptionStatus)) {
        return { status: 'BLOCKED', daysSinceExpiration: 0 };
      }
      return { status: 'ACTIVE', daysSinceExpiration: 0 };
    }

    // 3. Cálculo do atraso (dias após a expiração)
    const diff = differenceInDays(now, expirationDate);
    const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? '3', 10);
    const suspensionDays = parseInt(process.env.SUSPENSION_DAYS ?? '15', 10);

    // 4. Régua de bloqueio progressivo
    if (diff <= gracePeriodDays) {
      return { status: 'GRACE_PERIOD', daysSinceExpiration: diff };
    }

    if (diff <= (gracePeriodDays + suspensionDays)) {
      return { status: 'SUSPENDED', daysSinceExpiration: diff };
    }

    return { status: 'BLOCKED', daysSinceExpiration: diff };
  }

  private applyRules(
    can: (action: Action, subject: Subject) => void,
    cannot: (action: Action, subject: Subject) => void,
    permissions: PermissionRule[],
  ): void {
    for (const { action, subject, inverted } of permissions) {
      if (inverted) {
        cannot(action, subject);
      } else {
        can(action, subject);
      }
    }
  }

  private filterPermissionsByPlan(
    permissions: PermissionRule[],
    plan: PlanType,
    addons: AddonType[]
  ): PermissionRule[] {
    // Obter as permissões permitidas pelo plano + add-ons
    const planPermissions = this.getPlanPermissions(plan, addons);
    
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

  private getPlanPermissions(plan: PlanType, addons: AddonType[]): PermissionRule[] {
    const permissions: PermissionRule[] = [];
    
    // Adicionar permissões do plano
    const planFeatures = PLAN_FEATURES[plan] || [];
    for (const [action, subject] of planFeatures) {
      if (Array.isArray(subject)) {
        for (const s of subject) {
          permissions.push({ action, subject: s, inverted: false });
        }
      } else {
        permissions.push({ action, subject, inverted: false });
      }
    }
    
    // Adicionar permissões dos add-ons
    for (const addon of addons) {
      const addonFeatures = ADDON_FEATURES[addon] || [];
      for (const [action, subject] of addonFeatures) {
        permissions.push({ action, subject, inverted: false });
      }
    }
    
    return permissions;
  }
}