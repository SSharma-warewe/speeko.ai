import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import { OtpChallenge } from './otp-challenge.entity';

@Injectable()
export class OtpChallengesRepository {
  constructor(
    @InjectRepository(OtpChallenge)
    private readonly repo: Repository<OtpChallenge>,
  ) {}

  create(data: DeepPartial<OtpChallenge>): OtpChallenge {
    return this.repo.create(data);
  }

  save(row: OtpChallenge): Promise<OtpChallenge> {
    return this.repo.save(row);
  }

  findById(id: string): Promise<OtpChallenge | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByVerificationTokenHash(hash: string): Promise<OtpChallenge | null> {
    return this.repo.findOne({ where: { verificationTokenHash: hash } });
  }

  /** Burn unused codes for this phone so only the newest send can succeed. */
  async invalidateOpenForPhone(phoneDigits: string, now: Date): Promise<void> {
    await this.repo.update(
      { phoneDigits, consumedAt: IsNull() },
      { consumedAt: now },
    );
  }
}
