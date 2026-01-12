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
  limits?: string; // JSON string

  @IsOptional()
  @IsString()
  features?: string; // JSON string

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
