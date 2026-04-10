import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderStatusDto } from './create-order-item.dto';
import { DeliveryTypeDto } from './create-order-item.dto';
import { OrderPaymentDto } from 'src/modules/store/dto/create-store-order.dto';

export class UpdateOrderItemComplementOptionDto {
  @IsString()
  optionId!: string;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsNumber()
  quantity?: number;
}

export class UpdateOrderItemComplementDto {
  @IsString()
  complementId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemComplementOptionDto)
  options?: UpdateOrderItemComplementOptionDto[];
}

export class UpdateOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  price!: number;

  // Additions continuam string[]
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additions?: string[];

  // ✅ COMPLEMENTS AGORA SÃO OBJETOS
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemComplementDto)
  complements?: UpdateOrderItemComplementDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsArray()
  items?: UpdateOrderItemDto[];

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(DeliveryTypeDto)
  deliveryType?: DeliveryTypeDto;

  @IsOptional()
  @IsArray()
  payments?: OrderPaymentDto[];

  @IsOptional()
  @IsNumber()
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  serviceFee?: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;
}
