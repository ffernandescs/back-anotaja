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
  if (period === BillingPeriod.MONTHLY) {
    return 'month';
  }
  if (period === BillingPeriod.SEMESTRAL || period === BillingPeriod.ANNUAL) {
    return 'year';
  }
  return 'month';
}

@Injectable()
export class BillingService {
  constructor(private stripeService: StripeService, private billingOrchestrator: BillingOrchestratorService) {}

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
   * 🔥 NOVA LÓGICA DE DECISÃO (UPGRADE / DOWNGRADE)
   */
  if (subscription?.stripeSubscriptionId && subscription.plan) {
    const currentPlan = subscription.plan;

    const isUpgrade = plan.price > currentPlan.price;
    const isDowngrade = plan.price < currentPlan.price;

    // 🧠 verificar se ainda está em trial
    const now = new Date();
    const isTrialActive =
      subscription.trialEndsAt && subscription.trialEndsAt > now;

    // 🚀 UPGRADE
    if (isUpgrade) {
      // Se estiver em trial → NÃO aplica ainda
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

      // 🔥 upgrade imediato com proration
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

    // 🔁 mesmo plano
    return {
      message: 'Você já está neste plano.',
    };
  }

  /**
   * 🔥 CASO NÃO TENHA SUBSCRIPTION → CHECKOUT NORMAL
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
          unit_amount: calculateStripeAmount(plan.price, plan.discount),
          recurring: {
            interval: mapBillingPeriodToStripeInterval(plan.billingPeriod),
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
   * Atualiza o plano de uma assinatura ativa (upgrade/downgrade)
   */
  private async updateSubscriptionPlan(stripeSubscriptionId: string, newPlan: any, companyId: string) {
    try {
      // 1. Buscar a subscription no Stripe
      const subscription = await this.stripeService.stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Aceitar subscriptions ativas ou em trial
      if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
        throw new Error(`Assinatura não está ativa ou em trial. Status: ${subscription?.status}`);
      }

      // 2. Criar novo price no Stripe para o plano
      const price = await this.stripeService.stripe.prices.create({
        currency: 'brl',
        unit_amount: calculateStripeAmount(newPlan.price, newPlan.discount),
        recurring: {
          interval: mapBillingPeriodToStripeInterval(newPlan.billingPeriod),
        },
        product_data: {
          name: newPlan.name,
          metadata: {
            planId: newPlan.id,
          },
        },
      });

      // 3. Atualizar a subscription com o novo price
      // Padrão SaaS: sempre usar proration para cobrar/creditar a diferença
      const updatedSubscription = await this.stripeService.stripe.subscriptions.update(stripeSubscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: price.id,
          },
        ],
        proration_behavior: 'create_prorations', // Cobra/credita diferença proporcionalmente
        metadata: {
          companyId: companyId,
          planId: newPlan.id,
        },
      });

      // 4. Atualizar no banco de dados
      await prisma.subscription.update({
        where: { companyId: companyId },
        data: {
          planId: newPlan.id,
          status: updatedSubscription.status === 'active' ? 'ACTIVE' : 
                  updatedSubscription.status === 'trialing' ? 'ACTIVE' : 'SUSPENDED',
          stripeSubscriptionId: updatedSubscription.id,
        },
      });

      // 5. Criar registro de invoice apenas se não estiver em trial e houver valor
      const unitAmount = updatedSubscription.items.data[0]?.price?.unit_amount;
      
      if (unitAmount && unitAmount > 0) {
        // Verificar se está em trial
        const subscriptionWithTrial = await prisma.subscription.findUnique({
          where: { companyId },
          select: { trialEndsAt: true }
        });
        
        const now = new Date();
        const isTrialActive = subscriptionWithTrial?.trialEndsAt && subscriptionWithTrial.trialEndsAt > now;
        
        // Criar invoice apenas se não estiver em trial
        if (!isTrialActive) {
          await prisma.invoice.create({
            data: {
              subscriptionId: (await prisma.subscription.findUnique({
                where: { companyId },
                select: { id: true }
              }))!.id,
              amount: unitAmount,
              status: 'PAID',
              billingPeriodStart: new Date(),
              billingPeriodEnd: new Date(),
              paidAt: new Date(),
            },
          });
        } 
      }

      // 5. Atualizar permissões dos grupos para o novo plano APENAS se não estiver em trial
      const subscriptionWithTrial = await prisma.subscription.findUnique({
        where: { companyId },
        select: { trialEndsAt: true }
      });
      
      const now = new Date();
      const isTrialActive = subscriptionWithTrial?.trialEndsAt && subscriptionWithTrial.trialEndsAt > now;
      
      if (!isTrialActive) {
        await this.updateGroupPermissionsForNewPlan(companyId, newPlan.id);
        console.log(`Permissões atualizadas para o plano ${newPlan.id} (sem trial ativo)`);
      } else {
        console.log(`Permissões NÃO atualizadas - empresa ainda está em trial até ${subscriptionWithTrial?.trialEndsAt?.toLocaleDateString('pt-BR')}`);
      }

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

  /**
   * Atualiza as permissões de todos os grupos da empresa para o novo plano
   */
  private async updateGroupPermissionsForNewPlan(companyId: string, newPlanId: string) {
    try {
      // 1. Buscar o plano para obter o tipo
      const plan = await prisma.plan.findUnique({
        where: { id: newPlanId },
      });

      if (!plan) {
        console.warn(`Plano ${newPlanId} não encontrado. Pulando atualização de permissões.`);
        return;
      }

      // 2. Buscar features do plano dinamicamente
      const { getPlanFeatures } = require('../ability/factory/plan-rules');
      const planFeatures = await getPlanFeatures(plan.type);

      // 3. Converter features para formato de permissões
      const newPermissions = planFeatures.map(([action, subject]: [any, any]) => ({
        action: action as any,
        subject: Array.isArray(subject) ? subject[0] : subject as any,
        inverted: false,
      }));

      // 4. Buscar todos os grupos da empresa
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          branches: {
            include: {
              groups: {
                include: {
                  permissions: true,
                },
              },
            },
          },
        },
      });

      if (!company) {
        console.warn(`Empresa ${companyId} não encontrada.`);
        return;
      }

      // 5. Atualizar permissões de cada grupo
      for (const branch of company.branches) {
        for (const group of branch.groups) {
          // Deletar permissões antigas
          await prisma.permission.deleteMany({
            where: { groupId: group.id },
          });

          // Criar novas permissões baseadas no plano
          await prisma.permission.createMany({
            data: newPermissions.map(perm => ({
              groupId: group.id,
              action: perm.action,
              subject: perm.subject,
              inverted: perm.inverted,
            })),
          });

        }
      }

    } catch (error) {
      console.error(`Erro ao atualizar permissões dos grupos:`, error);
    }
  }
}
