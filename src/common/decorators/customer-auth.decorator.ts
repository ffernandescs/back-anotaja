import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtCustomerAuthGuard } from '../guards/jwt-customer.guard';
import { Public } from './public.decorator';

/**
 * Rotas da loja autenticadas como customer.
 * - `@Public()` → ignora apenas o JwtAuthGuard global (admin)
 * - `JwtCustomerAuthGuard` → exige Bearer com JWT_CUSTOMER_SECRET
 */
export function CustomerAuth() {
  return applyDecorators(Public(), UseGuards(JwtCustomerAuthGuard));
}
