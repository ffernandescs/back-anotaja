import { IsBoolean, IsOptional } from 'class-validator';

export class CompleteOnboardingDto {
  @IsOptional()
  @IsBoolean()
  skipValidation?: boolean;
}
