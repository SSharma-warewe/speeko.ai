import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { ToolProfileTool } from './tool-profile-tool.entity';

@Entity({ name: 'tool_profiles' })
@Index('idx_tool_profiles_organization_id', ['organizationId'])
export class ToolProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Stable slug (e.g. default, outbound, sales-lite).
   * Unique per scope is enforced in DB via partial unique indexes
   * (platform: key WHERE organization_id IS NULL;
   *  org: (organization_id, key) WHERE organization_id IS NOT NULL)
   * and again in ToolProfilesService.
   */
  @Column({ type: 'varchar', length: 80 })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Null = platform catalog seed; set = org-owned custom profile. */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @OneToMany(() => ToolProfileTool, (row) => row.profile, {
    cascade: true,
    eager: true,
  })
  tools!: ToolProfileTool[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
