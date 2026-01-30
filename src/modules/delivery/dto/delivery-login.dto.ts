import { IsOptional, IsString } from 'class-validator';

export class DeliveryLoginDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  qrCode?: string;
}
