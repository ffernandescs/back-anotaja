import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreatePartnerCustomerDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  segment!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsOptional()
  @IsBoolean()
  hasSubscription?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
