import { IsString, IsOptional, IsArray } from 'class-validator';

export class AutoCreateRoutesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderIds?: string[];
}
