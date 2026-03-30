import { IsString, IsEnum, IsBoolean, IsOptional, IsInt, Min, IsNotEmpty } from 'class-validator';
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

  @IsString()
  @IsOptional()
  errorMessage?: string;
}

export class CreatePrintConfigDto {
  @IsString()
  @IsNotEmpty()
  orderType!: string;

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
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsNotEmpty()
  branchId!: string;
}

export class UpdatePrintConfigDto {
  @IsString()
  @IsOptional()
  orderType?: string;

  @IsInt()
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
