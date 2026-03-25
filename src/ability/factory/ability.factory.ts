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
import { applyPlanRules } from './plan-rules';

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
    applyPlanRules(
      can as (action: Action | Action[], subject: Subject | Subject[]) => void,
      ctx.tenant.plan,
      ctx.tenant.addons,
    );

    // ── CAMADA 2: Grupo do usuário ────────────────────────────
    if (ctx.user.group?.permissions?.length) {
      this.applyRules(
        can as (action: Action, subject: Subject) => void,
        cannot as (action: Action, subject: Subject) => void,
        ctx.user.group.permissions,
      );
    }

    // ── CAMADA 3: Overrides do usuário ────────────────────────
    if (ctx.user.permissions?.length) {
      this.applyRules(
        can as (action: Action, subject: Subject) => void,
        cannot as (action: Action, subject: Subject) => void,
        ctx.user.permissions,
      );
    }

    return build();
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
}