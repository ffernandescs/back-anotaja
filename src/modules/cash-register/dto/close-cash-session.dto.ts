import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseCashSessionDto {
  @IsNumber()
  @Min(0)
  closingAmount!: number; // Valor retirado no fechamento (centavos). O saldo que fica no caixa é persistido em CashSession.closingAmount

  @IsString()
  @IsOptional()
  notes?: string;
}
