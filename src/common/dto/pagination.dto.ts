import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  /** Número da página (mínimo: 1, padrão: 1) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Quantidade de itens por página (mínimo: 1, máximo: 100, padrão: 20) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Campo para ordenação (ex: createdAt, total) */
  @IsOptional()
  @IsString()
  sortBy?: string;

  /** Direção da ordenação (asc ou desc, padrão: desc) */
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  /** Busca textual (busca em nome, telefone, etc) */
  @IsOptional()
  @IsString()
  search?: string;
}

