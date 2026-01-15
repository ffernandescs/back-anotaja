import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  /**
   * ⚠️ IMPORTANTE PARA VERCEL
   * WebSocket Adapter quebra CORS/preflight em serverless
   * Só habilite fora do Vercel
   */
  if (!process.env.VERCEL) {
    app.useWebSocketAdapter(new IoAdapter(app));
  }

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
        /^https?:\/\/([a-z0-9-]+\.)*anotaja\.shop$/i, // anotaja.shop + subdomínios
        /^https?:\/\/([a-z0-9-]+\.)*vercel\.app$/i, // previews Vercel
        /^http:\/\/localhost:\d+$/i, // localhost
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

  await app.listen(port);

  console.log(`🚀 Application running on port ${port} (prefix: /api)`);
}

bootstrap();
