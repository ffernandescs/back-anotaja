import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum CashSessionStatus {
  OPEN = 'OPEN',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
}

export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
  CUSTOM = 'CUSTOM',
}

export class CreateCashSessionDto {
  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @IsEnum(ShiftType)
  @IsOptional()
  shiftType?: ShiftType = ShiftType.CUSTOM;

  @IsString()
  @IsOptional()
  notes?: string;
}
