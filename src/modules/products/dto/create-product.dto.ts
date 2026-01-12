import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Allow,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promotionalPrice?: number;

  @IsOptional()
  @IsString()
  promotionalType?: string; // FIXED, PERCENTAGE

  @IsOptional()
  @IsString()
  promotionalPeriodType?: string; // DATE_RANGE, DAYS_OF_WEEK

  @IsOptional()
  @IsString()
  promotionalStartDate?: string;

  @IsOptional()
  @IsString()
  promotionalEndDate?: string;

  @IsOptional()
  @IsString()
  promotionalDays?: string; // JSON array: ["monday", "tuesday", ...]

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number; // Peso em gramas

  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTime?: number; // Tempo de preparo em minutos

  @IsOptional()
  @IsBoolean()
  stockControlEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  tags?: string; // Tags separadas por vírgula

  @IsOptional()
  @IsString()
  filterMetadata?: string; // JSON com metadados para filtros

  @IsOptional()
  @IsString()
  installmentConfig?: string; // JSON com configuração de parcelamento

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsString()
  categoryId!: string;

  // branchId não é necessário - sempre vem do usuário logado
  // Permitido apenas para não gerar erro de validação se enviado
  @Allow()
  branchId?: string;
}
