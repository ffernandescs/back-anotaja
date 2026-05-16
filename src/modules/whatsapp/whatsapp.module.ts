import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';
import { WebSocketModule } from '../websocket/websocket.module';
import { UploadModule } from '../upload/upload.module';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    forwardRef(() => WebSocketModule),
    UploadModule,
    AiModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'fallback-secret',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [],
    }),
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, JwtAuthGuard],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
