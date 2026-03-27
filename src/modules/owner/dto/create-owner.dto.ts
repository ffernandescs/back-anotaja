import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateOwnerDto {
  // Dados pessoais do owner (superusuário)
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  name!: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(10, { message: 'Telefone deve ter pelo menos 10 dígitos' })
  @Matches(/^\d+$/, { message: 'Telefone deve conter apenas números' })
  phone!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(11, { message: 'CPF deve ter 11 dígitos' })
  @Matches(/^\d+$/, { message: 'CPF deve conter apenas números' })
  cpf?: string;

  @IsOptional()
  @IsString()
  description?: string; // Descrição do papel no sistema
}

export class VerifyOwnerExistsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'Telefone deve conter apenas números' })
  phone?: string;
}

export class OwnerLoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password!: string;
}
