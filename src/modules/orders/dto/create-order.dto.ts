import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateOrderItemDto,
  DeliveryTypeDto,
  OrderStatusDto,
} from './create-order-item.dto';
import { OrderPaymentDto } from 'src/modules/store/dto/create-store-order.dto';

export class CreateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  change?: number;

  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  couponId?: string;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments!: OrderPaymentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
