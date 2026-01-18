// companies/dto/onboarding-status.dto.ts
export type OnboardingStep =
  | 'PLAN'
  | 'SCHEDULE'
  | 'DOMAIN'
  | 'PAYMENT'
  | 'COMPLETED';

export interface OnboardingStatusResponse {
  completed: boolean;
  currentStep: OnboardingStep;
}
