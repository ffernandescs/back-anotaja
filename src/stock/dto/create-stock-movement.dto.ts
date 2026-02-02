import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export enum StockMovementType {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
  AJUSTE = 'AJUSTE',
  VENDA = 'VENDA',
}

export enum StockItemType {
  PRODUCT = 'PRODUCT',
  OPTION = 'OPTION',
  INGREDIENT = 'INGREDIENT',
}

export class CreateStockMovementDto {
  @IsEnum(StockMovementType)
  @IsNotEmpty()
  type!: StockMovementType;

  @IsEnum(StockItemType)
  @IsNotEmpty()
  itemType!: StockItemType;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  optionId?: string;

  @IsString()
  @IsOptional()
  ingredientId?: string;

  @IsNumber()
  @IsNotEmpty()
  variation!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
