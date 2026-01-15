import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  /**
   * 🌐 CORS — Totalmente aberto (permite qualquer origem)
   */
  app.enableCors({
    origin: true, // Aceita qualquer origem
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*', // Aceita qualquer header
    preflightContinue: false,
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
