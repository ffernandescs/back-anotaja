import { IsEnum, IsNotEmpty } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class UpdateOnboardingStepDto {
  @IsNotEmpty()
  @IsEnum(OnboardingStep)
  step!: OnboardingStep;
}
