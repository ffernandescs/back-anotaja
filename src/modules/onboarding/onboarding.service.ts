import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { OnboardingStatusResponseDto } from './dto/onboarding-status-response.dto';
import { UpdateOnboardingStepDto } from './dto/update-onboarding-step.dto';
import { OnboardingStep } from '@prisma/client';

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

    if (company.onboardingCompleted) {
      return {
        completed: true,
        currentStep: OnboardingStep.COMPLETED,
        subscription: subscription
          ? {
              id: subscription.id,
              planName: subscription.plan.name,
              planType: subscription.plan.type,
              status: subscription.status,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              nextBillingDate: subscription.nextBillingDate,
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
      branding: !company.branches.some((branch) => !!branch.logoUrl || !!branch.bannerUrl),
    };

    let trialDaysRemaining: number | undefined;
    let trialEndDate: Date | undefined;
    let isTrialExpired = false;

    if (subscription && subscription.plan.isTrial && subscription.endDate) {
      trialEndDate = subscription.endDate;
      const now = new Date();
      const diffTime = trialEndDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      trialDaysRemaining = Math.max(0, diffDays);
      isTrialExpired = diffDays < 0;
    }

    return {
      completed: false,
      currentStep: company.onboardingStep,
      trialDaysRemaining,
      trialEndDate,
      isTrialExpired,
      subscription: subscription
        ? {
            id: subscription.id,
            planName: subscription.plan.name,
            planType: subscription.plan.type,
            status: subscription.status,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            nextBillingDate: subscription.nextBillingDate,
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
