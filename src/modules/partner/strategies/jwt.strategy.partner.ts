import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { prisma } from '../../../../lib/prisma';

@Injectable()
export class JwtPartnerStrategy extends PassportStrategy(
  Strategy,
  'jwt-partner',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        configService.get<string>('JWT_SECRET') || '12346',
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    // Verificar se é um token de partner
    if (payload.type !== 'partner') {
      throw new UnauthorizedException('Token não é de partner');
    }

    const partnerId = payload.sub || payload.partnerId;
    if (!partnerId) {
      throw new UnauthorizedException('Token inválido: partnerId não encontrado');
    }

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, email: true, name: true, active: true }
    });
    
    if (!partner || !partner.active) {
      throw new UnauthorizedException('Partner não encontrado ou inativo');
    }

    return {
      partnerId: partner.id,
      email: partner.email,
      name: partner.name,
    };
  }
}
