import { IsString, IsOptional, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PermissionDto {
  action!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsBoolean()
  inverted?: boolean;

  @IsOptional()
  @IsBoolean()
  isOverride?: boolean;
}

export class CreateGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions!: PermissionDto[];
}