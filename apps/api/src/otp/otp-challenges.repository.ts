import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { lockOtpPhone } from '../whatsapp-harness/otp-delivery.repository';
import { OtpChallenge } from './otp-challenge.entity';

@Injectable()
export class OtpChallengesRepository {
  constructor(
    @InjectRepository(OtpChallenge)
    private readonly repo: Repository<OtpChallenge>,
  ) {}

  async withLocked<T>(
    where: { id: string } | { verificationTokenHash: string },
    action: (
      row: OtpChallenge | null,
      save: (row: OtpChallenge) => Promise<OtpChallenge>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.repo.manager.transaction(async (manager) => {
      const initial = await manager.findOneBy(OtpChallenge, where);
      if (initial) await lockOtpPhone(manager, initial.phoneDigits);
      const row = initial ? await manager.findOneBy(OtpChallenge, where) : null;
      return action(row, (current) => manager.save(current));
    });
  }
}
