import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiModule } from './api.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(ApiModule);

  // Railway / reverse proxies: trust X-Forwarded-For so login rate limits key on real client IP.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Call Agent API')
    .setDescription(
      'Inbound/outbound call-agent platform API. Use Authorize with a Bearer JWT from admin or org-user login. Groups match domain modules/entities (admin-scoped routes stay under /api/admin/*).',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste access_token from /api/auth/admin/login or /api/auth/login',
      },
      'bearer',
    )
    .addTag('auth', 'Login and current principal (admin + org user)')
    .addTag('organizations', 'Platform org registry (admin)')
    .addTag('users', 'Org users under an organization (admin) + org-user agent config')
    .addTag('agents', 'Platform agent templates (admin)')
    .addTag(
      'organization-agents',
      'Agent assignments and per-org overrides (admin)',
    )
    .addTag('calls', 'Call lifecycle and web test dispatch (admin)')
    .addTag(
      'user-calls',
      'Bulk enqueue, queue cancel/retry/prioritize, immediate outbound, web test, list (org user)',
    )
    .addTag(
      'user-queue',
      'Org outbound dial queue settings, pause/resume, batches, live stats (org user)',
    )
    .addTag(
      'admin-queue',
      'Platform queue stats and per-org queue settings override (admin)',
    )
    .addTag(
      'user-sip-trunks',
      'List/get all SIP trunks for caller org (org user)',
    )
    .addTag(
      'user-outbound-sip-trunks',
      'Create/link/list/update/delete outbound SIP trunks (org user)',
    )
    .addTag(
      'user-inbound-sip-trunks',
      'Save/list inbound SIP trunks (draft) and publish to LiveKit (org user)',
    )
    .addTag(
      'user-sip-dispatch-rules',
      'Save/list SIP dispatch rules (draft) and publish to LiveKit (org user)',
    )
    .addTag(
      'user-inbound-publish',
      'Publish inbound trunks + dispatch rules to LiveKit in one call',
    )
    .addTag('user-tool-profiles', 'List/get tool profiles catalog (org user)')
    .addTag(
      'user-integration-endpoints',
      'Create/manage preconfigured CRM dial endpoints + API keys (org user)',
    )
    .addTag(
      'user-integrations',
      'Org third-party connections (Nylas calendar API key + grant) for agent tools',
    )
    .addTag(
      'internal-calendar',
      'Worker-only Nylas calendar proxy (X-Worker-Secret); used by calendar tools',
    )
    .addTag(
      'integrations',
      'Public thin enqueue via API key (phone + minimal context only)',
    )
    .addTag(
      'demo',
      'Marketing get-demo form → proxy to ENDPOINT_URL (integration dial)',
    )
    .addTag('sip-trunks', 'SIP trunk CRUD (admin)')
    .addTag('tool-profiles', 'Tool profile catalog (admin)')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Api-Key',
        in: 'header',
        description:
          'Integration endpoint secret (ca_live_…). Also accepts Authorization: Bearer <key>.',
      },
      'integrationApiKey',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    // Comma-separated origins, or reflect request origin when unset (dev-friendly).
    origin: corsOrigin
      ? corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : true,
    credentials: true,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API listening on http://0.0.0.0:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI at http://0.0.0.0:${port}/docs`);
}

void bootstrap();
