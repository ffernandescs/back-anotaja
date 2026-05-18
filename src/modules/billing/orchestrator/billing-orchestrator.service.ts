import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from 'lib/prisma';

@Injectable()
export class BillingOrchestratorService {
  private readonly logger = new Logger(BillingOrchestratorService.name);

  async schedulePlanChange(companyId: string, newPlanId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) throw new Error('Subscription not found');

    await prisma.subscription.update({
      where: { companyId },
      data: {
        pendingPlanId: newPlanId,
        scheduledChangeAt: subscription.currentPeriodEnd,
      },
    });

    this.logger.log(`Plano agendado para troca no fim do ciclo`);
  }

  /**
   * Aplica plano agendado por upgrade/downgrade Stripe (fim do ciclo).
   */
  async applyPendingPlanIfNeeded(stripeSubscriptionId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) return;

    if (
      subscription.pendingPlanId &&
      subscription.scheduledChangeAt &&
      new Date() >= subscription.scheduledChangeAt
    ) {
      this.logger.log(
        `Aplicando plano pendente: ${subscription.pendingPlanId} (agendado para ${subscription.scheduledChangeAt.toISOString()}, planId anterior: ${subscription.planId})`,
      );

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: subscription.pendingPlanId,
          pendingPlanId: null,
          scheduledChangeAt: null,
        },
      });

      await this.syncCompanyPermissionsFromPlan(
        subscription.companyId,
        subscription.pendingPlanId,
      );

      this.logger.log(`✅ Plano aplicado automaticamente: ${subscription.pendingPlanId}`);
    } else if (subscription.pendingPlanId) {
      this.logger.log(
        `⏸️ Plano pendente encontrado (${subscription.pendingPlanId}) mas scheduledChangeAt=${subscription.scheduledChangeAt?.toISOString()} ainda não chegou`,
      );
    }
  }

  /**
   * Após pagamento confirmado (Cakto, Asaas, retorno do checkout): aplica pendingPlanId → planId.
   */
  async commitPendingPlanAfterPayment(companyId: string): Promise<{
    applied: boolean;
    planId: string;
  } | null> {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      this.logger.warn(`commitPendingPlanAfterPayment: subscription não encontrada (${companyId})`);
      return null;
    }

    const planIdToApply = subscription.pendingPlanId ?? subscription.planId;

    await prisma.subscription.update({
      where: { companyId },
      data: {
        ...(subscription.pendingPlanId
          ? { planId: subscription.pendingPlanId }
          : {}),
        pendingPlanId: null,
        scheduledChangeAt: null,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    await this.syncCompanyPermissionsFromPlan(companyId, planIdToApply);

    this.logger.log(
      `✅ Assinatura ativada para company ${companyId} — plano ${planIdToApply}${subscription.pendingPlanId ? ' (aplicado de pendingPlanId)' : ''}`,
    );

    return {
      applied: !!subscription.pendingPlanId,
      planId: planIdToApply,
    };
  }

  async syncCompanyPermissionsFromPlan(companyId: string, planId: string) {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        planFeatures: {
          include: { feature: true },
        },
      },
    });

    if (!plan) return;

    const featureKeys = plan.planFeatures
      .filter((pf) => pf.feature.active)
      .map((pf) => pf.feature.key);

    const fullCrud = ['read', 'create', 'update', 'delete', 'manage'];

    const permissions: {
      action: string;
      subject: string;
      inverted: boolean;
    }[] = [];

    for (const key of featureKeys) {
      for (const action of fullCrud) {
        permissions.push({
          action,
          subject: key,
          inverted: false,
        });
      }
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: {
          include: {
            groups: true,
          },
        },
      },
    });

    for (const branch of company?.branches || []) {
      for (const group of branch.groups) {
        await prisma.permission.deleteMany({
          where: { groupId: group.id, source: 'PLAN' },
        });

        if (permissions.length > 0) {
          await prisma.permission.createMany({
            data: permissions.map((p) => ({
              groupId: group.id,
              ...p,
              source: 'PLAN',
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    this.logger.log(`🔐 Permissões sincronizadas para plano ${planId}`);
  }
}
