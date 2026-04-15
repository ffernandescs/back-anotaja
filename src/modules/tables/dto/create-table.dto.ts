import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateOrderDto } from 'src/modules/orders/dto/create-order.dto';
import { CreateStoreOrderDto } from 'src/modules/store/dto/create-store-order.dto';

export enum TableType {
  MESA = 'MESA',
  COMANDA = 'COMANDA',
}

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsEnum(TableType)
  @IsOptional()
  type?: TableType;

  @IsString()
  @IsOptional()
  identification?: string;


}
