import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { OtpChallenge } from '../otp/otp-challenge.entity';
import { WhatsAppOutbox } from './whatsapp-outbox.entity';

export async function lockOtpPhone(manager: EntityManager, phone: string) {
  await manager.query(
    `SELECT pg_advisory_xact_lock(hashtext('otp_phone'), hashtext($1))`,
    [phone],
  );
}

@Injectable()
export class OtpDeliveryRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async issue(challenge: OtpChallenge, delivery: WhatsAppOutbox) {
    return this.db.transaction(async (manager) => {
      await lockOtpPhone(manager, challenge.phoneDigits);
      await manager.update(
        OtpChallenge,
        { phoneDigits: challenge.phoneDigits, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      await manager.query(
        `UPDATE whatsapp_message_outbox o SET status='cancelled', encrypted_code=NULL, error_code='otp_superseded' FROM otp_challenges c WHERE o.challenge_id=c.id AND c.phone_digits=$1 AND o.status IN ('pending','sending')`,
        [challenge.phoneDigits],
      );
      await manager.save(challenge);
      await manager.save(delivery);
      return challenge.id;
    });
  }

  status(challengeId: string) {
    return this.db
      .getRepository(WhatsAppOutbox)
      .findOneBy({ challengeId, kind: 'otp_template' });
  }

  async withDelivery<T>(
    id: string,
    action: (
      outbox: WhatsAppOutbox,
      challenge: OtpChallenge,
      manager: EntityManager,
    ) => Promise<T>,
  ) {
    return this.db.transaction(async (manager) => {
      const initial = await manager.findOneBy(WhatsAppOutbox, {
        id,
        kind: 'otp_template',
      });
      if (!initial?.challengeId) return null;
      const challenge = await manager.findOneByOrFail(OtpChallenge, {
        id: initial.challengeId,
      });
      await lockOtpPhone(manager, challenge.phoneDigits);
      const current = await manager.findOneByOrFail(OtpChallenge, {
        id: challenge.id,
      });
      const outbox = await manager
        .createQueryBuilder(WhatsAppOutbox, 'o')
        .addSelect('o.encryptedCode')
        .where('o.id = :id', { id })
        .setLock('pessimistic_write')
        .getOneOrFail();
      return action(outbox, current, manager);
    });
  }

  async cancel(challengeId: string) {
    const row = await this.status(challengeId);
    if (!row) return false;
    return this.withDelivery(row.id, async (outbox, challenge, manager) => {
      if (
        outbox.status === 'accepted' &&
        !challenge.consumedAt &&
        challenge.expiresAt > new Date()
      )
        return true;
      if (outbox.status === 'pending') outbox.status = 'cancelled';
      else if (outbox.status === 'sending') outbox.status = 'uncertain';
      outbox.encryptedCode = null;
      outbox.errorCode ??= 'otp_delivery_timeout';
      challenge.consumedAt ??= new Date();
      await manager.save([challenge, outbox]);
      return false;
    });
  }

  async reap() {
    const rows: Array<{ id: string }> = await this.db.query(
      `SELECT o.id FROM whatsapp_message_outbox o JOIN otp_challenges c ON c.id=o.challenge_id WHERE o.kind='otp_template' AND (o.encrypted_code IS NOT NULL OR o.status IN ('pending','sending')) AND (c.consumed_at IS NOT NULL OR c.expires_at<=NOW() OR (o.status='sending' AND o.send_started_at<NOW()-INTERVAL '60 seconds') OR o.status IN ('accepted','uncertain','failed','cancelled')) LIMIT 100`,
    );
    for (const row of rows)
      await this.withDelivery(row.id, async (outbox, challenge, manager) => {
        if (
          outbox.status === 'sending' &&
          outbox.sendStartedAt &&
          outbox.sendStartedAt.getTime() < Date.now() - 60_000
        ) {
          outbox.status = 'uncertain';
          outbox.errorCode = 'send_outcome_unknown';
          challenge.consumedAt ??= new Date();
        } else if (
          outbox.status === 'pending' &&
          (challenge.consumedAt || challenge.expiresAt <= new Date())
        ) {
          outbox.status = 'cancelled';
          outbox.errorCode = 'otp_expired_or_consumed';
        }
        if (
          ['accepted', 'uncertain', 'failed', 'cancelled'].includes(
            outbox.status,
          ) ||
          challenge.expiresAt <= new Date() ||
          challenge.consumedAt
        )
          outbox.encryptedCode = null;
        await manager.save([challenge, outbox]);
      });
  }

  diagnostics() {
    return this.db
      .getRepository(WhatsAppOutbox)
      .find({
        where: { kind: 'otp_template' },
        select: [
          'id',
          'challengeId',
          'status',
          'attemptCount',
          'nextAttemptAt',
          'sendStartedAt',
          'wamid',
          'errorCode',
          'createdAt',
          'updatedAt',
        ],
        order: { createdAt: 'DESC' },
        take: 100,
      });
  }
}
