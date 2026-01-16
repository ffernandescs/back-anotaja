import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailService } from '../mail/mail.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '7d';
        return {
          secret:
            configService.get<string>('JWT_SECRET') ||
            'seu-secret-super-seguro-aquis',
          signOptions: {
            // @ts-expect-error - "7d" is a valid string value for expiresIn
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  providers: [AuthService, JwtStrategy, MailService],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
