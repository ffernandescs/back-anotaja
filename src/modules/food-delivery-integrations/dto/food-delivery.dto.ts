import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateFoodDeliveryConfigDto {
  @IsOptional()
  @IsBoolean()
  ifoodEnabled?: boolean;

  @IsOptional()
  @IsString()
  ifoodMerchantId?: string;

  @IsOptional()
  @IsBoolean()
  ninetyNineFoodEnabled?: boolean;

  @IsOptional()
  @IsString()
  ninetyNineFoodMerchantId?: string;
}
