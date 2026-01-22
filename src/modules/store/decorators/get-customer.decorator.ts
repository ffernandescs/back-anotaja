import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetCustomer = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const customer = request.user; // Vem do JWT após autenticação

    return data ? customer?.[data] : customer;
  },
);
