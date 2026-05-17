import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Telefone inválido' })
  phone?: string;
}
