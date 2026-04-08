import { IsOptional, IsBoolean, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum FontSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export class CreateGeneralConfigDto {
  // Configurações de impressão
  @IsOptional()
  @IsBoolean()
  showItemNumber?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showComplementPrice?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showComplementName?: boolean = true;

  @IsOptional()
  @IsBoolean()
  useLargerFontForProduction?: boolean = true;

  @IsOptional()
  @IsBoolean()
  multiplyOptionsByQuantity?: boolean = false;

  @IsOptional()
  @IsBoolean()
  printCancellationReceipt?: boolean = false;

  @IsOptional()
  @IsBoolean()
  printRatingQRCode?: boolean = true;

  // Configurações de texto
  @IsOptional()
  @IsString()
  standardRouteMessage?: string;

  @IsOptional()
  @IsString()
  tableClosingMessage?: string;

  @IsOptional()
  @IsString()
  standardRouteQRCode?: string;

  @IsOptional()
  @IsString()
  tableClosingQRCode?: string;
}

export class UpdateGeneralConfigDto extends CreateGeneralConfigDto {}
