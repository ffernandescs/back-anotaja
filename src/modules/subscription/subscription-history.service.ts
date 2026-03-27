import { Injectable } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { SubscriptionEventType, SubscriptionStatus, BillingPeriod } from '@prisma/client';

interface CreateHistoryParams {
  subscriptionId: string;
  eventType: SubscriptionEventType;
  previousPlanId?: string;
  newPlanId?: string;
  previousStatus?: SubscriptionStatus;
  newStatus?: SubscriptionStatus;
  previousBillingPeriod?: BillingPeriod;
  newBillingPeriod?: BillingPeriod;
  amount?: number;
  stripeEventId?: string;
  userId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class SubscriptionHistoryService {
  /**
   * Registra um evento no histórico de assinatura
   */
  async createHistoryEntry(params: CreateHistoryParams) {
    const {
      subscriptionId,
      eventType,
      previousPlanId,
      newPlanId,
      previousStatus,
      newStatus,
      previousBillingPeriod,
      newBillingPeriod,
      amount,
      stripeEventId,
      userId,
      reason,
      metadata,
    } = params;

    return prisma.subscriptionHistory.create({
      data: {
        subscriptionId,
        eventType,
        previousPlanId,
        newPlanId,
        previousStatus,
        newStatus,
        previousBillingPeriod,
        newBillingPeriod,
        amount,
        stripeEventId,
        userId,
        reason,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
      include: {
        previousPlan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
          },
        },
        newPlan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
          },
        },
      },
    });
  }

  /**
   * Busca histórico de uma assinatura
   */
  async getSubscriptionHistory(subscriptionId: string, limit = 50) {
    return prisma.subscriptionHistory.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        previousPlan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
          },
        },
        newPlan: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            billingPeriod: true,
          },
        },
      },
    });
  }

  /**
   * Busca histórico de uma empresa
   */
  async getCompanyHistory(companyId: string, limit = 50) {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      select: { id: true },
    });

    if (!subscription) {
      return [];
    }

    return this.getSubscriptionHistory(subscription.id, limit);
  }

  /**
   * Registra mudança de plano
   */
  async logPlanChange(
    subscriptionId: string,
    previousPlanId: string,
    newPlanId: string,
    userId?: string,
    reason?: string,
  ) {
    const previousPlan = await prisma.plan.findUnique({
      where: { id: previousPlanId },
    });
    const newPlan = await prisma.plan.findUnique({
      where: { id: newPlanId },
    });

    if (!previousPlan || !newPlan) {
      throw new Error('Plano não encontrado');
    }

    // Determinar tipo de evento (upgrade, downgrade ou mudança)
    let eventType: SubscriptionEventType;
    if (newPlan.price > previousPlan.price) {
      eventType = 'PLAN_UPGRADED';
    } else if (newPlan.price < previousPlan.price) {
      eventType = 'PLAN_DOWNGRADED';
    } else {
      eventType = 'PLAN_CHANGED';
    }

    return this.createHistoryEntry({
      subscriptionId,
      eventType,
      previousPlanId,
      newPlanId,
      userId,
      reason,
      metadata: {
        previousPlanName: previousPlan.name,
        newPlanName: newPlan.name,
        previousPrice: previousPlan.price,
        newPrice: newPlan.price,
      },
    });
  }

  /**
   * Registra mudança de status
   */
  async logStatusChange(
    subscriptionId: string,
    previousStatus: SubscriptionStatus,
    newStatus: SubscriptionStatus,
    userId?: string,
    reason?: string,
    stripeEventId?: string,
  ) {
    let eventType: SubscriptionEventType;

    switch (newStatus) {
      case 'ACTIVE':
        eventType = previousStatus === 'SUSPENDED' || previousStatus === 'CANCELLED' 
          ? 'REACTIVATED' 
          : 'ACTIVATED';
        break;
      case 'SUSPENDED':
        eventType = 'SUSPENDED';
        break;
      case 'CANCELLED':
        eventType = 'CANCELLED';
        break;
      default:
        eventType = 'ACTIVATED';
    }

    return this.createHistoryEntry({
      subscriptionId,
      eventType,
      previousStatus,
      newStatus,
      userId,
      reason,
      stripeEventId,
    });
  }

  /**
   * Registra pagamento
   */
  async logPayment(
    subscriptionId: string,
    amount: number,
    success: boolean,
    stripeEventId?: string,
    metadata?: Record<string, any>,
  ) {
    return this.createHistoryEntry({
      subscriptionId,
      eventType: success ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
      amount,
      stripeEventId,
      metadata,
    });
  }

  /**
   * Registra início de trial
   */
  async logTrialStarted(
    subscriptionId: string,
    trialEndsAt: Date,
    userId?: string,
  ) {
    return this.createHistoryEntry({
      subscriptionId,
      eventType: 'TRIAL_STARTED',
      userId,
      metadata: {
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });
  }

  /**
   * Registra fim de trial
   */
  async logTrialEnded(
    subscriptionId: string,
    convertedToPaid: boolean,
    stripeEventId?: string,
  ) {
    return this.createHistoryEntry({
      subscriptionId,
      eventType: 'TRIAL_ENDED',
      stripeEventId,
      metadata: {
        convertedToPaid,
      },
    });
  }
}
