// create-complement-option.dto.ts
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';

export enum SelectionType {
  SINGLE = 'single',
  MULTIPLE_NO_REPEAT = 'multiple_no_repeat',
  MULTIPLE_REPEAT = 'multiple_repeat',
}

export class CreateComplementOptionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  stockControlEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  complementId?: string;
}
