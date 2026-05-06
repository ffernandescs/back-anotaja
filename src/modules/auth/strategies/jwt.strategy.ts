import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { prisma } from '../../../../lib/prisma';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || '12346',
    });
  }

  async validate(payload: {
    sub?: string;
    userId?: string;
    email?: string;
    role?: string;
    phone?: string;
    type?: string;
    partnerId?: string;
  }) {
    // Se for token de partner, validar como partner
    if (payload.type === 'partner') {
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
        type: 'partner',
      };
    }

    // Usar sub ou userId (compatibilidade com tokens de store e admin)
    const userId = payload.sub || payload.userId;
    if (!userId) {
      throw new UnauthorizedException('Token inválido: userId não encontrado');
    }

    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return {
      userId: user.id,
      email: user.email,
      group: user.group,
      branchId: user.branchId
    };
  }
}
