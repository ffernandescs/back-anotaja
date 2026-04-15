import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TableType } from './create-table.dto';

export class BulkCreateTablesDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  number?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  startNumber!: number;

  @IsString()
  @IsOptional()
  identification?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  numberofpeople?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  quantity!: number;

  @IsEnum(TableType)
  @IsOptional()
  type?: TableType;
}
