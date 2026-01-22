import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtCustomerStrategy } from './strategies/jwt.strategy.customer';
import { GeocodingService } from '../geocoding/geocoding.service';

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
    CustomersModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, JwtCustomerStrategy, GeocodingService],
  exports: [CustomersService], // exporta se precisar em outros módulos
})
export class CustomersModule {}
