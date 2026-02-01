import { IsEnum, IsNotEmpty } from 'class-validator';
import { OnboardingStep } from 'generated/prisma';

export class UpdateOnboardingStepDto {
  @IsNotEmpty()
  @IsEnum(OnboardingStep)
  step!: OnboardingStep;
}
