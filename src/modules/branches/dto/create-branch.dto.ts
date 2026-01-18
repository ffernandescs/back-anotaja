import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaymentMethod } from 'generated/prisma';

export enum PaymentMethodTypeDto {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  ONLINE = 'ONLINE',
  DEBIT_CARD = 'DEBIT_CARD',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  CASH_ON_PICKUP = 'CASH_ON_PICKUP',
  CASH_ON_TABLE = 'CASH_ON_TABLE',
}
export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsString()
  address!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  zipCode!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  neighborhood!: string;

  @IsString()
  number!: string;

  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  subdomain!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  socialMedia?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PaymentMethodTypeDto, { each: true })
  paymentMethods?: PaymentMethod[];

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsNumber()
  minOrderValue?: number;

  @IsOptional()
  @IsString()
  checkoutMessage?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
