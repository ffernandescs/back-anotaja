import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateOwnerDto {
  // Dados pessoais do dono
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

  // Dados da empresa
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Nome da empresa deve ter pelo menos 2 caracteres' })
  companyName!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(14, { message: 'CNPJ deve ter 14 dígitos' })
  @Matches(/^\d+$/, { message: 'CNPJ deve conter apenas números' })
  document!: string;

  // Dados da primeira filial (matriz)
  @IsNotEmpty()
  @IsString()
  street!: string;

  @IsNotEmpty()
  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsNotEmpty()
  @IsString()
  neighborhood!: string;

  @IsNotEmpty()
  @IsString()
  city!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Estado deve ter 2 caracteres' })
  state!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'CEP deve ter 8 dígitos' })
  @Matches(/^\d+$/, { message: 'CEP deve conter apenas números' })
  zipCode!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class VerifyOwnerExistsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'Telefone deve conter apenas números' })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve ter 14 dígitos' })
  document?: string;
}
