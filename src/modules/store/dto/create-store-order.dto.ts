import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsPositive,
  IsEmail,
  ArrayMinSize,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStoreOrderItemDto } from './create-store-order-item.dto';
import { DeliveryTypeDto } from 'src/modules/orders/dto/create-order-item.dto';

class PaymentDto {
  @IsEnum([
    'CASH',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'PIX',
    'ONLINE',
    'MEAL_VOUCHER',
  ])
  type!: string;

  @IsNumber()
  @Min(0, { message: 'O valor do pagamento deve ser maior ou igual a zero' })
  amount!: number;

  @IsString()
  paymentMethodId!: string;
}

export class CreateStoreOrderDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStoreOrderItemDto)
  items!: CreateStoreOrderItemDto[];

  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;

  @IsOptional()
  @IsEnum([
    'CASH',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'PIX',
    'ONLINE',
    'MEAL_VOUCHER',
  ])
  paymentMethod?: string; // Mantido para compatibilidade - validação no service

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashReceived?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  change?: number;

  @IsString()
  @MinLength(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
  customerName!: string;

  @IsString()
  @MinLength(10, {
    message:
      'Telefone do cliente é obrigatório e deve ter pelo menos 10 caracteres',
  })
  customerPhone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  customerEmail?: string;

  @IsString()
  @MinLength(5, { message: 'Endereço completo é obrigatório para entrega' })
  address?: string;

  @IsString()
  @MinLength(2, { message: 'Cidade é obrigatória para entrega' })
  city?: string;

  @IsString()
  @MinLength(2, { message: 'Estado é obrigatório para entrega' })
  state?: string;

  @IsString()
  @MinLength(8, { message: 'CEP é obrigatório para entrega' })
  zipCode?: string;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsNumber()
  @Min(0)
  deliveryFee!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceFee?: number;

  @IsNumber()
  @Min(0)
  discount!: number;

  @IsNumber()
  @IsPositive()
  total!: number;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
