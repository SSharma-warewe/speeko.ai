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
import type { OtpDeliveryService } from '../../whatsapp-harness/otp-delivery.service';

const PEPPER = 'test-pepper-otp-secret';
const PHONE = '919876543210';
const CODE = '123456';

describe('OtpService', () => {
  let service: OtpService;
  let row: OtpChallenge;
  const delivery = { assertConfigured: jest.fn(), issue: jest.fn() };
  const challenges = { withLocked: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    row = Object.assign(new OtpChallenge(), {
      id: 'challenge',
      phoneDigits: PHONE,
      codeHash: hmacSha256(PEPPER, CODE),
      expiresAt: new Date(Date.now() + 300_000),
      attemptCount: 0,
      consumedAt: null,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationUsedAt: null,
    });
    challenges.withLocked.mockImplementation((where, action) => {
      const matches = where.id
        ? where.id === row.id
        : where.verificationTokenHash === row.verificationTokenHash;
      return action(
        matches ? row : null,
        async (current: OtpChallenge) => current,
      );
    });
    delivery.issue.mockResolvedValue({ challengeId: row.id });
    service = new OtpService(
      new ConfigService({ OTP_HASH_SECRET: PEPPER }),
      challenges as unknown as OtpChallengesRepository,
      delivery as unknown as OtpDeliveryService,
    );
  });

  it('issues through durable delivery with normalized digits and returns only the challenge id', async () => {
    await expect(service.send('+91 98765 43210')).resolves.toEqual({
      challengeId: row.id,
    });
    expect(delivery.issue).toHaveBeenCalledWith(PHONE);
    expect(challenges.withLocked).not.toHaveBeenCalled();
  });

  it('rejects invalid phone lengths before issuing', async () => {
    await expect(service.send('123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.send('1'.repeat(16))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(delivery.issue).not.toHaveBeenCalled();
  });

  it('propagates durable delivery failure without returning a challenge', async () => {
    delivery.issue.mockRejectedValue(
      new BadGatewayException('Could not send the WhatsApp code.'),
    );
    await expect(service.send(PHONE)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('returns 503 for send, verify, and proof consumption when OTP settings are incomplete', async () => {
    delivery.assertConfigured.mockImplementation(() => {
      throw new ServiceUnavailableException(
        'Phone verification is not configured. Please try again later.',
      );
    });
    await expect(service.send(PHONE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.verify(row.id, CODE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      service.consumeVerification('proof', PHONE),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(delivery.issue).not.toHaveBeenCalled();
    expect(challenges.withLocked).not.toHaveBeenCalled();
  });

  it('verifies a code and stores only the hash of the single-use proof', async () => {
    const verified = await service.verify(row.id, CODE);
    expect(verified.verificationToken).toBeTruthy();
    expect(verified.verificationToken).not.toBe(CODE);
    expect(row.verificationTokenHash).toBe(
      hmacSha256(PEPPER, verified.verificationToken),
    );
    expect(row.consumedAt).toBeInstanceOf(Date);
    await expect(service.verify(row.id, CODE)).rejects.toThrow(
      /incorrect or expired/i,
    );
  });

  it('rejects a wrong code without echoing it and burns the challenge after five attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verify(row.id, '000000')).rejects.toThrow(
        'That code is incorrect or expired.',
      );
    }
    expect(row.attemptCount).toBe(5);
    expect(row.consumedAt).toBeInstanceOf(Date);
    await expect(service.verify(row.id, CODE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(['expired', 'consumed', 'missing'] as const)(
    'rejects a %s challenge',
    async (state) => {
      if (state === 'expired') row.expiresAt = new Date(Date.now() - 1000);
      if (state === 'consumed') row.consumedAt = new Date();
      await expect(
        service.verify(state === 'missing' ? 'unknown' : row.id, CODE),
      ).rejects.toThrow(/incorrect or expired/i);
    },
  );

  it('consumes a proof once and only for the same phone', async () => {
    const { verificationToken } = await service.verify(row.id, CODE);
    await expect(
      service.consumeVerification(verificationToken, '15550102000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(row.verificationUsedAt).toBeNull();
    await service.consumeVerification(verificationToken, PHONE);
    expect(row.verificationUsedAt).toBeInstanceOf(Date);
    await expect(
      service.consumeVerification(verificationToken, PHONE),
    ).rejects.toThrow(/verify your phone/i);
  });

  it('rejects an expired verification proof', async () => {
    const { verificationToken } = await service.verify(row.id, CODE);
    row.verificationExpiresAt = new Date(Date.now() - 1000);
    await expect(
      service.consumeVerification(verificationToken, PHONE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(row.verificationUsedAt).toBeNull();
  });
});
