import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UpdateGeneralConfigDto } from '../../general-config/dto/general-config.dto';
import { CreateBranchDto } from './create-branch.dto';

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGeneralConfigDto)
  generalConfig?: UpdateGeneralConfigDto;
}
