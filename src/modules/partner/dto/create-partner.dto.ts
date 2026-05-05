import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, MinLength } from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  commission?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
