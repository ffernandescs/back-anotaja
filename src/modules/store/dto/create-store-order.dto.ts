import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
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

export enum PaymentTypeDto {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
  MEAL_VOUCHER = 'MEAL_VOUCHER',
  FOOD_VOUCHER = 'FOOD_VOUCHER',
  OTHER = 'OTHER',
  ONLINE = 'ONLINE',
}

// Opção de complemento selecionada
export class ComplementOptionDto {
  @IsString()
  @IsNotEmpty()
  optionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

// Complemento selecionado
export class OrderItemComplementDto {
  @IsString()
  @IsNotEmpty()
  complementId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplementOptionDto)
  options!: ComplementOptionDto[];
}

// Item do pedido
export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemComplementDto)
  complements?: OrderItemComplementDto[];
}

// Pagamento
export class OrderPaymentDto {
  @IsEnum(PaymentTypeDto)
  type!: PaymentTypeDto;

  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
}

// DTO principal de criação do pedido
export class CreateStoreOrderDto {
  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  // Campos de endereço (obrigatórios apenas para DELIVERY)
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  // Cupom de desconto
  @IsOptional()
  @IsString()
  couponCode?: string;

  // Items do pedido
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  // Pagamentos
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments!: OrderPaymentDto[];

  // Troco (apenas para pagamento em dinheiro)
  @IsOptional()
  @IsInt()
  @Min(0)
  change?: number;

  // Observações gerais do pedido
  @IsOptional()
  @IsString()
  notes?: string;
}
