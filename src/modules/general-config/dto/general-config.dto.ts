import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, Min, Max } from 'class-validator';

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
  printCompanyLogo?: boolean = true;

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

  // Informações do Estabelecimento (mantidos para compatibilidade)
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  // Configurações legacy (mantidos para compatibilidade)
  @IsOptional()
  @IsBoolean()
  showTaxInfo?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showCustomerInfo?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showOrderDetails?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showPaymentInfo?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showTimestamp?: boolean = true;

  @IsOptional()
  @IsString()
  headerMessage?: string;

  @IsOptional()
  @IsString()
  footerMessage?: string;

  @IsOptional()
  @IsString()
  thankYouMessage?: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(80)
  maxCharactersPerLine?: number = 40;

  @IsOptional()
  @IsEnum(FontSize)
  fontSize?: FontSize = FontSize.MEDIUM;

  @IsOptional()
  @IsBoolean()
  printLogo?: boolean = false;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  showTaxNumber?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showFiscalInfo?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showOrderNumber?: boolean = true;

  @IsOptional()
  @IsBoolean()
  showTableNumber?: boolean = true;
}

export class UpdateGeneralConfigDto extends CreateGeneralConfigDto {}
