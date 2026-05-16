import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Primeiro cadastro de senha (somente se o cliente ainda não tiver senha). */
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Confirmação deve ter no mínimo 6 caracteres' })
  confirmPassword?: string;

  /** Preferência do cliente: exigir senha ao entrar na loja. */
  @IsOptional()
  @IsBoolean()
  loginWithPassword?: boolean;
}
