import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { CreateMenuGroupDto } from './create-menu-group.dto';

export class UpdateMenuGroupDto extends PartialType(CreateMenuGroupDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
