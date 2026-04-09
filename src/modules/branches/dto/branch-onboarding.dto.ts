import { IsEnum, IsNotEmpty } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class UpdateBranchOnboardingStepDto {
  @IsNotEmpty()
  @IsEnum(OnboardingStep)
  step!: OnboardingStep;
}

export class BranchOnboardingStatusResponseDto {
  completed!: boolean;
  currentStep!: OnboardingStep;
}
