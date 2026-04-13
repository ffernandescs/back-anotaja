import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';

@Processor('stripe-events')
export class StripeProcessor extends WorkerHost {
  private readonly logger = new Logger(StripeProcessor.name);

  constructor(
    private billingOrchestrator: BillingOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<any>) {
    const { event } = job.data;

    this.logger.log(`🔥 Evento: ${event.type}`);

    // 🔐 IDEMPOTÊNCIA FORTE
    const exists = await prisma.stripeEvent.findUnique({
      where: { id: event.id },
    });

    if (exists) {
      this.logger.warn(`⚠️ Evento já processado: ${event.id}`);
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckout(event);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoice(event);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
      }

      // ✅ marca como processado
      await prisma.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
        },
      });

    } catch (error) {
      this.logger.error(`❌ Erro no evento ${event.type}`, error);
      throw error; // BullMQ vai retry automaticamente
    }
  }

  // =========================
  // HANDLERS
  // =========================

  private async handleCheckout(event: any) {
    const session = event.data.object;

    const companyId = session.metadata?.companyId;
    const planId = session.metadata?.planId;
    const subscriptionId = session.subscription;

    if (!companyId || !planId || !subscriptionId) {
      throw new Error('Dados inválidos no checkout');
    }

    await prisma.subscription.upsert({
      where: { companyId },
      update: {
        stripeSubscriptionId: subscriptionId,
        planId,
        status: 'ACTIVE',
      },
      create: {
        companyId,
        stripeSubscriptionId: subscriptionId,
        planId,
        status: 'ACTIVE',
      },
    });

    this.logger.log(`✅ Checkout aplicado`);
  }

  private async handleInvoice(event: any) {
    const invoice = event.data.object;

    if (!invoice.subscription) return;

    // 🔥 aplica upgrade agendado
    await this.billingOrchestrator.applyPendingPlanIfNeeded(
      invoice.subscription,
    );

    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: invoice.subscription },
    });

    if (!subscription) return;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        nextBillingDate: new Date(
          invoice.lines.data[0].period.end * 1000,
        ),
      },
    });

    // 💰 cria invoice
    if ((invoice.amount_paid || 0) > 0) {
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amount: invoice.amount_paid,
          status: 'PAID',
          billingPeriodStart: new Date(),
          billingPeriodEnd: new Date(),
          paidAt: new Date(),
        },
      });
    }

    // 🔐 Atualiza permissões (AGORA FUNCIONA)
    await this.updatePermissions(
      subscription.companyId,
      subscription.planId,
    );

    this.logger.log(`💰 Invoice processada`);
  }

  private async handleSubscriptionUpdated(event: any) {
    const sub = event.data.object;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: {
        status: sub.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
      },
    });

    this.logger.log(`🔄 Subscription updated`);
  }

  private async handlePaymentFailed(event: any) {
    const invoice = event.data.object;

    if (!invoice.subscription) return;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: invoice.subscription },
      data: { status: 'SUSPENDED' },
    });

    this.logger.log(`❌ Pagamento falhou`);
  }

  private async handleSubscriptionDeleted(event: any) {
    const sub = event.data.object;

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`🚫 Subscription cancelada`);
  }

  // =========================
  // PERMISSÕES
  // =========================

  private async updatePermissions(companyId: string, planId: string) {
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
      .filter(pf => pf.feature.active)
      .map(pf => pf.feature.key);

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

        await prisma.permission.createMany({
          data: permissions.map(p => ({
            groupId: group.id,
            ...p,
            source: 'PLAN',
          })),
          skipDuplicates: true,
        });
      }
    }

    this.logger.log(`🔐 Permissões atualizadas`);
  }
}