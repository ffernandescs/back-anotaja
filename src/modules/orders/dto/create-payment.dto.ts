// src/modules/orders/dto/create-payment.dto.ts
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { PaymentMethodTypeDto } from 'src/modules/branches/dto/create-branch.dto';

export class CreatePaymentDto {
  @IsString()
  type!: PaymentMethodTypeDto; // Ex: 'CASH', 'CARD', 'PIX', etc.

  @IsNumber()
  amount!: number;

  @IsString()
  paymentMethodId!: string;

  @IsNumber()
  @IsOptional()
  change?: number; // Troco, se houver
}
