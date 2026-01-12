import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  forDineIn?: boolean;

  @IsOptional()
  @IsBoolean()
  forDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
