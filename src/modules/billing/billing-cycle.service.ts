import { Injectable } from '@nestjs/common';
import type { BillingPeriod } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  calculateBillingCycleDates,
  resolveBillingCycleDates,
  type BillingCycleDates,
} from './billing-cycle.util';

@Injectable()
export class BillingCycleService {
  async applyCycleFromPayment(
    subscriptionId: string,
    billingPeriod: BillingPeriod,
    options?: {
      webhookData?: Record<string, unknown>;
      referenceDate?: Date;
    },
  ): Promise<BillingCycleDates> {
    const cycle = options?.webhookData
      ? resolveBillingCycleDates(
          options.webhookData,
          billingPeriod,
          options.referenceDate ?? new Date(),
        )
      : calculateBillingCycleDates(
          options?.referenceDate ?? new Date(),
          billingPeriod,
        );

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodStart: cycle.currentPeriodStart,
        currentPeriodEnd: cycle.currentPeriodEnd,
        nextBillingDate: cycle.nextBillingDate,
        lastBillingDate: cycle.lastBillingDate,
      },
    });

    return cycle;
  }

  /**
   * Estima próxima cobrança para assinaturas sem datas persistidas (ex.: Cakto legado).
   */
  async inferCycleForDisplay(
    subscriptionId: string,
    billingPeriod: BillingPeriod,
  ): Promise<Partial<BillingCycleDates>> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        nextBillingDate: true,
        currentPeriodEnd: true,
        currentPeriodStart: true,
        lastBillingDate: true,
      },
    });

    if (
      subscription?.nextBillingDate ||
      subscription?.currentPeriodEnd
    ) {
      return {
        nextBillingDate: subscription.nextBillingDate ?? undefined,
        currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
        currentPeriodStart: subscription.currentPeriodStart ?? undefined,
        lastBillingDate: subscription.lastBillingDate ?? undefined,
      };
    }

    const lastPayment = await prisma.subscriptionHistory.findFirst({
      where: {
        subscriptionId,
        eventType: { in: ['ACTIVATED', 'RENEWED', 'PAYMENT_SUCCEEDED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!lastPayment) {
      return {};
    }

    return calculateBillingCycleDates(lastPayment.createdAt, billingPeriod);
  }
}
