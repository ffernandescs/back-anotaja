import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsArray,
  Min,
  Max,
  ValidateIf,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PromotionalType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export enum PromotionalPeriodType {
  DATE_RANGE = 'DATE_RANGE',
  DAYS_OF_WEEK = 'DAYS_OF_WEEK',
}

export class UpdateProductAdvancedOptionsDto {
  @IsBoolean()
  @IsOptional()
  active?: boolean = true;

  @IsBoolean()
  @IsOptional()
  featured?: boolean = false;

  @IsBoolean()
  @IsOptional()
  hasPromotion?: boolean = false;

  @ValidateIf((o) => o.hasPromotion)
  @IsPositive()
  @IsOptional()
  promotionalPrice?: number | null;

  @ValidateIf((o) => o.hasPromotion)
  @IsEnum(PromotionalType)
  @IsOptional()
  promotionalType?: PromotionalType | null;

  @ValidateIf((o) => o.hasPromotion)
  @IsEnum(PromotionalPeriodType)
  @IsOptional()
  promotionalPeriodType?: PromotionalPeriodType | null;

  @ValidateIf(
    (o) =>
      o.hasPromotion &&
      o.promotionalPeriodType === PromotionalPeriodType.DATE_RANGE,
  )
  @IsString()
  @IsOptional()
  promotionalStartDate?: string | null;

  @ValidateIf(
    (o) =>
      o.hasPromotion &&
      o.promotionalPeriodType === PromotionalPeriodType.DATE_RANGE,
  )
  @IsString()
  @IsOptional()
  promotionalEndDate?: string | null;

  @ValidateIf(
    (o) =>
      o.hasPromotion &&
      o.promotionalPeriodType === PromotionalPeriodType.DAYS_OF_WEEK,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  promotionalDays?: string[] | null;

  @IsPositive()
  @IsOptional()
  weight?: number | null;

  @IsInt()
  @IsPositive()
  @IsOptional()
  preparationTime?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number | null;

  @IsString()
  @IsOptional()
  tags?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number | null;

  @IsOptional()
  filterMetadata?: Record<string, string | string[]> | null;

  @IsBoolean()
  @IsOptional()
  installmentEnabled?: boolean = false;

  @ValidateIf((o) => o.installmentEnabled)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  maxInstallments?: number | null;

  @ValidateIf((o) => o.installmentEnabled)
  @IsPositive()
  @IsOptional()
  minInstallmentValue?: number | null;

  @ValidateIf((o) => o.installmentEnabled)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  installmentInterestRate?: number | null;

  @IsBoolean()
  @IsOptional()
  installmentOnPromotionalPrice?: boolean = false;
}
