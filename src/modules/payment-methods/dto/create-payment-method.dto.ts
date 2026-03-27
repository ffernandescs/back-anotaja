import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BranchAssignPaymentDto {
  paymentMethodId!: string;
  forDineIn?: boolean;
  forDelivery?: boolean;
}
