import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  IsObject,
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
  QUARTERLY = 'QUARTERLY',
}

export class LimitDto {
  @IsString()
  resource!: string;

  @IsNumber()
  @Min(-1)
  maxValue!: number; // -1 = ilimitado
}

export class CreateDynamicPlanDto {
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

  // Features selecionadas para este plano (agora dinâmico)
  @IsArray()
  @IsString({ each: true })
  features!: string[];

  // Limites configuráveis
  @IsOptional()
  @IsArray()
  limits?: LimitDto[];

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
