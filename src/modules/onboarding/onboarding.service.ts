import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { OnboardingStatusResponseDto } from './dto/onboarding-status-response.dto';
import { UpdateOnboardingStepDto } from './dto/update-onboarding-step.dto';
import { PLAN_LIMITS } from '../../ability/factory/plan-rules';
import { OnboardingStep, PlanType } from '@prisma/client';

@Injectable()
export class OnboardingService {
  async getOnboardingStatus(
    userId: string,
  ): Promise<OnboardingStatusResponseDto> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
            branches: {
              include: {
                openingHours: true,
                paymentMethods: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    const company = user.company;
    const subscription = company.subscription;

    // --- Lógica de Expiração baseada em Vigência (startDate/endDate) ---
    const now = new Date();
    let trialDaysRemaining: number | undefined;
    let trialEndDate: Date | undefined;
    let isTrialExpired = false;
    let daysSinceExpiration = 0;

    if (subscription) {
      if (subscription.endDate) {
        trialEndDate = new Date(subscription.endDate);
      } else if (subscription.startDate) {
        const trialDays = parseInt(process.env.TRIAL_DAYS ?? '7', 10);
        trialEndDate = new Date(subscription.startDate);
        trialEndDate.setDate(trialEndDate.getDate() + trialDays);
      }

      if (trialEndDate) {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfExpiration = new Date(trialEndDate.getFullYear(), trialEndDate.getMonth(), trialEndDate.getDate());

        const diffTime = startOfExpiration.getTime() - startOfToday.getTime();
        trialDaysRemaining = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        
        isTrialExpired = startOfToday > startOfExpiration;
        daysSinceExpiration = isTrialExpired
          ? Math.abs(Math.floor((startOfToday.getTime() - startOfExpiration.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
      }
    }

    // --- Determinação do Status de Cobrança ---
    let billingStatus = subscription?.status || 'INACTIVE';
    if (isTrialExpired) {
      const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? '3', 10);
      const suspensionDays = parseInt(process.env.SUSPENSION_DAYS ?? '15', 10);

      if (daysSinceExpiration <= gracePeriodDays) {
        billingStatus = 'GRACE_PERIOD';
      } else if (daysSinceExpiration <= gracePeriodDays + suspensionDays) {
        billingStatus = 'SUSPENDED';
      } else {
        billingStatus = 'EXPIRED';
      }
    }

    const expirationDate = trialEndDate || new Date();

    if (company.onboardingCompleted) {
      return {
        completed: true,
        currentStep: OnboardingStep.COMPLETED,
        trialDaysRemaining,
        trialEndDate: expirationDate,
        isTrialExpired,
        subscription: subscription
          ? {
              id: subscription.id,
              planName: subscription.plan.name,
              planType: subscription.plan.type,
              status: billingStatus,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              nextBillingDate: subscription.nextBillingDate,
              trialDaysRemaining,
              daysSinceExpiration,
              limits: PLAN_LIMITS[subscription.plan.type as PlanType],
            }
          : undefined,
      };
    }

    const missingSteps = {
      plan: !subscription,
      schedule: !company.branches.some(
        (branch) => branch.openingHours && branch.openingHours.length > 0,
      ),
      domain: !company.branches.some((branch) => !!branch.subdomain),
      payment: !company.branches.some(
        (branch) => branch.paymentMethods && branch.paymentMethods.length > 0,
      ),
      branding: !company.branches.some(
        (branch) => !!branch.logoUrl || !!branch.bannerUrl,
      ),
    };

    return {
      completed: false,
      currentStep: company.onboardingStep,
      trialDaysRemaining,
      trialEndDate: expirationDate,
      isTrialExpired,
      subscription: subscription
        ? {
            id: subscription.id,
            planName: subscription.plan.name,
            planType: subscription.plan.type,
            status: billingStatus,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            nextBillingDate: subscription.nextBillingDate,
            trialDaysRemaining,
            daysSinceExpiration,
            limits: PLAN_LIMITS[subscription.plan.type as PlanType],
          }
        : undefined,
      missingSteps,
    };
  }

  async updateOnboardingStep(
    userId: string,
    dto: UpdateOnboardingStepDto,
  ): Promise<{ success: boolean; currentStep: OnboardingStep }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    if (user.company.onboardingCompleted) {
      throw new BadRequestException('Onboarding já foi concluído');
    }

    await prisma.company.update({
      where: { id: user.company.id },
      data: { onboardingStep: dto.step },
    });

    return {
      success: true,
      currentStep: dto.step,
    };
  }

  async completeOnboarding(userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
            branches: {
              include: {
                openingHours: true,
                paymentMethods: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    const company = user.company;

    if (company.onboardingCompleted) {
      throw new BadRequestException('Onboarding já foi concluído');
    }

    if (!company.subscription) {
      throw new BadRequestException('Plano não configurado');
    }

    const hasOpeningHours = company.branches.some(
      (branch) => branch.openingHours && branch.openingHours.length > 0,
    );

    if (!hasOpeningHours) {
      throw new BadRequestException(
        'Horários de funcionamento não configurados',
      );
    }

    const hasSubdomain = company.branches.some((branch) => !!branch.subdomain);

    if (!hasSubdomain) {
      throw new BadRequestException('Domínio não configurado');
    }

    const hasPaymentMethods = company.branches.some(
      (branch) => branch.paymentMethods && branch.paymentMethods.length > 0,
    );

    if (!hasPaymentMethods) {
      throw new BadRequestException('Métodos de pagamento não configurados');
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.COMPLETED,
      },
    });

    return {
      success: true,
      message: 'Onboarding concluído com sucesso',
    };
  }

  async skipOnboarding(userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || !user.company) {
      throw new NotFoundException('Usuário ou empresa não encontrada');
    }

    await prisma.company.update({
      where: { id: user.company.id },
      data: {
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.COMPLETED,
      },
    });

    return {
      success: true,
      message: 'Onboarding pulado com sucesso',
    };
  }
}
