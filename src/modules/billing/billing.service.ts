import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingPeriod } from '@prisma/client';
import Stripe from 'stripe';
import { prisma } from '../../../lib/prisma';
import { calculateStripeAmount } from '../../utils/calculateStripeAmount';
import { formatCurrency } from '../../utils/formatCurrency';
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

  

  /**
   * Retorna dados completos de billing para o dashboard do frontend.
   */
  async getDetails(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.companyId) {
      throw new NotFoundException('Usuário não associado a uma empresa');
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId: user.companyId },
      include: {
        plan: true,
        pendingPlan: true,
      },
    });

    if (!subscription) {
      return { subscription: null };
    }

    const now = new Date();
    const isTrialActive = subscription.plan?.isTrial === true
      && subscription.trialEndsAt
      && subscription.trialEndsAt > now;

    // Calcular trial days remaining
    let trialDaysRemaining: number | null = null;
    if (subscription.trialEndsAt) {
      const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const endUTC = new Date(Date.UTC(
        subscription.trialEndsAt.getFullYear(),
        subscription.trialEndsAt.getMonth(),
        subscription.trialEndsAt.getDate(),
      ));
      trialDaysRemaining = Math.max(0, Math.ceil((endUTC.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Calcular valor efetivo (com desconto)
    const effectivePrice = subscription.plan
      ? calculateStripeAmount(subscription.plan.price, subscription.plan.discount)
      : 0;

    // Determinar se há mudança de plano pendente
    let pendingChange: any = null;
    if (subscription.pendingPlan && subscription.scheduledChangeAt) {
      const isPendingUpgrade = subscription.pendingPlan.price > (subscription.plan?.price ?? 0);
      pendingChange = {
        type: isPendingUpgrade ? 'UPGRADE' : 'DOWNGRADE',
        fromPlan: subscription.plan ? {
          id: subscription.plan.id,
          name: subscription.plan.name,
          price: subscription.plan.price,
          formattedPrice: formatCurrency(subscription.plan.price),
        } : null,
        toPlan: {
          id: subscription.pendingPlan.id,
          name: subscription.pendingPlan.name,
          price: subscription.pendingPlan.price,
          formattedPrice: formatCurrency(subscription.pendingPlan.price),
        },
        scheduledAt: subscription.scheduledChangeAt,
      };
    }

    // Buscar últimas invoices do Stripe
    let recentInvoices: any[] = [];
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeInvoices = await this.stripeService.stripe.invoices.list({
          subscription: subscription.stripeSubscriptionId,
          limit: 10,
        });

        recentInvoices = stripeInvoices.data
          .filter(inv => inv.status === 'paid' || inv.status === 'open')
          .map(inv => ({
            id: inv.id,
            number: inv.number || `INV-${inv.id.slice(-8)}`,
            amount: inv.amount_paid || inv.amount_due || 0,
            formattedAmount: formatCurrency(inv.amount_paid || inv.amount_due || 0),
            status: inv.status === 'paid' ? 'PAID' : 'PENDING',
            date: new Date(inv.created * 1000),
            periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
            description: inv.description || `${subscription.plan?.name ?? 'Assinatura'} - ${new Date(inv.created * 1000).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
            pdfUrl: inv.invoice_pdf || null,
            hostedUrl: inv.hosted_invoice_url || null,
          }));
      } catch (error) {
        console.warn('Erro ao buscar invoices do Stripe:', error);
      }
    }

    // Verificar se existe método de pagamento
    let hasPaymentMethod = false;
    if (subscription.stripeCustomerId) {
      try {
        const paymentMethods = await this.stripeService.stripe.paymentMethods.list({
          customer: subscription.stripeCustomerId,
          type: 'card',
          limit: 1,
        });
        hasPaymentMethod = paymentMethods.data.length > 0;
      } catch (error) {
        console.warn('Erro ao verificar payment methods:', error);
      }
    }

    // Buscar upcoming invoice do Stripe (próxima cobrança)
    let upcomingInvoice: any = null;
    if (subscription.stripeSubscriptionId && !isTrialActive) {
      try {
        const upcoming = await this.stripeService.stripe.invoices.createPreview({
          subscription: subscription.stripeSubscriptionId,
        });
        upcomingInvoice = {
          amount: upcoming.amount_due,
          formattedAmount: formatCurrency(upcoming.amount_due),
          date: upcoming.next_payment_attempt
            ? new Date(upcoming.next_payment_attempt * 1000)
            : subscription.nextBillingDate,
        };
      } catch (error) {
        // Pode falhar se subscription estiver cancelada/incompleta
      }
    }

    const billingPeriodLabel: Record<string, string> = {
      MONTHLY: 'Mensal',
      SEMESTRAL: 'Semestral',
      ANNUAL: 'Anual',
      QUARTERLY: 'Trimestral',
    };

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingPeriod: subscription.billingPeriod,
        billingPeriodLabel: billingPeriodLabel[subscription.billingPeriod] || subscription.billingPeriod,
        startDate: subscription.startDate,
        nextBillingDate: subscription.nextBillingDate,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: subscription.plan ? {
        id: subscription.plan.id,
        name: subscription.plan.name,
        type: subscription.plan.type,
        price: subscription.plan.price,
        effectivePrice,
        discount: subscription.plan.discount,
        formattedPrice: formatCurrency(effectivePrice),
        billingPeriod: subscription.plan.billingPeriod,
      } : null,
      trial: {
        isActive: !!isTrialActive,
        endsAt: subscription.trialEndsAt,
        daysRemaining: trialDaysRemaining,
      },
      pendingChange,
      upcomingInvoice,
      invoices: recentInvoices,
      hasPaymentMethod,
      hasStripeCustomer: !!subscription.stripeCustomerId,
    };
  }

  async portal(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user?.companyId) {
      throw new NotFoundException('Usuário não associado a uma empresa');
    }

    const subscription = await prisma.subscription.findFirst({
      where: { companyId: user.companyId },
    });

    if (!subscription?.stripeCustomerId) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const session =
      await this.stripeService.stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: process.env.FRONTEND_URL,
      });

    return { url: session.url };
  }

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
   * Se o cliente não tiver método de pagamento, redireciona para checkout.
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
            proration_behavior: 'always_invoice',
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
    } catch (error: any) {
      // Se o Stripe retorna que não há método de pagamento, criar checkout session
      const isNoPaymentMethod =
        error?.type === 'StripeInvalidRequestError' &&
        error?.code === 'resource_missing' &&
        error?.message?.includes('payment');

      if (isNoPaymentMethod) {
        console.log('⚠️ Cliente sem método de pagamento, redirecionando para checkout');
        return this.createCheckoutForPlanChange(stripeSubscriptionId, newPlan, companyId);
      }

      console.error('Erro ao atualizar plano:', error);
      throw error;
    }
  }

  /**
   * Cria um Checkout Session para troca de plano quando não há método de pagamento.
   * Cancela a subscription atual e cria uma nova via checkout.
   */
  private async createCheckoutForPlanChange(
    stripeSubscriptionId: string,
    newPlan: any,
    companyId: string,
  ) {
    const dbSubscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!dbSubscription?.stripeCustomerId) {
      throw new NotFoundException('Cliente Stripe não encontrado');
    }

    const session = await this.stripeService.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: dbSubscription.stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: newPlan.name,
              ...(newPlan.description && { description: newPlan.description }),
            },
            unit_amount: calculateStripeAmount(newPlan.price, newPlan.discount),
            recurring: {
              interval: mapBillingPeriodToStripeInterval(newPlan.billingPeriod),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/billing/success/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/error/{CHECKOUT_SESSION_ID}`,
      metadata: {
        companyId,
        planId: newPlan.id,
        replacesSubscription: stripeSubscriptionId,
      },
    });

    return {
      checkoutUrl: session.url,
      message: 'Método de pagamento necessário. Redirecionando para checkout.',
    };
  }
}