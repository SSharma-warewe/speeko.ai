import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TtsCacheMetadata } from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';

@Entity({ name: 'tts_cache_entries' })
@Index('uq_tts_cache_org_digest', ['organizationId', 'digest'], {
  unique: true,
})
@Index('idx_tts_cache_expiry', ['expiresAt'])
@Index('idx_tts_cache_created', ['createdAt', 'id'])
@Index('idx_tts_cache_org_created', ['organizationId', 'createdAt', 'id'])
@Check(
  'ck_tts_cache_bytes',
  'accounted_bytes >= octet_length(pcm) AND accounted_bytes <= 1048576 AND octet_length(pcm) > 0',
)
@Check('ck_tts_cache_revision', 'envelope_revision = 1')
@Check(
  'ck_tts_cache_hashes',
  "digest ~ '^[a-f0-9]{64}$' AND checksum ~ '^[a-f0-9]{64}$'",
)
export class TtsCacheEntry {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ type: 'varchar', length: 64 }) digest!: string;
  @Column({ name: 'envelope_revision', type: 'integer' })
  envelopeRevision!: number;
  @Column({ type: 'bytea', select: false }) pcm!: Buffer;
  @Column({ type: 'jsonb', select: false }) metadata!: TtsCacheMetadata;
  @Column({ type: 'varchar', length: 64 }) checksum!: string;
  @Column({ name: 'accounted_bytes', type: 'integer' }) accountedBytes!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
}
