import { IsString, MinLength, IsOptional } from 'class-validator';

export class StoreLoginDto {
  @IsString()
  @MinLength(10, { message: 'Telefone inválido' })
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
