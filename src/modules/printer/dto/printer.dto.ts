import { IsEnum, IsNotEmpty, IsOptional, IsNumber, IsString, Min, IsInt, IsBoolean } from 'class-validator';
import { OrderType } from '../../../common/enums/order-type.enum';
import { PrinterStatus } from '@prisma/client';

export class CreatePrinterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  printerName!: string;

  @IsString()
  @IsOptional()
  sectorConfigId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsInt()
  @IsOptional()
  columns?: number;

  @IsBoolean()
  @IsOptional()
  isThermal?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  copies?: number;

  @IsBoolean()
  @IsOptional()
  printComplements?: boolean;

  @IsString()
  @IsOptional()
  customMessage?: string;

  @IsString()
  @IsOptional()
  qrCodeUrl?: string;

  @IsString()
  @IsNotEmpty()
  branchId!: string;
}

export class UpdatePrinterDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  printerName?: string;

  @IsString()
  @IsOptional()
  sectorConfigId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(PrinterStatus)
  @IsOptional()
  status?: PrinterStatus;

  @IsInt()
  @Min(1)
  @IsOptional()
  copies?: number;

  @IsBoolean()
  @IsOptional()
  printComplements?: boolean;

  @IsString()
  @IsOptional()
  customMessage?: string;

  @IsString()
  @IsOptional()
  qrCodeUrl?: string;
}

export class TestPrinterDto {
  @IsString()
  @IsNotEmpty()
  printerId!: string;

  @IsString()
  @IsOptional()
  sectorConfigId?: string;
}

export class UpdatePrinterStatusDto {
  @IsEnum(PrinterStatus)
  status!: PrinterStatus;

  @IsOptional()
  errorMessage?: string;
}

export class CreatePrintConfigDto {
  @IsEnum(OrderType)
  orderType!: OrderType;

  @IsInt()
  @Min(1)
  copies!: number;

  @IsString()
  @IsOptional()
  printerId?: string;

  @IsString()
  @IsOptional()
  productionPrinterId?: string;

  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @IsNotEmpty()
  branchId!: string;
}

export class UpdatePrintConfigDto {
  @IsEnum(OrderType)
  @IsOptional()
  orderType?: OrderType;

  @IsNumber()
  @Min(1)
  @IsOptional()
  copies?: number;

  @IsString()
  @IsOptional()
  printerId?: string;

  @IsString()
  @IsOptional()
  productionPrinterId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
