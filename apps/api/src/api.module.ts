import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AdminsModule } from './admins/admins.module';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './config/env.validation';
import { CallsModule } from './calls/calls.module';
import { DemoModule } from './demo/demo.module';
import { EmailModule } from './email/email.module';
import { GhlModule } from './ghl/ghl.module';
import { IntegrationEndpointsModule } from './integration-endpoints/integration-endpoints.module';
import { OrganizationIntegrationsModule } from './organization-integrations/organization-integrations.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PriceModule } from './price/price.module';
import { QueueModule } from './queue/queue.module';
import { SipDispatchRulesModule } from './sip-dispatch-rules/sip-dispatch-rules.module';
import { SipTrunksModule } from './sip-trunks/sip-trunks.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.getOrThrow<string>('DATABASE_USER'),
        password: config.getOrThrow<string>('DATABASE_PASSWORD'),
        database: config.getOrThrow<string>('DATABASE_NAME'),
        autoLoadEntities: true,
        // Dev convenience: entities define schema. Prefer migrations once schema stabilizes.
        synchronize: true,
      }),
    }),
    EmailModule,
    GhlModule,
    AdminsModule,
    OrganizationsModule,
    UsersModule,
    ToolsModule,
    AgentsModule,
    SipTrunksModule,
    SipDispatchRulesModule,
    CallsModule,
    PriceModule,
    QueueModule,
    IntegrationEndpointsModule,
    OrganizationIntegrationsModule,
    DemoModule,
    AuthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class ApiModule {}

