import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OwnerLoginDto } from './dto/create-owner.dto';
import { prisma } from '../../../lib/prisma';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OwnerAuthService {
  constructor(
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  /**
   * Valida credenciais do owner (MasterUser)
   */
  async validateOwner(email: string, password: string) {
    // Buscar MasterUser
    const masterUser = await prisma.masterUser.findUnique({
      where: { email },
    });

    if (!masterUser || !masterUser.password || !masterUser.active) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, masterUser.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return masterUser;
  }

  /**
   * Login do owner com JWT específico
   */
  async login(loginDto: OwnerLoginDto) {
    
    const masterUser = await this.validateOwner(loginDto.email, loginDto.password);

    // Payload específico para owner (MasterUser)
    const payload = {
      sub: masterUser.id,
      email: masterUser.email,
      type: 'owner', // Tipo específico
      role: 'master', // Papel de superusuário
    };

    // JWT com chave diferente (config específica para owner)
    
    // Verificar variáveis de ambiente
    const accessToken = this.jwtService.sign(payload, { secret: process.env.OWNER_JWT_SECRET, expiresIn: '7d' });

    // Para MasterUser, não usamos refresh tokens em banco
    const refreshToken = `owner_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    return {
      access_token: accessToken,
      refresh_token: refreshToken, // Apenas para compatibilidade com frontend
      token_type: 'Bearer',
      expires_in: 7 * 24 * 60 * 60, // 7 dias em segundos
      user: {
        id: masterUser.id,
        name: masterUser.name,
        email: masterUser.email,
        role: 'master',
        active: masterUser.active,
        permissions: ['ALL'], // Owner tem acesso total
      },
    };
  }

  /**
   * Gera refresh token específico para owner
   */
  private async generateOwnerRefreshToken(userId: string): Promise<string> {
    const refreshToken = `owner_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
      },
    });

    return refreshToken;
  }

  /**
   * Refresh token para owner
   */
  async refreshToken(refreshToken: string) {
    // Para MasterUser, não usamos refresh tokens em banco
    // Validamos o token JWT atual e geramos um novo se válido
    try {
      const payload = this.jwtService.verify(refreshToken);
      
      if (payload.type !== 'owner') {
        throw new UnauthorizedException('Token não é de owner');
      }

      // Buscar MasterUser para garantir que ainda está ativo
      const masterUser = await prisma.masterUser.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, active: true }
      });

      if (!masterUser || !masterUser.active) {
        throw new UnauthorizedException('Usuário inválido');
      }
      
      // Gerar novo access token
      const newPayload = {
        sub: masterUser.id,
        email: masterUser.email,
        type: 'owner',
        role: 'master',
      };

      const accessToken = this.jwtService.sign(newPayload);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 7 * 24 * 60 * 60,
      };
    } catch (error) {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  /**
   * Logout do owner
   */
  async logout(refreshToken: string) {
    // Para MasterUser, não há refresh tokens armazenados
    // Apenas retornamos sucesso - o token JWT expirará naturalmente
    return { message: 'Logout realizado com sucesso' };
  }

  /**
   * Verificar se token é de owner
   */
  async verifyOwnerToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.OWNER_JWT_SECRET || process.env.JWT_SECRET,
      });

      if (payload.type !== 'owner') {
        throw new UnauthorizedException('Token não é de owner');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
