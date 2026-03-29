import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailService } from '../mail/mail.service';
import { UsersModule } from '../users/users.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AbilityModule } from '../../ability/ability.module';
import { MenuService } from '../../ability/factory/menu.service';

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
    PaymentMethodsModule,
    SubscriptionModule,
    AbilityModule,
  ],
  providers: [AuthService, JwtStrategy, MailService, MenuService],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
