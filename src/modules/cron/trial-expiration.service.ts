import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class TrialExpirationService {
  private readonly logger = new Logger(TrialExpirationService.name);

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkExpiredTrials() {
    this.logger.log('Iniciando verificação de trials expirados...');

    try {
      const now = new Date();

      const expiredSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lte: now,
          },
          plan: {
            isTrial: true,
          },
        },
        include: {
          company: true,
          plan: true,
        },
      });

      this.logger.log(
        `Encontradas ${expiredSubscriptions.length} assinaturas trial expiradas`,
      );

      for (const subscription of expiredSubscriptions) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' },
        });

        this.logger.log(
          `Trial expirado para empresa: ${subscription.company.name} (${subscription.company.email})`,
        );
      }

      this.logger.log('Verificação de trials expirados concluída');
    } catch (error) {
      this.logger.error('Erro ao verificar trials expirados:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async notifyTrialExpiringSoon() {
    this.logger.log('Verificando trials próximos do vencimento...');

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      const expiringSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lte: tomorrow,
            gte: new Date(),
          },
          plan: {
            isTrial: true,
          },
        },
        include: {
          company: true,
          plan: true,
        },
      });

      this.logger.log(
        `Encontradas ${expiringSubscriptions.length} assinaturas trial expirando em breve`,
      );

      for (const subscription of expiringSubscriptions) {
        this.logger.log(
          `Trial expirando em breve para: ${subscription.company.name} (${subscription.company.email})`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao verificar trials expirando:', error);
    }
  }

  async getTrialStatus(companyId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        plan: true,
      },
    });

    if (!subscription || !subscription.plan.isTrial) {
      return null;
    }

    const now = new Date();
    const endDate = subscription.endDate;

    if (!endDate) {
      return null;
    }

    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      daysRemaining: Math.max(0, diffDays),
      endDate,
      isExpired: diffDays < 0,
      status: subscription.status,
    };
  }
}
