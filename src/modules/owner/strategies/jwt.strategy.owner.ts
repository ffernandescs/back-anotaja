import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { prisma } from '../../../../lib/prisma';

@Injectable()
export class JwtOwnerStrategy extends PassportStrategy(
  Strategy,
  'jwt-owner',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.OWNER_JWT_SECRET || 'seu-secret-super-seguro-aquis2',
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    // Verificar se é um token de owner
    if (payload.type !== 'owner') {
      throw new UnauthorizedException('Token não é de owner');
    }

    const userId = payload.sub || payload.userId;
    if (!userId) {
      throw new UnauthorizedException('Token inválido: userId não encontrado');
    }

    const masterUser = await prisma.masterUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, active: true, }
    });
    
    if (!masterUser || !masterUser.active) {
      throw new UnauthorizedException('Owner não encontrado ou inativo');
    }

    return {
      userId: masterUser.id,
      email: masterUser.email,
      name: masterUser.name,
    };
  }
}
