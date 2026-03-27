import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';

export enum PlanTypeDto {
  TRIAL = 'TRIAL',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BillingPeriodDto {
  MONTHLY = 'MONTHLY',
  SEMESTRAL = 'SEMESTRAL',
  ANNUAL = 'ANNUAL',
}

export class CreatePlanDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PlanTypeDto)
  type!: PlanTypeDto;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsEnum(BillingPeriodDto)
  billingPeriod?: BillingPeriodDto;

  @IsOptional()
  @IsString()
  features?: string; // JSON string com array de feature keys

  @IsOptional()
  @IsString()
  limits?: string; // JSON string com objeto de limites { branches: 1, users: 5 }

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
