import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // IMPORTANTE:
  // Configurar o WebSocket adapter ANTES do setGlobalPrefix
  // WebSocket NÃO usa globalPrefix
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global prefix (afeta apenas rotas HTTP)
  app.setGlobalPrefix('api');

  // Validation pipe global
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

  // CORS
  app.enableCors({
    origin: (origin, callback) => {
      // Permite chamadas sem origin (ex: Postman, mobile apps)
      if (!origin) {
        return callback(null, true);
      }

      const allowedDomainRegex = /^https?:\/\/([a-z0-9-]+\.)*anotaja\.shop$/i;

      if (allowedDomainRegex.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  const port = configService.get<number>('PORT') ?? 3001;

  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
}

bootstrap();
