import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtPartnerAuthGuard extends AuthGuard('jwt-partner') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Não pular autenticação - sempre executar o guard
    // O @Public() é usado para pular guards globais, não guards específicos
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new Error('Unauthorized');
    }
    return user;
  }
}
