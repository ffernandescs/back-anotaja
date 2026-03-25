import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  groupId?: string;
  

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  permissions?: Array<{
    action: string;
    subject: string;
    inverted?: boolean;
  }>;
}
