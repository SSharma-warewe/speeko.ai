import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { InternalTtsCacheController } from './internal-tts-cache.controller';
import { TtsCacheDatabase } from './tts-cache-database';
import { TtsCacheEntry } from './tts-cache-entry.entity';
import { TtsCacheRepository } from './tts-cache.repository';
import { TtsCacheService } from './tts-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([TtsCacheEntry])],
  controllers: [InternalTtsCacheController],
  providers: [
    WorkerSecretGuard,
    TtsCacheDatabase,
    TtsCacheRepository,
    TtsCacheService,
  ],
})
export class TtsCacheModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        (
          _req: unknown,
          res: { setHeader: (name: string, value: string) => void },
          next: () => void,
        ) => {
          res.setHeader('Cache-Control', 'no-store');
          next();
        },
      )
      .forRoutes(InternalTtsCacheController);
  }
}
