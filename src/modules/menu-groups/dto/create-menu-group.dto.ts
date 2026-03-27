import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateMenuGroupDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
