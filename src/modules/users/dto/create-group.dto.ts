import { IsString, IsOptional, IsArray, IsEnum, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Action, Subject } from '../../../ability/types/ability.types';

class PermissionDto {
  @IsEnum(Action)
  action!: Action;

  @IsEnum(Subject)
  subject!: Subject;

  @IsOptional()
  @IsBoolean()
  inverted?: boolean;
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