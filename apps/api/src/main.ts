import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';

async function bootstrap() {
  const config = parseEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.webOrigin, credentials: true });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('ClassLoom API')
    .setDescription('ClassLoom foundation API')
    .setVersion('0.1.0')
    .build());
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(config.apiPort);
}
await bootstrap();
