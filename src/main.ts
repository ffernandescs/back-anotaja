

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  /**
   * WebSocket Adapter com suporte a polling HTTP para Vercel
   * Socket.io automaticamente usa polling quando WebSocket não está disponível
   */
  app.useWebSocketAdapter(new IoAdapter(app));

  /**
   * 🌐 CORS — compatível com Vercel + subdomínios
   */
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        /^https?:\/\/([a-z0-9-]+\.)*vaidelli\.com\.br$/i,
        /^https?:\/\/([a-z0-9-]+\.)*vercel\.app$/i,
        /^https?:\/\/localhost(:\d+)?$/i,
        /^https?:\/\/([a-z0-9-]+\.)+localhost(:\d+)?$/i,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
      ];

      const allowed = allowedOrigins.some((r) => r.test(origin));

      return allowed
        ? callback(null, true)
        : callback(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Tenant',
      'X-Auth-Context',
    ],
  });

  /**
   * Global prefix (somente HTTP)
   */
  app.setGlobalPrefix('api');

  /**
   * Validation pipe global
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = configService.get<number>('PORT') ?? 3001;
  app.use(
    bodyParser.json({
      limit: '50mb', // Aumentado para aceitar imagens base64
      verify: (req: any, res, buf) => {
        req['rawBody'] = buf.toString();
      },
    }),
  );

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });

await app.listen(port, '0.0.0.0'); // <-- importante

  console.log(`🚀 Application running on port ${port} (prefix: /api)`);
}

bootstrap();
