import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatusDto } from './create-order-item.dto';

export class QueryOrdersDto {
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

  /** Busca textual (busca em nome, telefone, número do pedido) */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filtrar por status único */
  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;

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
