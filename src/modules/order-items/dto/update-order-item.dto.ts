import { IsOptional, IsEnum } from 'class-validator';

export class UpdateOrderItemDto {
  @IsOptional()
  @IsEnum(['PENDING', 'PREPARING', 'READY'])
  preparationStatus?: 'PENDING' | 'PREPARING' | 'READY';

  @IsOptional()
  @IsEnum(['PENDING', 'DISPATCHED'])
  dispatchStatus?: 'PENDING' | 'DISPATCHED';
}

