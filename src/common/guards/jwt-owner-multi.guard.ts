import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtOwnerMultiAuthGuard extends AuthGuard('jwt-owner') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers['authorization'];
    
    // Parse manual de cookies do header 'cookie'
    const cookieHeader = request.headers['cookie'] as string;
    let cookieToken: string | undefined;
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc: any, cookie: string) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) acc[key] = value;
        return acc;
      }, {});
      cookieToken = cookies['owner_token'];
    }
    
    // Extrair token de múltiplas fontes (similar ao delivery)
    const headerToken = (request.headers['owner_token'] as string | undefined)?.trim();
    const bearer = authorization?.replace('Bearer ', '').trim();
    
    // Definir o token no request para o Passport encontrar
    const token = headerToken || cookieToken || bearer;
    
    if (token) {
      request.headers['authorization'] = `Bearer ${token}`;
    }
    
    return super.canActivate(context);
  }
}
