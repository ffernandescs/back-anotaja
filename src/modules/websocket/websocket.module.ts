import { Module, forwardRef } from '@nestjs/common';
import { OrdersWebSocketGateway } from './websocket.gateway';
import { RedisService } from './redis.service';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    forwardRef(() => WhatsAppModule),
    UploadModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '7d';
        return {
          secret:
            configService.get<string>('JWT_SECRET') ||
            'seu-secret-super-seguro-aqui',
          signOptions: {
            // @ts-expect-error - "7d" is a valid string value for expiresIn
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [OrdersWebSocketGateway, RedisService],
  exports: [OrdersWebSocketGateway, RedisService],
})
export class WebSocketModule {}
