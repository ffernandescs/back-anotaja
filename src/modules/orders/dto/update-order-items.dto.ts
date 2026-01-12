import {
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateOrderItemAdditionDto {
  @IsString()
  additionId!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

class UpdateOrderItemComplementOptionDto {
  @IsString()
  optionId!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

class UpdateOrderItemComplementDto {
  @IsString()
  complementId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemComplementOptionDto)
  options!: UpdateOrderItemComplementOptionDto[];
}

class UpdateOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemAdditionDto)
  additions?: UpdateOrderItemAdditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemComplementDto)
  complements?: UpdateOrderItemComplementDto[];
}

export class UpdateOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items!: UpdateOrderItemDto[];

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;
}
