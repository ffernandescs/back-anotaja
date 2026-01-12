import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { TableStatus } from '../types';

export class UpdateTableDto {
  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  identification?: string;

  @IsEnum(['FECHADA', 'ABERTA', 'RESERVED', 'CLEANING', 'MERGED'])
  @IsOptional()
  status?: TableStatus;

  @IsNumber()
  @IsOptional()
  numberOfPeople?: number;

  @IsString()
  @IsOptional()
  customerId?: string;
}
