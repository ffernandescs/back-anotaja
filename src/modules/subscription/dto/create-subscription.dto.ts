import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';

export enum SubscriptionStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export enum BillingPeriodDto {
  MONTHLY = 'MONTHLY',
  SEMESTRAL = 'SEMESTRAL',
  ANNUAL = 'ANNUAL',
}

export class CreateSubscriptionDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsEnum(SubscriptionStatusDto)
  status?: SubscriptionStatusDto;

  @IsOptional()
  @IsEnum(BillingPeriodDto)
  billingPeriod?: BillingPeriodDto;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsDateString()
  lastBillingDate?: string;

  @IsOptional()
  @IsNumber()
  lastBillingAmount?: number;

  @IsOptional()
  @IsString()
  strapiSubscriptionId?: string;

  @IsOptional()
  @IsString()
  strapiCustomerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
