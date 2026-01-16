import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { securityConfig } from '../../../src/config/security.config';
import { prisma } from '../../../lib/prisma';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES ?? 10);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  private async sendResetEmail(email: string, otp: string) {
    await this.mailService.sendResetPasswordEmail(email, otp);
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuário inativo');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    const payload = {
      email: user.email || user.phone,
      sub: user.id,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    // pedidos pendentes (mantive seu código)
    let pendingOrders: any[] = [];
    if (user.branchId) {
      pendingOrders = await prisma.order.findMany({
        where: {
          branchId: user.branchId,
          status: 'PENDING',
        },
        select: {
          id: true,
          orderNumber: true,
          customer: true,
          total: true,
          deliveryType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      },
      pendingOrders,
    };
  }

  async verifyOtp(email: string, otp: string) {
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    return { message: 'Código validado com sucesso' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      securityConfig.bcryptSaltRounds,
    );

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { used: true },
    });

    return { message: 'Senha redefinida com sucesso' };
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    // 🔐 Segurança: não revela se existe
    if (!user) {
      return {
        message: 'Se o email existir, enviaremos o código',
      };
    }

    // Invalida tokens antigos
    await prisma.passwordResetToken.updateMany({
      where: {
        email,
        used: false,
      },
      data: {
        used: true,
      },
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRES_IN_MINUTES);

    await prisma.passwordResetToken.create({
      data: {
        email,
        otp,
        expiresAt,
      },
    });

    // 👇 ENVIO DE EMAIL NÃO PODE QUEBRAR
    const emailSent = await this.mailService.sendResetPasswordEmail(email, otp);

    if (!emailSent) {
      // Loga, mas não quebra
      console.warn(`Token criado, mas email não enviado: ${email}`);
    }

    return {
      message: 'Se o email existir, enviaremos o código',
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const user = await this.usersService.create({
      ...registerDto,
      role: 'customer',
    });

    const payload = {
      email: user.email || user.phone,
      sub: user.id,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: await this.generateRefreshToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenDto.refresh_token },
      include: { user: true },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (refreshToken.expiresAt < new Date()) {
      // Remove token expirado
      await prisma.refreshToken.delete({
        where: { id: refreshToken.id },
      });
      throw new UnauthorizedException('Refresh token expirado');
    }

    if (!refreshToken.user.active) {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Gera novo access token
    const payload = {
      email: refreshToken.user.email || refreshToken.user.phone,
      sub: refreshToken.user.id,
      role: refreshToken.user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: refreshToken.user.id,
        email: refreshToken.user.email,
        name: refreshToken.user.name,
        phone: refreshToken.user.phone,
        role: refreshToken.user.role,
        companyId: refreshToken.user.companyId || undefined,
        branchId: refreshToken.user.branchId || undefined,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        active: true,
        companyId: true,
        orders: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        company: true,
        branch: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Buscar pedidos pendentes da filial do usuário
    let pendingOrders: any[] = [];
    if (user.branchId) {
      pendingOrders = await prisma.order.findMany({
        where: {
          branchId: user.branchId,
          status: 'PENDING',
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          customer: true,
          deliveryType: true,
          status: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Limitar a 50 pedidos pendentes
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        active: user.active,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
        company: user.company || undefined,
        branch: user.branch || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        orders: user.orders || undefined,
      },
      bootstrap: {
        pendingOrders,
      },
    };
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    // Gera token aleatório seguro
    const token = crypto.randomBytes(64).toString('hex');

    // Expira em 30 dias
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Remove tokens antigos do usuário (opcional - pode manter múltiplos)
    // await prisma.refreshToken.deleteMany({
    //   where: { userId },
    // });

    // Salva o token no banco
    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    return { message: 'Logout realizado com sucesso' };
  }
}
