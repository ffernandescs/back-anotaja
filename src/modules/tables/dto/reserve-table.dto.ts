import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class ReserveTableDto {
  @IsString()
  @IsNotEmpty()
  reservationName!: string;

  @IsDateString()
  @IsNotEmpty()
  @IsOptional()
  reservationPhone!: string;

  @IsDateString()
  @IsNotEmpty()
  @IsOptional()
  reservedFor?: string;

  @IsNumber()
  @IsOptional()
  numberOfPeople?: number;
}
