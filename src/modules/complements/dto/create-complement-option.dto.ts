import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';

export class CreateComplementOptionDto {
  @IsString()
  id!: string;

  @IsString()
  complementId!: string;

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
}
