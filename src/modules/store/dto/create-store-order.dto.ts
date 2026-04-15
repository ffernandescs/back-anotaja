import { CustomerType, OrderChannel, OrderStatus, ServiceType } from '@prisma/client';
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto, DeliveryTypeDto } from 'src/modules/orders/dto/create-order-item.dto';



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


// Pagamento
export class OrderPaymentDto {
  @IsEnum(PaymentTypeDto)
  type!: PaymentTypeDto;

  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountGiven?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  change?: number;
}

// DTO principal de criação do pedido
export class CreateStoreOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;
  
  @IsEnum(OrderChannel)
  @IsOptional()
  channel?: OrderChannel;

  // =====================================================
  // 🧠 NOVO MODELO
  // =====================================================

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;
  // =====================================================
  // CUSTOMER (OPCIONAL AGORA CONTROLADO PELO TYPE)
  // =====================================================

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  tableId?: string; // Para pedidos de mesa

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  couponId?: string;

  // =====================================================
  // ITEMS
  // =====================================================

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  // =====================================================
  // PAYMENTS
  // =====================================================

  @ValidateIf((o) => o.channel !== OrderChannel.WAITER)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments?: OrderPaymentDto[];

  // =====================================================
  // OPTIONAL FIELDS
  // =====================================================

  @IsOptional()
  @IsInt()
  @Min(0)
  change?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  discount?: number;
}
