import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerAddressDto } from './create-customer-address.dto';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  MinLength,
} from 'class-validator';

export class UpdateCustomerAddressDto extends PartialType(CreateCustomerAddressDto) {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  zipCode?: string;

  @IsOptional()
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  lng?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

