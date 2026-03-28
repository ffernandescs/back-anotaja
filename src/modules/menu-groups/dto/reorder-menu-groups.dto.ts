import { IsArray, ValidateNested, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderMenuGroupItemDto {
  @IsString()
  id!: string;

  @IsInt()
  displayOrder!: number;
}

export class ReorderMenuGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderMenuGroupItemDto)
  groups!: ReorderMenuGroupItemDto[];
}