import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsOptional()
  targetCashSessionId?: string; // Para transferências entre caixas
}
