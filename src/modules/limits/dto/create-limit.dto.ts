import { IsString, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

export class CreateLimitDto {

  @IsString()
  @IsNotEmpty()
  planId!: string;

 
  @IsString()
  @IsNotEmpty()
  resource!: string;

  @IsInt()
  @Min(-1)
  maxValue!: number;
}
