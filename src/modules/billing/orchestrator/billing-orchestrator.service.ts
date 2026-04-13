import { Injectable, Logger } from '@nestjs/common';
import { prisma } from 'lib/prisma';

@Injectable()
export class BillingOrchestratorService {
  private readonly logger = new Logger(BillingOrchestratorService.name);

  async schedulePlanChange(companyId: string, newPlanId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) throw new Error('Subscription not found');

    // 🔥 agenda troca no fim do ciclo
    await prisma.subscription.update({
      where: { companyId },
      data: {
        pendingPlanId: newPlanId,
        scheduledChangeAt: subscription.currentPeriodEnd,
      },
    });

    this.logger.log(`Plano agendado para troca no fim do ciclo`);
  }

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
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: subscription.pendingPlanId,
          pendingPlanId: null,
          scheduledChangeAt: null,
        },
      });

      this.logger.log(`Plano aplicado automaticamente`);
    }
  }
}