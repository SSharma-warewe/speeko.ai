import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One WhatsApp OTP challenge for the public get-demo form.
 * The code and the later verification token are stored only as HMAC-SHA256 hashes.
 */
@Entity({ name: 'otp_challenges' })
@Index('idx_otp_challenges_phone_digits', ['phoneDigits'])
@Index('idx_otp_challenges_expires_at', ['expiresAt'])
export class OtpChallenge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Digits only (no +). Bound to the verification token. */
  @Column({ name: 'phone_digits', type: 'varchar', length: 20 })
  phoneDigits!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  /** Set when the code is burned (resend, lockout, successful verify, or failed send). */
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({
    name: 'verification_token_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    unique: true,
  })
  verificationTokenHash!: string | null;

  @Column({
    name: 'verification_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationExpiresAt!: Date | null;

  /** Set when POST /demo/request consumes the single-use proof. */
  @Column({ name: 'verification_used_at', type: 'timestamptz', nullable: true })
  verificationUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
