import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformWhatsAppConfig } from '../../meta-whatsapp/platform-whatsapp.config';
import { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';
import { OtpChallenge } from '../../otp/otp-challenge.entity';
import { hmacSha256 } from '../../otp/otp-hash';
import { OtpDeliveryRepository } from '../otp-delivery.repository';
import { OtpDeliveryService } from '../otp-delivery.service';
import { decryptOtp, encryptOtp, otpDeliveryKey } from '../otp-delivery.crypto';
import { WhatsAppOutbox } from '../whatsapp-outbox.entity';

const KEY = 'ab'.repeat(32);
describe('OTP harness delivery', () => {
  let service: OtpDeliveryService;
  let challenge: OtpChallenge;
  let outbox: WhatsAppOutbox;
  let config: ConfigService;
  const manager = { save: jest.fn() };
  const meta = { sendTemplate: jest.fn() };
  const repository = {
    issue: jest.fn(),
    status: jest.fn(),
    cancel: jest.fn(),
    withDelivery: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    config = new ConfigService({
      OTP_HASH_SECRET: 'pepper-secret-for-tests',
      OTP_DELIVERY_ENCRYPTION_KEY: KEY,
      WHATSAPP_API_KEY: 'platform-token',
      WHATSAPP_URL: 'https://graph.facebook.com/v22.0/12345678/messages',
    });
    service = new OtpDeliveryService(
      config,
      repository as unknown as OtpDeliveryRepository,
      new PlatformWhatsAppConfig(config),
      meta as unknown as MetaWhatsAppClient,
    );
    challenge = Object.assign(new OtpChallenge(), {
      id: 'challenge',
      phoneDigits: '919876543210',
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });
    outbox = Object.assign(new WhatsAppOutbox(), {
      id: 'delivery',
      kind: 'otp_template',
      challengeId: challenge.id,
      phoneNumberId: '12345678',
      graphVersion: 'v22.0',
      templateName: 'speeko_ai',
      status: 'sending',
      attemptCount: 1,
      encryptedCode: encryptOtp(
        '123456',
        otpDeliveryKey(KEY),
        challenge.id,
        challenge.expiresAt,
      ),
    });
    repository.withDelivery.mockImplementation((_id, action) =>
      action(outbox, challenge, manager),
    );
    meta.sendTemplate.mockResolvedValue({
      ok: true,
      data: { wamid: 'wamid.test' },
    });
  });
  afterEach(() => jest.useRealTimers());

  it('reports readiness with complete optional settings and no rollout switches', () => {
    expect(service.isConfigured()).toBe(true);
    expect(service.assertConfigured()).toEqual(otpDeliveryKey(KEY));
  });
  it.each([
    'WHATSAPP_URL',
    'WHATSAPP_API_KEY',
    'OTP_HASH_SECRET',
    'OTP_DELIVERY_ENCRYPTION_KEY',
  ])('keeps OTP unavailable without %s', async (key) => {
    config.set(key, '');
    expect(service.isConfigured()).toBe(false);
    await expect(service.issue(challenge.phoneDigits)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.issue).not.toHaveBeenCalled();
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });
  it('keeps OTP unavailable with a malformed encryption key', () => {
    config.set('OTP_DELIVERY_ENCRYPTION_KEY', 'invalid');
    expect(service.isConfigured()).toBe(false);
    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('binds authenticated encryption to challenge and expiry; rejects tampering and invalid keys', () => {
    const key = otpDeliveryKey(KEY);
    expect(
      decryptOtp(outbox.encryptedCode!, key, challenge.id, challenge.expiresAt),
    ).toBe('123456');
    expect(() =>
      decryptOtp(outbox.encryptedCode!, key, 'other', challenge.expiresAt),
    ).toThrow();
    expect(() =>
      decryptOtp(outbox.encryptedCode!, key, challenge.id, new Date(0)),
    ).toThrow();
    expect(() =>
      decryptOtp(
        outbox.encryptedCode!,
        otpDeliveryKey('cd'.repeat(32)),
        challenge.id,
        challenge.expiresAt,
      ),
    ).toThrow();
    expect(() => otpDeliveryKey('short')).toThrow();
  });
  it('persists only HMAC and ciphertext, returns only challenge id after acceptance', async () => {
    repository.status.mockResolvedValue({ status: 'accepted' });
    const result = await service.issue(challenge.phoneDigits);
    const [row, delivery] = repository.issue.mock.calls[0] as [
      OtpChallenge,
      WhatsAppOutbox,
    ];
    const code = decryptOtp(
      delivery.encryptedCode!,
      otpDeliveryKey(KEY),
      row.id,
      row.expiresAt,
    );
    expect(row.codeHash).toBe(hmacSha256('pepper-secret-for-tests', code));
    expect(delivery.turnId).toBeNull();
    expect(delivery.body).toBeNull();
    expect(JSON.stringify([row, delivery, result])).not.toContain(code);
    expect(result).toEqual({ challengeId: row.id });
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });
  it('sends the original template parameters and configured Graph version, then clears ciphertext', async () => {
    await service.sendReserved(outbox.id);
    expect(meta.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'platform-token',
        phoneNumberId: '12345678',
        graphVersion: 'v22.0',
        language: 'en',
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '123456' }],
          },
        ],
      }),
    );
    expect(outbox.status).toBe('accepted');
    expect(outbox.encryptedCode).toBeNull();
    expect(challenge.consumedAt).toBeNull();
  });
  it.each([0, 500, 503, 400, 302])(
    'burns codes and does not retry status %s',
    async (status) => {
      meta.sendTemplate.mockResolvedValue({
        ok: false,
        status,
        message: 'provider body must not be stored',
      });
      await service.sendReserved(outbox.id);
      expect(outbox.status).toBe(
        status === 0 || status >= 500 ? 'uncertain' : 'failed',
      );
      expect(outbox.encryptedCode).toBeNull();
      expect(challenge.consumedAt).toBeInstanceOf(Date);
      expect(outbox.errorCode).not.toContain('provider');
    },
  );
  it.each([1, 2])(
    'keeps encrypted code only for definite rate-limit retry attempt %s',
    async (attempt) => {
      outbox.attemptCount = attempt;
      meta.sendTemplate.mockResolvedValue({ ok: false, status: 429 });
      const before = Date.now();
      await service.sendReserved(outbox.id);
      expect(outbox.status).toBe('pending');
      expect(outbox.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
        before + 1000 * 2 ** (attempt - 1),
      );
      expect(outbox.encryptedCode).toBeTruthy();
      expect(challenge.consumedAt).toBeNull();
    },
  );
  it('burns the code after three rate-limit rejections', async () => {
    outbox.attemptCount = 3;
    meta.sendTemplate.mockResolvedValue({ ok: false, status: 429 });
    await service.sendReserved(outbox.id);
    expect(outbox.status).toBe('failed');
    expect(outbox.encryptedCode).toBeNull();
  });
  it.each(['expired', 'consumed', 'changed_number', 'invalid_cipher'])(
    'never sends an %s challenge',
    async (reason) => {
      if (reason === 'expired') challenge.expiresAt = new Date(0);
      if (reason === 'consumed') challenge.consumedAt = new Date();
      if (reason === 'changed_number') outbox.phoneNumberId = '99999999';
      if (reason === 'invalid_cipher') outbox.encryptedCode = 'invalid';
      await service.sendReserved(outbox.id);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(outbox.encryptedCode).toBeNull();
      expect(challenge.consumedAt).toBeInstanceOf(Date);
    },
  );
  it('reports failures without exposing codes and reconciles a timeout under the lock', async () => {
    repository.status.mockResolvedValue({ status: 'uncertain' });
    repository.cancel.mockResolvedValue(false);
    await expect(service.issue(challenge.phoneDigits)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(repository.cancel).toHaveBeenCalledTimes(1);
  });
  it('cancels pending delivery after 30 seconds, but honors an in-flight acceptance', async () => {
    jest.useFakeTimers();
    repository.status.mockResolvedValue({ status: 'pending' });
    repository.cancel.mockResolvedValue(true);
    const pending = service.issue(challenge.phoneDigits);
    await jest.advanceTimersByTimeAsync(30_100);
    await expect(pending).resolves.toEqual({ challengeId: expect.any(String) });
    expect(repository.cancel).toHaveBeenCalledTimes(1);
  });
});
