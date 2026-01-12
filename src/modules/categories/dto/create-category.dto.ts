import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { Allow } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @Allow() // Permite branchId no body, mas será ignorado - sempre usa do usuário logado
  branchId?: string;
}
