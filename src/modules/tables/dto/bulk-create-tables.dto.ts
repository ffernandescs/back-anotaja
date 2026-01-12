import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
}
