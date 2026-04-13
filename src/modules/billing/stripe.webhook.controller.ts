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
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';
import { stripeQueue } from './stripe.queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('stripe-billing/webhook')
@Public()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  constructor(private stripeService: StripeService,   @InjectQueue('stripe-events')
    private stripeQueue: Queue,) {}

@Post()
async handle(
  @Req() req: Request,
  @Headers('stripe-signature') signature: string,
) {
  let event: Stripe.Event;

  try {
    event = this.stripeService.stripe.webhooks.constructEvent(
      req['rawBody'],
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || '',
    );
  } catch (err) {
    throw new BadRequestException('Invalid Stripe signature');
  }

  // 🔐 Idempotência leve (opcional aqui)
  const exists = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
  });

  if (exists) {
    return { received: true };
  }

  // 🚀 ENVIA PRA FILA (ESSENCIAL)
  await this.stripeQueue.add('process-event', {
    event,
  });

  return { received: true };
}
  /**
   * Atualiza as permissões de todos os grupos da empresa para o novo plano
   */
  private async updateGroupPermissionsForNewPlan(companyId: string, newPlanId: string) {
    try {
      this.logger.log(`Atualizando permissões dos grupos para o novo plano: ${newPlanId}`);

      // 1. Buscar o plano com suas features diretamente do banco
      const plan = await prisma.plan.findUnique({
        where: { id: newPlanId },
        include: {
          planFeatures: {
            include: {
              feature: true,
            },
          },
        },
      });

      if (!plan) {
        this.logger.warn(`Plano ${newPlanId} não encontrado. Pulando atualização de permissões.`);
        return;
      }

      // 2. Extrair feature keys ativas do plano
      const featureKeys = plan.planFeatures
        .filter(pf => pf.feature.active)
        .map(pf => pf.feature.key);

      this.logger.log(`Features do plano ${plan.type}: ${featureKeys.join(', ')}`);

      if (featureKeys.length === 0) {
        this.logger.warn(`Plano ${plan.type} não possui features ativas. Pulando atualização de permissões.`);
        return;
      }

      // 3. Converter feature keys para permissões
      const featureToSubject: Record<string, string> = {
        orders: 'order', products: 'product', categories: 'category',
        customers: 'customer', dashboard: 'dashboard', profile: 'profile',
        hours: 'hours', payment: 'payment', kanban: 'kanban', pdv: 'pdv',
        kds: 'kds', commands: 'commands', reports: 'report', coupons: 'coupon',
        delivery_routes: 'delivery_route', delivery_areas: 'delivery_area',
        delivery_persons: 'delivery_person', stock: 'stock',
        cash_register: 'cash_register', tables: 'table',
        payment_methods: 'payment_method', points: 'points',
        announcements: 'announcement', groups: 'group', users: 'user',
        subscription: 'subscription', branches: 'branch',
      };

      const featureActions: Record<string, string[]> = {
        dashboard: ['read'],
        reports: ['read', 'manage'],
        pdv: ['read', 'manage'],
        kds: ['read', 'manage'],
        kanban: ['read', 'manage'],
        delivery_routes: ['read', 'manage'],
        customers: ['read', 'create', 'update', 'manage'],
        subscription: ['read', 'update'],
        profile: ['read', 'update', 'manage'],
        hours: ['read', 'update', 'manage'],
        payment: ['read', 'update', 'manage'],
      };
      const fullCrud = ['read', 'create', 'update', 'delete', 'manage'];

      const newPermissions: { action: string; subject: string; inverted: boolean }[] = [];
      for (const key of featureKeys) {
        const subject = featureToSubject[key];
        if (!subject) continue;
        const actions = featureActions[key] || fullCrud;
        for (const action of actions) {
          newPermissions.push({ action, subject, inverted: false });
        }
      }

      this.logger.log(`Total de permissões a criar: ${newPermissions.length}`);

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
            where: {
              groupId: group.id,
              source: 'PLAN',
            },
          });

          const uniquePermissionsMap = new Map();

          for (const perm of newPermissions) {
            const key = `${perm.action}-${perm.subject}`;
            if (!uniquePermissionsMap.has(key)) {
              uniquePermissionsMap.set(key, perm);
            }
          }

          const uniquePermissions = Array.from(uniquePermissionsMap.values());
          // Criar novas permissões baseadas no plano
          await prisma.permission.createMany({
            data: uniquePermissions.map((perm) => ({
              groupId: group.id,
              action: perm.action,
              subject: perm.subject,
              inverted: perm.inverted,
              source: 'PLAN',
            })),
            skipDuplicates: true,
          });

          this.logger.log(`Permissões atualizadas para o grupo: ${group.name}`);
        }
      }

      this.logger.log(`✅ Permissões de todos os grupos atualizadas para o plano ${plan.type}`);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao atualizar permissões dos grupos: ${error.message}`, error.stack);
      throw error; // Re-lançar para que o caller possa tratar
    }
  }
}
