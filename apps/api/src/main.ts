import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';

async function bootstrap() {
  const config = parseEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustedProxyHops);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-ClassLoom-Request'],
  });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('ClassLoom API')
    .setDescription('ClassLoom API')
    .setVersion('0.1.0')
    .build());
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(config.apiPort);
}
await bootstrap();
