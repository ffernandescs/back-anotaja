import { IsBoolean, IsString, IsOptional, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { TableStatus } from '../types';
import { TableType } from './create-table.dto';
import { Type } from 'class-transformer';
import { CreateStoreOrderDto } from 'src/modules/store/dto/create-store-order.dto';

export class UpdateTableDto {
  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  identification?: string;

  @IsEnum(TableStatus)
  @IsOptional()
  status?: TableStatus;

  @IsEnum(TableType)
  @IsOptional()
  type?: TableType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  numberOfPeople?: number;

  @IsString()
  @IsOptional()
  customerId?: string;

  // Dados do pedido inicial — só obrigatório ao abrir a mesa (status → OCCUPIED)
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateStoreOrderDto)
  order?: CreateStoreOrderDto;


}
