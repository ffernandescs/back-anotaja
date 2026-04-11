import { IsOptional, IsInt, Min, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCustomersDto {
  /** Número da página (mínimo: 1, padrão: 1) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Quantidade de itens por página (mínimo: 1). Quando não informado, retorna todos os registros. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Campo para ordenação (ex: name, createdAt, phone, email) */
  @IsOptional()
  @IsString()
  sortBy?: string;

  /** Direção da ordenação (asc ou desc, padrão: desc) */
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  /** Busca textual (busca em nome, telefone, email) */
  @IsOptional()
  @IsString()
  search?: string;
}
