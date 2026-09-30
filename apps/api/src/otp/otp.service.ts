import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { demoPhoneDigits } from '../demo/demo-form.constants';
import { OtpChallenge } from './otp-challenge.entity';
import { OtpChallengesRepository } from './otp-challenges.repository';
import { OtpDeliveryService } from '../whatsapp-harness/otp-delivery.service';
import {
  OTP_CODE_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_VERIFICATION_TTL_MS,
  generateOtpCode,
  generateVerificationToken,
  hashesEqual,
  hmacSha256,
} from './otp-hash';
import {
  WHATSAPP_OTP_NOT_CONFIGURED,
  WhatsappOtpClient,
} from './whatsapp-otp.client';

const VERIFY_FAILED = 'That code is incorrect or expired.';
const DEMO_NOT_VERIFIED = 'Verify your phone number before requesting a demo.';

@Injectable()
export class OtpService {
  constructor(
    private readonly config: ConfigService,
    private readonly challenges: OtpChallengesRepository,
    private readonly whatsapp: WhatsappOtpClient,
    private readonly delivery: OtpDeliveryService,
  ) {}

  /**
   * Issue a code over WhatsApp. The response is only the challenge id.
   */
  async send(phone: string): Promise<{ challengeId: string }> {
    this.assertConfigured();
    const phoneDigits = demoPhoneDigits(phone);
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      throw new BadRequestException('Enter a valid phone number.');
    }
    if (this.delivery.isEnabled()) return this.delivery.issue(phoneDigits);

    const code = generateOtpCode();
    const now = new Date();
    await this.challenges.invalidateOpenForPhone(phoneDigits, now);

    const row = await this.challenges.save(
      this.challenges.create({
        phoneDigits,
        codeHash: hmacSha256(this.pepper(), code),
        expiresAt: new Date(now.getTime() + OTP_CODE_TTL_MS),
        attemptCount: 0,
        consumedAt: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        verificationUsedAt: null,
      }),
    );

    try {
      await this.whatsapp.send(phoneDigits, code);
    } catch (err) {
      row.consumedAt = new Date();
      await this.challenges.save(row);
      throw err;
    }

    return { challengeId: row.id };
  }

  /**
   * Check the code. On success, return a single-use proof. Never echo the code.
   */
  async verify(
    challengeId: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    this.assertConfigured();
    const pepper = this.pepper();
    const result = await this.challenges.withLocked(
      { id: challengeId },
      async (row, save) => {
        const provided = hmacSha256(pepper, code.trim());
        const expected = row?.codeHash ?? hmacSha256(pepper, '000000');
        const matches =
          hashesEqual(expected, provided) && this.codeStillOpen(row);

        if (!row || !matches) {
          if (row && this.codeStillOpen(row)) {
            row.attemptCount += 1;
            if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
              row.consumedAt = new Date();
            }
            await save(row);
          }
          return null;
        }

        const token = generateVerificationToken();
        row.attemptCount += 1;
        row.consumedAt = new Date();
        row.verificationTokenHash = hmacSha256(pepper, token);
        row.verificationExpiresAt = new Date(
          Date.now() + OTP_VERIFICATION_TTL_MS,
        );
        row.verificationUsedAt = null;
        await save(row);
        return { verificationToken: token };
      },
    );
    if (!result) throw new BadRequestException(VERIFY_FAILED);
    return result;
  }

  /**
   * Single-use proof for POST /demo/request. Phone digits must match the challenge.
   */
  async consumeVerification(token: string, phoneDigits: string): Promise<void> {
    this.assertConfigured();
    const hash = hmacSha256(this.pepper(), token.trim());
    const consumed = await this.challenges.withLocked(
      { verificationTokenHash: hash },
      async (row, save) => {
        const now = Date.now();
        const open =
          row !== null &&
          row.verificationUsedAt === null &&
          row.verificationExpiresAt !== null &&
          row.verificationExpiresAt.getTime() > now &&
          row.phoneDigits === phoneDigits;

        if (!row || !open) {
          return false;
        }

        row.verificationUsedAt = new Date();
        await save(row);
        return true;
      },
    );
    if (!consumed) throw new BadRequestException(DEMO_NOT_VERIFIED);
  }

  private codeStillOpen(row: OtpChallenge | null): row is OtpChallenge {
    if (!row || row.consumedAt) {
      return false;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return false;
    }
    if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
      return false;
    }
    if (row.verificationTokenHash) {
      return false;
    }
    return true;
  }

  private assertConfigured(): void {
    const pepper = this.config.get<string>('OTP_HASH_SECRET')?.trim() ?? '';
    if (this.delivery.isEnabled()) {
      this.delivery.assertConfigured();
      return;
    }
    if (!pepper || !this.whatsapp.isConfigured()) {
      throw new ServiceUnavailableException(WHATSAPP_OTP_NOT_CONFIGURED);
    }
  }

  private pepper(): string {
    return this.config.get<string>('OTP_HASH_SECRET')?.trim() ?? '';
  }
}
