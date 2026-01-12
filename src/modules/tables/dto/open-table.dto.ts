import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  CreateOrderItemDto,
  DeliveryTypeDto,
} from 'src/modules/orders/dto/create-order-item.dto';

export class OpenTableDto {
  @IsNumber()
  @IsNotEmpty()
  numberOfPeople!: number;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsEnum(DeliveryTypeDto)
  deliveryType!: DeliveryTypeDto;

  @IsNumber()
  @Min(0)
  total!: number;

  @IsNumber()
  @Min(0)
  subtotal!: number;

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
  couponId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
