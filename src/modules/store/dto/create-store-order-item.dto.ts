import {
  CustomerType,
  OrderChannel,
  ServiceType,
} from '@prisma/client';
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
import { CreateOrderItemDto, DeliveryTypeDto, OrderStatusDto } from 'src/modules/orders/dto/create-order-item.dto';
import { OrderPaymentDto } from './create-store-order.dto';

/**
 * 🔥 BASE DTO (regra do domínio)
 */
export class CreateStoreOrderDto {
  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;

  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;

  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @IsEnum(OrderChannel)
  channel!: OrderChannel;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  couponId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments!: OrderPaymentDto[];

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