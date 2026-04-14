import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class QueryOrdersDto {
  /** Número da página (mínimo: 1, padrão: 1) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Quantidade de itens por página (mínimo: 1). Quando não informado, retorna todos os registros sem paginação. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Campo para ordenação (ex: createdAt, total) */
  @IsOptional()
  @IsString()
  sortBy?: string;

  /** Direção da ordenação (asc ou desc, padrão: desc) */
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  /** Busca textual (busca em nome, telefone, número do pedido) */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filtrar por status único */
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Filtrar por múltiplos status (separados por vírgula) */
  @IsOptional()
  @IsString()
  statuses?: string;

  /** Filtrar por ID do entregador */
  @IsOptional()
  @IsString()
  deliveryPersonId?: string;

  /** Filtrar por tipo de entrega (DINE_IN, PICKUP, DELIVERY) */
  @IsOptional()
  @IsString()
  deliveryType?: string;
}
