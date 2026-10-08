import { Injectable } from '@nestjs/common';
import { type QueryRunner } from 'typeorm';
import {
  TTS_CACHE_LIMITS,
  type TtsCacheEnvelope,
  type TtsCachePublishResponse,
} from '@call-agent/contracts';
import { TtsCacheDatabase } from './tts-cache-database';
import { decodeEnvelope, encodeEnvelope } from './tts-cache-envelope';

export const TTS_CACHE_LOCK = [1936745835, 1414812483] as const;
export const TTS_SHARED_STORAGE_POLICY = {
  tenantBytes: 64 * 1024 * 1024,
  globalBytes: 1024 * 1024 * 1024,
  tenantEntries: 1024,
  globalEntries: 16384,
};
export type CacheStoragePolicy = typeof TTS_SHARED_STORAGE_POLICY;
type Scope = {
  organization_id: string;
  room_name: string;
  status: string;
  execution_type: string;
  org_active: boolean;
  org_agent_active: boolean;
  template_active: boolean;
  agent_org: string;
  org_cache_enabled: boolean | null;
  template_cache_enabled: boolean | null;
  org_model: string | null;
  template_model: string | null;
};

@Injectable()
export class TtsCacheRepository {
  constructor(private readonly database: TtsCacheDatabase) {}
  run<T>(write: boolean, action: (runner: QueryRunner) => Promise<T>) {
    return this.database.run(write, action);
  }
  get databaseStats() {
    return { ...this.database.stats };
  }
  storageStats() {
    return this.run(false, async (runner) => {
      const [row] = await runner.query(
        'SELECT COUNT(*)::int AS entries, COALESCE(SUM(accounted_bytes), 0)::bigint AS bytes FROM tts_cache_entries',
      );
      return { entries: row.entries as number, bytes: Number(row.bytes) };
    });
  }
  async scope(runner: QueryRunner, callId: string): Promise<Scope | undefined> {
    const [scope] = await runner.query(
      `SELECT c.organization_id, c.room_name, c.status, c.execution_type,
      o.is_active AS org_active, oa.is_active AS org_agent_active, a.is_active AS template_active, oa.organization_id AS agent_org,
      oa.tts_cache_enabled AS org_cache_enabled, a.tts_cache_enabled AS template_cache_enabled,
      oa.model AS org_model, a.model AS template_model
      FROM calls c LEFT JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN organization_agents oa ON oa.id = c.organization_agent_id
      LEFT JOIN agents a ON a.id = oa.agent_id WHERE c.id = $1`,
      [callId],
    );
    return scope;
  }
  async lookup(runner: QueryRunner, organizationId: string, digest: string) {
    const [row] = await runner.query(
      `SELECT pcm, metadata, checksum, expires_at FROM tts_cache_entries
      WHERE organization_id = $1 AND digest = $2 AND expires_at > clock_timestamp()`,
      [organizationId, digest],
    );
    if (!row) return;
    try {
      return {
        envelope: encodeEnvelope(row.metadata, row.pcm, row.checksum),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    } catch {
      return;
    } // Corrupt entries are disposable, never sent to playback.
  }
  async lock(runner: QueryRunner) {
    const [row] = await runner.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
      [...TTS_CACHE_LOCK],
    );
    return row.acquired === true;
  }
  async publish(
    runner: QueryRunner,
    organizationId: string,
    digest: string,
    envelope: TtsCacheEnvelope,
    policy: CacheStoragePolicy = TTS_SHARED_STORAGE_POLICY,
  ): Promise<TtsCachePublishResponse> {
    const clip = decodeEnvelope(envelope);
    if (
      clip.bytes > policy.tenantBytes ||
      clip.bytes > policy.globalBytes ||
      !(await this.lock(runner))
    )
      return { result: 'skipped' };
    const [existing] = await runner.query(
      `SELECT id FROM tts_cache_entries WHERE organization_id = $1 AND digest = $2 AND expires_at > clock_timestamp()`,
      [organizationId, digest],
    );
    if (existing) return { result: 'already_present' };
    // Remove bounded expired batches. Remaining expired entries still count towards budgets.
    await this.deleteExpired(runner);
    await runner.query(
      'DELETE FROM tts_cache_entries WHERE organization_id = $1 AND digest = $2',
      [organizationId, digest],
    );
    const rows: Array<{
      id: string;
      organization_id: string;
      accounted_bytes: number;
    }> = await runner.query(
      'SELECT id, organization_id, accounted_bytes FROM tts_cache_entries ORDER BY created_at, id',
    );
    let totalBytes = 0,
      tenantBytes = 0,
      totalCount = rows.length,
      tenantCount = 0;
    for (const row of rows) {
      totalBytes += row.accounted_bytes;
      if (row.organization_id === organizationId) {
        tenantBytes += row.accounted_bytes;
        tenantCount++;
      }
    }
    const evicted = new Set<string>();
    const evict = (row: (typeof rows)[number]) => {
      evicted.add(row.id);
      totalBytes -= row.accounted_bytes;
      totalCount--;
      if (row.organization_id === organizationId) {
        tenantBytes -= row.accounted_bytes;
        tenantCount--;
      }
    };
    for (const row of rows) {
      if (
        tenantBytes + clip.bytes <= policy.tenantBytes &&
        tenantCount < policy.tenantEntries
      )
        break;
      if (row.organization_id === organizationId) evict(row);
    }
    for (const row of rows) {
      if (
        totalBytes + clip.bytes <= policy.globalBytes &&
        totalCount < policy.globalEntries
      )
        break;
      if (!evicted.has(row.id)) evict(row);
    }
    if (evicted.size)
      await runner.query(
        'DELETE FROM tts_cache_entries WHERE id = ANY($1::uuid[])',
        [[...evicted]],
      );
    await runner.query(
      `INSERT INTO tts_cache_entries (organization_id, digest, envelope_revision, pcm, metadata, checksum, accounted_bytes, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp() + ($8 * interval '1 millisecond'))
      ON CONFLICT (organization_id, digest) DO NOTHING`,
      [
        organizationId,
        digest,
        clip.metadata.revision,
        clip.pcm,
        clip.metadata,
        clip.checksum,
        clip.bytes,
        TTS_CACHE_LIMITS.ttlMs,
      ],
    );
    return { result: 'stored' };
  }
  private deleteExpired(runner: QueryRunner) {
    return runner.query(`DELETE FROM tts_cache_entries WHERE id IN
      (SELECT id FROM tts_cache_entries WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT 500)`);
  }
  cleanup() {
    return this.run(true, async (runner) => {
      if (await this.lock(runner)) await this.deleteExpired(runner);
      return true;
    });
  }
}
