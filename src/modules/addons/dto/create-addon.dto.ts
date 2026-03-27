import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class CreateAddonDto {
  @IsString()
  key!: string; // ex: "fiscal_note", "route_optimizer"

  @IsString()
  name!: string; // ex: "Emissão de Nota Fiscal", "Otimizador de Rotas"

  @IsOptional()
  @IsString()
  description?: string; // Descrição detalhada do addon

  @IsNumber()
  @Min(0)
  price!: number; // preço em centavos/mês

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
