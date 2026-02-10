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
      // Permite chamadas server-to-server (ex: curl, cron, SSR)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = [
        /^https?:\/\/([a-z0-9-]+\.)*anotaja\.shop$/i,
        /^https?:\/\/([a-z0-9-]+\.)*vercel\.app$/i,

        // 🔥 localhost + subdomínios (thyaynna.localhost, admin.localhost etc)
        /^http:\/\/([a-z0-9-]+\.)*localhost:\d+$/i,
      ];

      const isAllowed = allowedOrigins.some((regex) => regex.test(origin));

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'x-tenant', // 🔥 O HEADER QUE FALTAVA
    ],

    optionsSuccessStatus: 204,
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
      verify: (req: any, res, buf) => {
        req['rawBody'] = buf.toString();
      },
    }),
  );

  await app.listen(port);

  console.log(`🚀 Application running on port ${port} (prefix: /api)`);
}

bootstrap();
