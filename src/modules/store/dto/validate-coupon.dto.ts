import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum DeliveryType {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
  DINE_IN = 'DINE_IN',
}

export class ValidateCouponDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsArray()
  productIds?: string[];

  @IsOptional()
  subtotal?: number;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
