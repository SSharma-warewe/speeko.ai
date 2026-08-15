import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from '../admins/admin.entity';
import { User } from '../users/user.entity';

export enum PasswordTokenKind {
  USER = 'user',
  ADMIN = 'admin',
}

export enum PasswordTokenPurpose {
  INVITE = 'invite',
  RESET = 'reset',
}

@Entity({ name: 'password_reset_tokens' })
@Index('idx_password_reset_tokens_user_id', ['userId'])
@Index('idx_password_reset_tokens_admin_id', ['adminId'])
@Index('idx_password_reset_tokens_expires_at', ['expiresAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  kind!: PasswordTokenKind;

  @Column({ type: 'varchar', length: 20 })
  purpose!: PasswordTokenPurpose;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  adminId!: string | null;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin?: Admin | null;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
