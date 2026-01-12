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
  app.enableCors();
  await app.init();

  server = serverlessExpress({ app: expressApp });
}

export const handler = async (event: any, context: any) => {
  if (!server) await bootstrap();
  return server(event, context);
};
