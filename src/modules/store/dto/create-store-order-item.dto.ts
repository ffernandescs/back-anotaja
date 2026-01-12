import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsPositive,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemAdditionDto {
  @IsString()
  additionId!: string;

  @IsNumber()
  @IsPositive()
  price!: number;
}

class OrderItemComplementOptionDto {
  @IsString()
  optionId!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

class OrderItemComplementDto {
  @IsString()
  complementId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemComplementOptionDto)
  options!: OrderItemComplementOptionDto[];
}

export class CreateStoreOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemAdditionDto)
  additions?: OrderItemAdditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemComplementDto)
  complements?: OrderItemComplementDto[];
}
