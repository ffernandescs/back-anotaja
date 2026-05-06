import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAnyAuthGuard {
  private readonly logger = new Logger(JwtAnyAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar se o decorator @Public() está no handler (método) ou no controller (classe)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      this.logger.error('[JwtAnyAuthGuard] No token found in request');
      this.logger.error('[JwtAnyAuthGuard] Authorization header:', request.headers.authorization);
      throw new UnauthorizedException('Token não encontrado');
    }

    this.logger.log('[JwtAnyAuthGuard] Token found, attempting validation');
    this.logger.log('[JwtAnyAuthGuard] JWT_SECRET:', process.env.JWT_SECRET ? 'set' : 'not set');
    this.logger.log('[JwtAnyAuthGuard] PARTNER_JWT_SECRET:', process.env.PARTNER_JWT_SECRET ? 'set' : 'not set');

    try {
      // Tenta validar com PARTNER_JWT_SECRET (partner) primeiro
      const partnerSecret = process.env.PARTNER_JWT_SECRET || process.env.JWT_SECRET;
      if (partnerSecret) {
        try {
          const payload = this.jwtService.verify(token, {
            secret: partnerSecret,
          });
          this.logger.log('[JwtAnyAuthGuard] Validated with PARTNER_JWT_SECRET (partner)');
          this.logger.log('[JwtAnyAuthGuard] Payload:', JSON.stringify(payload));
          request['user'] = payload;
          return true;
        } catch (partnerError) {
          this.logger.log('[JwtAnyAuthGuard] PARTNER_JWT_SECRET validation failed:', (partnerError as Error).message);
        }
      }

      // Tenta validar com JWT_SECRET (admin)
      if (process.env.JWT_SECRET) {
        try {
          const payload = this.jwtService.verify(token, {
            secret: process.env.JWT_SECRET,
          });
          this.logger.log('[JwtAnyAuthGuard] Validated with JWT_SECRET (admin)');
          this.logger.log('[JwtAnyAuthGuard] Payload:', JSON.stringify(payload));
          request['user'] = payload;
          return true;
        } catch (adminError) {
          this.logger.log('[JwtAnyAuthGuard] JWT_SECRET validation failed:', (adminError as Error).message);
        }
      }

      this.logger.error('[JwtAnyAuthGuard] Both validation attempts failed');
      throw new UnauthorizedException('Token inválido');
    } catch (error) {
      this.logger.error('[JwtAnyAuthGuard] Unexpected error:', (error as Error).message);
      throw new UnauthorizedException('Token inválido');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
