import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingPeriod } from '@prisma/client';
import Stripe from 'stripe';
import { prisma } from '../../../lib/prisma';
import { calculateStripeAmount } from '../../utils/calculateStripeAmount';
import { StripeService } from './stripe.service';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';

function mapBillingPeriodToStripeInterval(
  period: BillingPeriod,
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval {
  if (period === BillingPeriod.MONTHLY) return 'month';
  if (period === BillingPeriod.SEMESTRAL || period === BillingPeriod.ANNUAL)
    return 'year';
  return 'month';
}

@Injectable()
export class BillingService {
  constructor(
    private stripeService: StripeService,
    private billingOrchestrator: BillingOrchestratorService,
  ) {}

  async createCheckout(planId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.companyId)
      throw new NotFoundException('Usuário não está associado a uma empresa');

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      include: {
        subscription: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.active) {
      throw new NotFoundException('Plano inválido');
    }

    const subscription = company.subscription;

    /**
     * 🔥 LÓGICA DE UPGRADE / DOWNGRADE
     */
    if (subscription?.stripeSubscriptionId && subscription.plan) {
      const currentPlan = subscription.plan;

      const isUpgrade = plan.price > currentPlan.price;
      const isDowngrade = plan.price < currentPlan.price;

      const now = new Date();
      const isTrialActive =
        subscription.trialEndsAt && subscription.trialEndsAt > now;

      // 🚀 UPGRADE
      if (isUpgrade) {
        if (isTrialActive) {
          await this.billingOrchestrator.schedulePlanChange(
            company.id,
            plan.id,
          );

          return {
            message:
              'Upgrade agendado. Será aplicado após o término do trial.',
          };
        }

        return await this.updateSubscriptionPlan(
          subscription.stripeSubscriptionId,
          plan,
          company.id,
        );
      }

      // 🧊 DOWNGRADE
      if (isDowngrade) {
        await this.billingOrchestrator.schedulePlanChange(
          company.id,
          plan.id,
        );

        return {
          message:
            'Downgrade agendado para o próximo ciclo de cobrança.',
        };
      }

      return {
        message: 'Você já está neste plano.',
      };
    }

    /**
     * 🔥 NOVA ASSINATURA (CHECKOUT)
     */

    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripeService.stripe.customers.create({
        name: company.name,
        email: company.email,
        phone: company.phone,
        metadata: {
          companyId: company.id,
        },
      });

      customerId = customer.id;
    }

    const trialEndDate = subscription?.trialEndsAt;
    const trialEndSeconds = trialEndDate
      ? Math.floor(new Date(trialEndDate).getTime() / 1000)
      : null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const shouldApplyTrial = trialEndSeconds && trialEndSeconds > nowSeconds;

    if (!company?.id) {
      throw new Error('Company inválida antes do checkout');
    }

    const session = await this.stripeService.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: plan.name,
              ...(plan.description && { description: plan.description }),
            },
            unit_amount: calculateStripeAmount(
              plan.price,
              plan.discount,
            ),
            recurring: {
              interval: mapBillingPeriodToStripeInterval(
                plan.billingPeriod,
              ),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/billing/success/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/error/{CHECKOUT_SESSION_ID}`,
      metadata: {
        companyId: company.id,
        planId: plan.id,
      },
      subscription_data: shouldApplyTrial
        ? {
            trial_end: trialEndSeconds,
          }
        : undefined,
    });

    await prisma.subscription.upsert({
      where: { companyId: company.id },
      update: {
        stripeCustomerId: customerId,
      },
      create: {
        companyId: company.id,
        stripeCustomerId: customerId,
        planId: plan.id,
        status: 'PENDING',
      },
    });

    return {
      checkoutUrl: session.url,
      message:
        'Checkout criado. O plano será ativado após confirmação do pagamento.',
    };
  }

  /**
   * 🔥 UPGRADE IMEDIATO (PRORATION)
   */
  private async updateSubscriptionPlan(
    stripeSubscriptionId: string,
    newPlan: any,
    companyId: string,
  ) {
    try {
      const subscription =
        await this.stripeService.stripe.subscriptions.retrieve(
          stripeSubscriptionId,
        );

      if (
        !subscription ||
        (subscription.status !== 'active' &&
          subscription.status !== 'trialing')
      ) {
        throw new Error(
          `Assinatura inválida. Status: ${subscription?.status}`,
        );
      }

      const price = await this.stripeService.stripe.prices.create({
        currency: 'brl',
        unit_amount: calculateStripeAmount(
          newPlan.price,
          newPlan.discount,
        ),
        recurring: {
          interval: mapBillingPeriodToStripeInterval(
            newPlan.billingPeriod,
          ),
        },
        product_data: {
          name: newPlan.name,
          metadata: {
            planId: newPlan.id,
          },
        },
      });

      const updatedSubscription =
        await this.stripeService.stripe.subscriptions.update(
          stripeSubscriptionId,
          {
            items: [
              {
                id: subscription.items.data[0].id,
                price: price.id,
              },
            ],
            proration_behavior: 'create_prorations',
            metadata: {
              companyId,
              planId: newPlan.id,
            },
          },
        );

      await prisma.subscription.update({
        where: { companyId },
        data: {
          planId: newPlan.id,
          status:
            updatedSubscription.status === 'active' ||
            updatedSubscription.status === 'trialing'
              ? 'ACTIVE'
              : 'SUSPENDED',
          stripeSubscriptionId: updatedSubscription.id,
        },
      });

      // ✅ NÃO atualizar permissões aqui
      // 👉 Webhook cuida disso

      return {
        success: true,
        message: 'Plano atualizado com sucesso',
        subscription: updatedSubscription,
      };
    } catch (error) {
      console.error('Erro ao atualizar plano:', error);
      throw error;
    }
  }
}