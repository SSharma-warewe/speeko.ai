import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ToolProfile } from './tool-profile.entity';

@Entity({ name: 'tool_profile_tools' })
@Unique('uq_tool_profile_tools_profile_tool', ['profileId', 'toolId'])
@Index('idx_tool_profile_tools_profile_id', ['profileId'])
export class ToolProfileTool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId!: string;

  @ManyToOne(() => ToolProfile, (p) => p.tools, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile!: ToolProfile;

  /**
   * Worker ToolRegistry id (e.g. endCall, booking).
   * Not executable code — resolved only inside the worker.
   */
  @Column({ name: 'tool_id', type: 'varchar', length: 100 })
  toolId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
