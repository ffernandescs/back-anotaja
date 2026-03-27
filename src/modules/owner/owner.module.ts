import { Module } from '@nestjs/common';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { OwnerAuthService } from './owner.auth.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { MailService } from '../mail/mail.service';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtOwnerStrategy } from './strategies/jwt.strategy.owner';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService): JwtModuleOptions => {
            const expiresIn = configService.get<string>('OWNER_JWT_EXPIRES_IN') || '7d';
            return {
              secret:
                configService.get<string>('OWNER_JWT_SECRET') ||
                'seu-secret-super-seguro-aquis2',
              signOptions: {
                // @ts-expect-error - "7d" is a valid string value for expiresIn
                expiresIn,
              },
            };
          },
          inject: [ConfigService],
        }),
  ],
  controllers: [OwnerController],
  providers: [
    OwnerService,
    OwnerAuthService,
    GeocodingService,
    MailService,
    JwtOwnerStrategy,
  ],
  exports: [OwnerService, OwnerAuthService],
})
export class OwnerModule {}
