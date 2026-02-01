import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateDeliveryPersonDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsString()
  image?: string;
}
