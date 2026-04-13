import { IsString, IsOptional, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PermissionDto {
  @IsString()
  action!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsBoolean()
  inverted?: boolean;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions?: PermissionDto[];
}
