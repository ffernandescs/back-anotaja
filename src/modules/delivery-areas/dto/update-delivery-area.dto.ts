
// dto/update-delivery-area-exclusion.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryAreaDto } from './create-delivery-area.dto';
import { IsInt, Min } from 'class-validator';

export class UpdateDeliveryAreaExclusionDto extends PartialType(CreateDeliveryAreaDto) {}

export class UpdateDeliveryAreaLevelDto {
  @IsInt()
  @Min(1)
  level!: number;
}