import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

@Injectable()
export class JwtCustomerAuthGuard extends AuthGuard('jwt-customer') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de cliente obrigatório');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Token de cliente obrigatório');
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser, _info: any): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException('Token de cliente inválido ou ausente')
      );
    }
    return user;
  }
}
