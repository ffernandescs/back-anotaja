import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export enum CashMovementType {
  OPENING = 'OPENING',
  CLOSING = 'CLOSING',
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  SALE = 'SALE',
}

export class CreateCashRegisterDto {
  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  closingAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  expectedAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  difference?: number;

  @IsEnum(CashMovementType)
  @IsOptional()
  status?: CashMovementType;

  @IsString()
  @IsOptional()
  notes?: string;
}
