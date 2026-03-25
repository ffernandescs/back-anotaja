import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { Action, Subject } from '../../../ability/types/ability.types';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Action)
  permissions?: Array<{
    action: Action;
    subject: Subject;
    inverted?: boolean;
  }>;
}
