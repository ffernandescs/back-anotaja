import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum CouponType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
  FREE_DELIVERY = 'FREE_DELIVERY',
}

export enum DayOfWeek {
  SUNDAY = 'SUNDAY',
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
}

export enum DeliveryType {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
  DINE_IN = 'DINE_IN',
}

export class CreateCouponDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minValue?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  availableDays?: DayOfWeek[] | null;

  @IsOptional()
  deliveryTypes?: DeliveryType[] | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderValue?: number | null;

  @IsOptional()
  @IsBoolean()
  onlyNewCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultipleUsesPerCustomer?: boolean;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  paymentMethodIds?: string[] | null;

  @IsOptional()
  categoryIds?: string[] | null;

  @IsOptional()
  productIds?: string[] | null;

  @IsOptional()
  branchIds?: string[] | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
