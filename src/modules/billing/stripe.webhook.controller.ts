import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { prisma } from '../../../lib/prisma';
import Stripe from 'stripe';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('stripe-billing/webhook')
@Public()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  constructor(private stripeService: StripeService) {}

  @Post()
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    let event;

    try {
      this.logger.log('Recebendo evento do Stripe...');
      event = this.stripeService.stripe.webhooks.constructEvent(
        req['rawBody'],
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
      this.logger.log(`Evento recebido: ${event.type}`);
    } catch (err) {
      this.logger.error(`Erro ao processar evento: `);
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Checkout completado - nova assinatura
    if (event.type === 'checkout.session.completed') {
      this.logger.log('Checkout completado - nova assinatura');
      const session = event.data.object;

      const companyId = session.metadata?.companyId;
      const subscriptionId = session.subscription as string;
      this.logger.log(
        `checkout.session.completed recebido para companyId=${companyId}, subscriptionId=${subscriptionId}`,
      );
      if (!companyId || !subscriptionId) {
        this.logger.error(
          `checkout.session.completed recebido para companyId=${companyId}, subscriptionId=${subscriptionId}`,
        );
        throw new BadRequestException('Dados da assinatura incompletos');
      }

      // ✅ Buscar assinatura completa via API do Stripe
      const subscriptionResponse =
        await this.stripeService.stripe.subscriptions.retrieve(
          session.subscription as string,
          { expand: ['items.data.price'] },
        );

      const subscription = subscriptionResponse as any;

      // Pega o preço do item
      const unitAmount = subscription.items.data[0].price.unit_amount;
      this.logger.log(
        `checkout.session.completed recebido para ${subscription}`,
      );
      // ✅ Datas corretas da subscription
      const startDate = new Date(subscription.created * 1000); // Data que começou
      
      // Se está em trial, a próxima cobrança será após o trial
      // current_period_end já inclui os dias de trial + período do plano
      const nextBillingDate = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null;
      
      this.logger.log(
        `nextBillingDate calculada: ${nextBillingDate?.toLocaleString()} (current_period_end=${subscription.current_period_end})`,
      );
      this.logger.log(
        `Trial status: ${subscription.status}, trial_end: ${subscription.trial_end ? new Date(subscription.trial_end * 1000).toLocaleString() : 'N/A'}`,
      );

      const endDate = subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null;

      const planId =
        session.metadata?.planId || subscription.items.data[0]?.price.id;

      // Salvar no banco
      const subscriptionRecord = await prisma.subscription.upsert({
        where: { companyId },
        update: {
          status: 'ACTIVE',
          stripeSubscriptionId: subscriptionId,
          planId, // ← Atualiza para o novo plano
          startDate, // Data que a assinatura foi criada
          nextBillingDate, // Próxima data de cobrança (trial + período do plano)
          endDate,
          notes: subscription.trial_end 
            ? `Plano ativado com trial até ${new Date(subscription.trial_end * 1000).toLocaleDateString()}. Primeira cobrança em ${nextBillingDate?.toLocaleDateString()}`
            : `Plano ativado. Próxima cobrança em ${nextBillingDate?.toLocaleDateString()}`,
        },
        create: {
          companyId,
          status: 'ACTIVE',
          stripeSubscriptionId: subscriptionId,
          planId,
          startDate,
          nextBillingDate,
          endDate,
          notes: subscription.trial_end 
            ? `Plano ativado com trial até ${new Date(subscription.trial_end * 1000).toLocaleDateString()}. Primeira cobrança em ${nextBillingDate?.toLocaleDateString()}`
            : `Plano ativado. Próxima cobrança em ${nextBillingDate?.toLocaleDateString()}`,
        },
      });

      // Criar registro de invoice apenas se não estiver em trial e houver valor
      const subscriptionWithTrial = await prisma.subscription.findUnique({
        where: { companyId },
        select: { trialEndsAt: true }
      });
      
      const now = new Date();
      const isTrialActive = subscriptionWithTrial?.trialEndsAt && subscriptionWithTrial.trialEndsAt > now;
      
      if (!isTrialActive && unitAmount && unitAmount > 0) {
        await prisma.invoice.create({
          data: {
            subscriptionId: subscriptionRecord.id,
            amount: unitAmount,
            status: 'PAID',
            billingPeriodStart: new Date(),
            billingPeriodEnd: new Date(),
            paidAt: new Date(),
          },
        });
        this.logger.log(`Invoice criada: ${unitAmount} (fora do trial)`);
      } else {
        this.logger.log(`Invoice ignorada: valor=${unitAmount}, trialAtivo=${isTrialActive}`);
      }
      this.logger.log(
        `Assinatura criada/atualizada no banco para companyId=${companyId}`,
      );

      // 🔄 Atualizar permissões dos grupos para o novo plano
      await this.updateGroupPermissionsForNewPlan(companyId, planId);
    }

    // ✅ Atualizar próxima data de cobrança quando invoice é gerado
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      this.logger.log(
        `invoice.payment_succeeded recebido para subscriptionId=${invoice.subscription}`,
      );

      if (invoice.subscription) {
        const subscriptionResponse =
          await this.stripeService.stripe.subscriptions.retrieve(
            invoice.subscription,
          );
        const subscription = subscriptionResponse as any;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: {
            status: 'ACTIVE',
            nextBillingDate: new Date(subscription.current_period_end * 1000),
          },
        });

        // Criar registro de invoice apenas se não estiver em trial
        const subscriptionRecord = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription },
          select: { id: true, trialEndsAt: true }
        });

        if (subscriptionRecord) {
          // Verificar se ainda está em trial
          const now = new Date();
          const isTrialActive = subscriptionRecord.trialEndsAt && subscriptionRecord.trialEndsAt > now;
          
          // Criar invoice apenas se não estiver mais em trial
          if (!isTrialActive && (invoice.amount_paid || 0) > 0) {
            await prisma.invoice.create({
              data: {
                subscriptionId: subscriptionRecord.id,
                amount: invoice.amount_paid || 0,
                status: 'PAID',
                billingPeriodStart: new Date(),
                billingPeriodEnd: new Date(),
                paidAt: new Date(),
              },
            });
            
            this.logger.log(`Invoice criada: ${invoice.amount_paid} (fora do trial)`);
          } else {
            this.logger.log(`Invoice ignorada: valor=${invoice.amount_paid}, trialAtivo=${isTrialActive}`);
          }
        }
        this.logger.log(
          `Próxima data de cobrança atualizada para subscriptionId=${invoice.subscription}`,
        );
      }
    }

    // Pagamento falhado
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;

      if (invoice.subscription) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: { status: 'SUSPENDED' },
        });
      }
    }

    // ✅ Assinatura cancelada
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: 'CANCELLED',
          endDate: new Date(subscription.canceled_at * 1000),
        },
      });
    }

    // ✅ Assinatura atualizada (mudança de plano, etc)
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      this.logger.log(
        `customer.subscription.updated recebido para subscriptionId=${subscription.id}`,
      );

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: subscription.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
          nextBillingDate: new Date(subscription.current_period_end * 1000),
          endDate: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000)
            : null,
        },
      });
      this.logger.log(
        `Assinatura atualizada no banco, subscriptionId=${subscription.id}`,
      );
    }

    return { received: true };
  }

  /**
   * Atualiza as permissões de todos os grupos da empresa para o novo plano
   */
  private async updateGroupPermissionsForNewPlan(companyId: string, newPlanId: string) {
    try {
      this.logger.log(`Atualizando permissões dos grupos para o novo plano: ${newPlanId}`);

      // 1. Buscar o plano para obter o tipo
      const plan = await prisma.plan.findUnique({
        where: { id: newPlanId },
      });

      if (!plan) {
        this.logger.warn(`Plano ${newPlanId} não encontrado. Pulando atualização de permissões.`);
        return;
      }

      // 2. Buscar features do plano dinamicamente
      const { getPlanFeatures } = require('../../ability/factory/plan-rules');
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
        this.logger.warn(`Empresa ${companyId} não encontrada.`);
        return;
      }

      // 5. Atualizar permissões de cada grupo
      for (const branch of company.branches) {
        for (const group of branch.groups) {
          this.logger.log(`Atualizando permissões do grupo: ${group.name} (${group.id})`);

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

          this.logger.log(`Permissões atualizadas para o grupo: ${group.name}`);
        }
      }

      this.logger.log(`Permissões de todos os grupos atualizadas para o plano ${plan.type}`);
    } catch (error) {
      this.logger.error(`Erro ao atualizar permissões dos grupos`);
    }
  }
}
