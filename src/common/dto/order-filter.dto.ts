import { IsOptional, IsEnum, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class OrderFilterDto {
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

  /** Buscar por nome do cliente, telefone ou número do pedido */
  @IsOptional()
  @IsString()
  search?: string;
}
