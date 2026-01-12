import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { BillSplitType } from '../types';
import { Type } from 'class-transformer';

export class CreateBillSplitDto {
  @IsString()
  orderId!: string;

  @IsNumber()
  @Min(1)
  numberOfPeople!: number;

  @IsEnum(BillSplitType)
  splitType!: BillSplitType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  percentages?: number[]; // Apenas para BY_PERCENTAGE

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  fixedValues?: number[]; // Apenas para BY_FIXED

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentBillSplitDto)
  payments?: CreatePaymentBillSplitDto[];
}

export class CreatePaymentBillSplitDto {
  @IsNumber()
  amount!: number;

  @IsString()
  paymentMethodId!: string;

  @IsString()
  personName!: string;

  @IsNumber()
  @IsOptional()
  change?: number; // Troco, se houver
}

export enum PaymentStatusBillSplitDto {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}
