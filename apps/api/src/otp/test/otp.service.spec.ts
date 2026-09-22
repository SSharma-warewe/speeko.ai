import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChallenge } from '../otp-challenge.entity';
import { OtpChallengesRepository } from '../otp-challenges.repository';
import { hmacSha256 } from '../otp-hash';
import { OtpService } from '../otp.service';
import { WhatsappOtpClient } from '../whatsapp-otp.client';

const PEPPER = 'test-pepper-otp-secret';

class MemoryChallenges {
  rows: OtpChallenge[] = [];

  create(data: Partial<OtpChallenge>): OtpChallenge {
    return {
      id: '',
      phoneDigits: '',
      codeHash: '',
      expiresAt: new Date(),
      attemptCount: 0,
      consumedAt: null,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationUsedAt: null,
      createdAt: new Date(),
      ...data,
    } as OtpChallenge;
  }

  async save(row: OtpChallenge): Promise<OtpChallenge> {
    if (!row.id) {
      row.id = `ch-${this.rows.length + 1}`;
    }
    const index = this.rows.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      this.rows[index] = row;
    } else {
      this.rows.push(row);
    }
    return row;
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findByVerificationTokenHash(hash: string): Promise<OtpChallenge | null> {
    return this.rows.find((row) => row.verificationTokenHash === hash) ?? null;
  }

  async invalidateOpenForPhone(phoneDigits: string, now: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.phoneDigits === phoneDigits && !row.consumedAt) {
        row.consumedAt = now;
      }
    }
  }
}

describe('OtpService', () => {
  let challenges: MemoryChallenges;
  let sendWhatsapp: jest.Mock;
  let service: OtpService;
  let pepper: string | undefined;
  let configured: boolean;

  function makeService(): OtpService {
    challenges = new MemoryChallenges();
    sendWhatsapp = jest.fn().mockResolvedValue(undefined);
    return new OtpService(
      {
        get: (key: string) => (key === 'OTP_HASH_SECRET' ? pepper : undefined),
      } as unknown as ConfigService,
      challenges as unknown as OtpChallengesRepository,
      {
        isConfigured: () => configured,
        send: sendWhatsapp,
      } as unknown as WhatsappOtpClient,
    );
  }

  beforeEach(() => {
    pepper = PEPPER;
    configured = true;
    service = makeService();
  });

  it('returns a challenge id and never the code', async () => {
    const result = await service.send('+91 98765 43210');

    expect(result).toEqual({ challengeId: 'ch-1' });
    expect(sendWhatsapp).toHaveBeenCalledTimes(1);
    const [to, code] = sendWhatsapp.mock.calls[0] as [string, string];
    expect(to).toBe('919876543210');
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(result)).not.toContain(code);
    expect(challenges.rows[0].codeHash).toBe(hmacSha256(PEPPER, code));
    expect(challenges.rows[0].codeHash).not.toBe(code);
  });

  it('burns the challenge when WhatsApp send fails and does not leak the code', async () => {
    sendWhatsapp.mockRejectedValue(
      new BadGatewayException(
        'Could not send the WhatsApp code. Please try again shortly.',
      ),
    );

    await expect(service.send('+919876543210')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    try {
      await service.send('+919876543210');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/\d{6}/);
    }
    expect(challenges.rows.every((row) => row.consumedAt)).toBe(true);
  });

  it('returns 503 before sending when pepper or WhatsApp config is missing', async () => {
    pepper = '';
    service = makeService();
    await expect(service.send('+919876543210')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    pepper = PEPPER;
    configured = false;
    service = makeService();
    await expect(service.send('+919876543210')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it('verifies the latest code and returns a token that is not the code', async () => {
    await service.send('+919876543210');
    const code = sendWhatsapp.mock.calls[0][1] as string;

    const verified = await service.verify('ch-1', code);

    expect(verified.verificationToken).toBeTruthy();
    expect(verified.verificationToken).not.toBe(code);
    expect(challenges.rows[0].verificationTokenHash).toBe(
      hmacSha256(PEPPER, verified.verificationToken),
    );
    expect(challenges.rows[0].consumedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(verified)).not.toContain(code);
  });

  it('rejects a wrong code without echoing it, and locks after 5 attempts', async () => {
    await service.send('+919876543210');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(service.verify('ch-1', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    expect(challenges.rows[0].attemptCount).toBe(5);
    expect(challenges.rows[0].consumedAt).toBeInstanceOf(Date);

    const realCode = sendWhatsapp.mock.calls[0][1] as string;
    await expect(service.verify('ch-1', realCode)).rejects.toThrow(
      /incorrect or expired/i,
    );
  });

  it('rejects an expired code', async () => {
    await service.send('+919876543210');
    challenges.rows[0].expiresAt = new Date(Date.now() - 1000);
    const code = sendWhatsapp.mock.calls[0][1] as string;

    await expect(service.verify('ch-1', code)).rejects.toThrow(
      /incorrect or expired/i,
    );
  });

  it('invalidates the previous code when a new one is sent', async () => {
    await service.send('+919876543210');
    const first = sendWhatsapp.mock.calls[0][1] as string;
    await service.send('+919876543210');
    const second = sendWhatsapp.mock.calls[1][1] as string;

    await expect(service.verify('ch-1', first)).rejects.toThrow(
      /incorrect or expired/i,
    );
    await expect(service.verify('ch-2', second)).resolves.toEqual({
      verificationToken: expect.any(String),
    });
  });

  it('consumes a verification token once and only for the same phone', async () => {
    await service.send('+919876543210');
    const code = sendWhatsapp.mock.calls[0][1] as string;
    const { verificationToken } = await service.verify('ch-1', code);

    await expect(
      service.consumeVerification(verificationToken, '15550102000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(challenges.rows[0].verificationUsedAt).toBeNull();

    await service.consumeVerification(verificationToken, '919876543210');
    expect(challenges.rows[0].verificationUsedAt).toBeInstanceOf(Date);

    await expect(
      service.consumeVerification(verificationToken, '919876543210'),
    ).rejects.toThrow(/verify your phone/i);
  });
});
