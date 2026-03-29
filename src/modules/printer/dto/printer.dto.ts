import { IsString, IsEnum, IsBoolean, IsOptional, IsInt, Min, IsNotEmpty } from 'class-validator';
import { PrinterSector, PrinterStatus } from '@prisma/client';

export class CreatePrinterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  printerName!: string;

  @IsEnum(PrinterSector)
  @IsOptional()
  sector?: PrinterSector;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

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

  @IsEnum(PrinterSector)
  @IsOptional()
  sector?: PrinterSector;

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

  @IsEnum(PrinterSector)
  @IsOptional()
  sector?: PrinterSector;
}

export class UpdatePrinterStatusDto {
  @IsEnum(PrinterStatus)
  status!: PrinterStatus;

  @IsString()
  @IsOptional()
  errorMessage?: string;
}
