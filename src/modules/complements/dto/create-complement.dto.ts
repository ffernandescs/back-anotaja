import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateComplementOptionDto } from './create-complement-option.dto';
import { ConnectComplementOptionDto } from './connect-complement-option.dto ';

export enum SelectionTypeDto {
  SINGLE = 'SINGLE',
  MULTIPLE_NO_REPEAT = 'MULTIPLE_NO_REPEAT',
  MULTIPLE_REPEAT = 'MULTIPLE_REPEAT',
}

export class CreateComplementDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOptions?: number;

  @IsEnum(SelectionTypeDto)
  selectionType!: SelectionTypeDto;

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

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConnectComplementOptionDto)
  options?: ConnectComplementOptionDto[];
}
