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

  private async buildContext(
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
}