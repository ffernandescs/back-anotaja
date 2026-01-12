import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import ms from 'ms'; // ✅ default import
import { AuthModule } from '../auth/auth.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [
    WebSocketModule,
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwtExpiresRaw: string | undefined =
          configService.get<string>('JWT_EXPIRES_IN');
        const expiresInEnv: string = jwtExpiresRaw ?? '7d';

        const msValue = ms(expiresInEnv as ms.StringValue);
        const expiresIn: number = Math.floor(msValue / 1000);

        const secret: string =
          configService.get<string>('JWT_SECRET') ??
          'seu-secret-super-seguro-aqui';

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
