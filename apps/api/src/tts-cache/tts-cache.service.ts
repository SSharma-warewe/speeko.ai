import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { QueryRunner } from 'typeorm';
import {
  TTS_CACHE_LIMITS,
  TTS_CACHE_NAMESPACE,
  resolveTtsCacheEnabled,
  type TtsCacheLookupRequest,
  type TtsCacheLookupResponse,
  type TtsCachePublishRequest,
  type TtsCachePublishResponse,
} from '@call-agent/contracts';
import { TtsCacheRepository } from './tts-cache.repository';
import { decodeEnvelope } from './tts-cache-envelope';

@Injectable()
export class TtsCacheService {
  private readonly logger = new Logger(TtsCacheService.name);
  readonly stats = { hits: 0, misses: 0, stored: 0, skipped: 0, denied: 0 };
  constructor(
    private readonly repository: TtsCacheRepository,
    private readonly config: ConfigService,
  ) {}
  private async execute<T>(
    callId: string,
    dto: TtsCacheLookupRequest,
    write: boolean,
    action: (
      runner: QueryRunner,
      organizationId: string,
    ) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    if (
      dto.namespace !== TTS_CACHE_NAMESPACE ||
      !/^[a-f0-9]{64}$/.test(dto.digest) ||
      (dto.purpose !== undefined &&
        !['automatic', 'prepared'].includes(dto.purpose))
    )
      throw new BadRequestException('Invalid TTS cache request');
    // Authorization errors are returned outside the fail-open database wrapper.
    const result = await this.repository.run(write, async (runner) => {
      const scope = await this.repository.scope(runner, callId);
      if (!scope) return { denial: 404 as const };
      const enabled = this.config.get<boolean | string>(
        'TTS_SHARED_CACHE_ENABLED',
      );
      const allowed = (
        this.config.get<string>('TTS_SHARED_CACHE_ORGANIZATION_IDS') ?? ''
      )
        .split(',')
        .map((s) => s.trim().toLowerCase());
      if (
        (enabled !== true && enabled !== 'true') ||
        !allowed.includes(scope.organization_id) ||
        !scope.organization_id ||
        scope.room_name !== dto.roomName ||
        scope.execution_type !== 'agent' ||
        !['creating', 'dialing', 'ready'].includes(scope.status) ||
        !scope.org_active ||
        !scope.org_agent_active ||
        !scope.template_active ||
        !resolveTtsCacheEnabled(
          dto.purpose === 'prepared'
            ? scope.org_prepared_enabled
            : scope.org_cache_enabled,
          (dto.purpose === 'prepared'
            ? scope.template_prepared_enabled
            : scope.template_cache_enabled) === true,
          scope.org_model ?? scope.template_model,
        ) ||
        scope.agent_org !== scope.organization_id
      )
        return { denial: 403 as const };
      return { value: await action(runner, scope.organization_id) };
    });
    if (result && 'denial' in result) {
      this.stats.denied++;
      if (result.denial === 404) throw new NotFoundException('Call not found');
      throw new ForbiddenException(
        'Shared TTS cache is unavailable for this call',
      );
    }
    return result && 'value' in result ? result.value : undefined;
  }
  async lookup(
    callId: string,
    dto: TtsCacheLookupRequest,
  ): Promise<TtsCacheLookupResponse> {
    const hit = await this.execute<{
      envelope: TtsCachePublishRequest['envelope'];
      expiresAt: string;
    }>(callId, dto, false, (runner, organizationId) =>
      this.repository.lookup(runner, organizationId, dto.digest),
    );
    if (hit) {
      this.stats.hits++;
      return { hit: true, ...hit };
    }
    this.stats.misses++;
    return { hit: false };
  }
  async publish(
    callId: string,
    dto: TtsCachePublishRequest,
  ): Promise<TtsCachePublishResponse> {
    try {
      if (
        Buffer.byteLength(JSON.stringify(dto)) > TTS_CACHE_LIMITS.maxWireBytes
      )
        throw new Error('Oversized cache request');
      decodeEnvelope(dto.envelope);
    } catch {
      throw new BadRequestException('Invalid TTS cache envelope');
    }
    const result = await this.execute<TtsCachePublishResponse>(
      callId,
      dto,
      true,
      (runner, organizationId) =>
        this.repository.publish(
          runner,
          organizationId,
          dto.digest,
          dto.envelope,
        ),
    );
    if (result?.result === 'stored') this.stats.stored++;
    if (!result || result.result === 'skipped') this.stats.skipped++;
    return result ?? { result: 'skipped' };
  }
  @Interval(60_000)
  async cleanup() {
    await this.repository.cleanup();
    const storage = await this.repository.storageStats();
    this.logger.log(
      JSON.stringify({
        ...this.stats,
        storage: storage ?? null,
        database: this.repository.databaseStats,
      }),
    );
  }
}
