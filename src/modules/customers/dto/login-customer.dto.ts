import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginCustomerDto {
  @IsNotEmpty()
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password?: string;
}
