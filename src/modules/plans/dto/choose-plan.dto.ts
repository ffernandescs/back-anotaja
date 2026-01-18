import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  SEMESTRAL = 'SEMESTRAL',
  ANNUAL = 'ANNUAL',
}

export class ChoosePlanDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsEnum(BillingPeriod)
  billingPeriod!: BillingPeriod;
}
