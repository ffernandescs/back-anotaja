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

  // Configurações de taxa de serviço
  @IsOptional()
  @IsBoolean()
  enableServiceFee?: boolean = false;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  serviceFeePercentage?: number = 10;

  // Configurações de gestão de mesas
  @IsOptional()
  @IsNumber()
  @Min(1)
  tableCount?: number = 10;

  // Configurações de tipos de pedido
  @IsOptional()
  @IsBoolean()
  enableDelivery?: boolean = true;

  @IsOptional()
  @IsBoolean()
  enableDineIn?: boolean = true;

  @IsOptional()
  @IsBoolean()
  enablePickup?: boolean = true;

  // Configurações gerais do cardápio
  @IsOptional()
  @IsBoolean()
  sendOrdersByWhatsApp?: boolean = false;

  @IsOptional()
  @IsBoolean()
  showPromotionsScreen?: boolean = false;

  @IsOptional()
  @IsBoolean()
  showMenuFooter?: boolean = true;

  @IsOptional()
  @IsBoolean()
  verifyNewCustomerPhone?: boolean = false;

  @IsOptional()
  @IsBoolean()
  hideOrderStatus?: boolean = false;

  @IsOptional()
  @IsBoolean()
  hideStoreAddress?: boolean = false;

  @IsOptional()
  @IsBoolean()
  simplifiedAddressInput?: boolean = false;

  @IsOptional()
  @IsBoolean()
  referencePointRequired?: boolean = false;

  @IsOptional()
  @IsBoolean()
  showCategoriesScreen?: boolean = true;

  @IsOptional()
  @IsBoolean()
  hideFreightCalculation?: boolean = false;

  @IsOptional()
  @IsBoolean()
  autoCompleteOrders?: boolean = false;
}

export class UpdateGeneralConfigDto extends CreateGeneralConfigDto {}
