import serverlessExpress from '@vendia/serverless-express';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';

let server: ReturnType<typeof serverlessExpress>;

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  /**
   * CORS - mesma configuração do main.ts para produção
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
      'x-tenant',
    ],
    optionsSuccessStatus: 204,
  });

  await app.init();

  server = serverlessExpress({ app: expressApp });
}

export const handler = async (event: any, context: any) => {
  if (!server) await bootstrap();
  return server(event, context);
};
