import { IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class LocationUpdateDto {
  @IsString()
  rotaId!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates!: CoordinatesDto;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}
