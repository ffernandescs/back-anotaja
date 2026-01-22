import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateCustomerAddressDto {
  @IsString()
  @MinLength(1, { message: 'Label é obrigatório' })
  label!: string;

  @IsString()
  @MinLength(5, { message: 'Endereço deve ter no mínimo 5 caracteres' })
  street!: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsString()
  @MinLength(2, { message: 'Cidade é obrigatória' })
  city!: string;

  @IsString()
  @MinLength(2, { message: 'Estado é obrigatório' })
  state!: string;

  @IsString()
  @MinLength(8, { message: 'CEP inválido' })
  zipCode!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsNumber()
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  lng?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  branchId!: string;
}
