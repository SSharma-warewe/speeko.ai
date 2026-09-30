import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { PlatformWhatsAppConfig } from '../meta-whatsapp/platform-whatsapp.config';
import { OtpChallenge } from '../otp/otp-challenge.entity';
import { OTP_CODE_TTL_MS, generateOtpCode, hmacSha256 } from '../otp/otp-hash';
import { WhatsAppOutbox } from './whatsapp-outbox.entity';
import { OtpDeliveryRepository } from './otp-delivery.repository';
import { decryptOtp, encryptOtp, otpDeliveryKey } from './otp-delivery.crypto';

const SEND_FAILED =
  'Could not send the WhatsApp code. Please try again shortly.';
@Injectable()
export class OtpDeliveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly repository: OtpDeliveryRepository,
    private readonly platform: PlatformWhatsAppConfig,
    private readonly meta: MetaWhatsAppClient,
  ) {}
  isEnabled() {
    return ['true', '1'].includes(
      String(this.config.get('WHATSAPP_OTP_HARNESS_ENABLED') ?? 'false'),
    );
  }
  assertConfigured() {
    if (
      !['true', '1'].includes(
        String(this.config.get('WHATSAPP_HARNESS_ENABLED')),
      ) ||
      !this.platform.resolve() ||
      !this.config.get<string>('OTP_HASH_SECRET')?.trim()
    )
      throw new ServiceUnavailableException(
        'Phone verification is not configured. Please try again later.',
      );
    try {
      return otpDeliveryKey(
        this.config.get<string>('OTP_DELIVERY_ENCRYPTION_KEY')?.trim() ?? '',
      );
    } catch {
      throw new ServiceUnavailableException(
        'Phone verification is not configured. Please try again later.',
      );
    }
  }
  async issue(phoneDigits: string) {
    const key = this.assertConfigured();
    const source = this.platform.resolve()!;
    const code = generateOtpCode();
    const challenge = Object.assign(new OtpChallenge(), {
      id: randomUUID(),
      phoneDigits,
      codeHash: hmacSha256(
        this.config.get<string>('OTP_HASH_SECRET')!.trim(),
        code,
      ),
      expiresAt: new Date(Date.now() + OTP_CODE_TTL_MS),
      attemptCount: 0,
      consumedAt: null,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationUsedAt: null,
    });
    const delivery = Object.assign(new WhatsAppOutbox(), {
      id: randomUUID(),
      kind: 'otp_template',
      turnId: null,
      body: null,
      challengeId: challenge.id,
      phoneNumberId: source.phoneNumberId,
      graphVersion: source.graphVersion,
      templateName: this.platform.templateName(),
      encryptedCode: encryptOtp(code, key, challenge.id, challenge.expiresAt),
    });
    await this.repository.issue(challenge, delivery);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const current = await this.repository.status(challenge.id);
      if (current?.status === 'accepted') return { challengeId: challenge.id };
      if (
        !current ||
        ['failed', 'uncertain', 'cancelled'].includes(current.status)
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (await this.repository.cancel(challenge.id))
      return { challengeId: challenge.id };
    throw new BadGatewayException(SEND_FAILED);
  }
  async sendReserved(id: string) {
    await this.repository.withDelivery(
      id,
      async (outbox, challenge, manager) => {
        if (outbox.status !== 'sending') return;
        const source = this.platform.resolve();
        if (
          challenge.consumedAt ||
          challenge.expiresAt <= new Date() ||
          !source ||
          source.phoneNumberId !== outbox.phoneNumberId ||
          source.graphVersion !== outbox.graphVersion ||
          !outbox.encryptedCode
        ) {
          outbox.status = 'cancelled';
          outbox.errorCode = 'otp_expired_or_disabled';
        } else {
          let code: string;
          try {
            code = decryptOtp(
              outbox.encryptedCode,
              this.assertConfigured(),
              challenge.id,
              challenge.expiresAt,
            );
          } catch {
            outbox.status = 'failed';
            outbox.errorCode = 'otp_decryption_failed';
            code = '';
          }
          if (code) {
            const sent = await this.meta.sendTemplate({
              ...source,
              to: challenge.phoneDigits,
              templateName: outbox.templateName!,
              language: 'en',
              components: [
                { type: 'body', parameters: [{ type: 'text', text: code }] },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            });
            if (sent.ok) {
              outbox.status = 'accepted';
              outbox.wamid = sent.data.wamid;
              outbox.errorCode = null;
            } else if (sent.status === 429 && outbox.attemptCount < 3) {
              outbox.status = 'pending';
              outbox.nextAttemptAt = new Date(
                Date.now() + 1000 * 2 ** (outbox.attemptCount - 1),
              );
              outbox.errorCode = 'meta_rate_limited';
            } else {
              outbox.status =
                sent.status === 0 || sent.status >= 500
                  ? 'uncertain'
                  : 'failed';
              outbox.errorCode =
                outbox.status === 'uncertain'
                  ? 'send_outcome_unknown'
                  : `meta_http_${sent.status}`;
            }
          }
        }
        if (outbox.status !== 'pending') outbox.encryptedCode = null;
        if (outbox.status !== 'accepted' && outbox.status !== 'pending')
          challenge.consumedAt ??= new Date();
        await manager.save([challenge, outbox]);
      },
    );
  }
}
