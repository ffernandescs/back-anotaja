import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateComplementOptionDto } from './create-complement-option.dto';

export class CreateComplementDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOptions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxOptions?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRepeat?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsString()
  productId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateComplementOptionDto)
  options?: CreateComplementOptionDto[];
}
