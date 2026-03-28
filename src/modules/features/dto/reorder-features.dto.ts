import { IsArray, IsString, IsNumber, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FeatureOrderDto {
  @IsString()
  id!: string;

  @IsNumber()
  displayOrder!: number;
}

export class ReorderFeaturesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeatureOrderDto)
  features!: FeatureOrderDto[];
}
