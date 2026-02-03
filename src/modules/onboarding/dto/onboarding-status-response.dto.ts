import { OnboardingStep } from '@prisma/client';

export class OnboardingStatusResponseDto {
  completed!: boolean;
  currentStep!: OnboardingStep;
  trialDaysRemaining?: number;
  trialEndDate?: Date;
  isTrialExpired?: boolean;
  subscription?: {
    id: string;
    planName: string;
    planType: string;
    status: string;
    startDate?: Date | null;
    endDate?: Date | null;
    nextBillingDate?: Date | null;
  };
  missingSteps?: {
    plan: boolean;
    schedule: boolean;
    domain: boolean;
    payment: boolean;
    branding: boolean;
  };
}
